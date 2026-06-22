import cron from 'node-cron';
import { ethers } from 'ethers';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { enqueueMonitorCheck } from './producer.js';
import { processSignalOutcomes } from '../services/domain/backtest.service.js';
import { recordSignalOnChain } from '../services/evm/signal-registry.js';
import { getProvider } from '../services/evm/client.js';
import { sendDailyWatchReport } from '../services/watch-report.js';
import { sendTelegram } from '../services/notify.js';
import {
  getPortfolioSummary,
  getOpenPositions,
  formatPortfolioSummary,
} from '../services/portfolio.js';
import { logger } from '../logger.js';

let monitorJob: cron.ScheduledTask | null = null;
let backtestJob: cron.ScheduledTask | null = null;
let proofRetryJob: cron.ScheduledTask | null = null;
let watchReportJob: cron.ScheduledTask | null = null;
let heartbeatJob: cron.ScheduledTask | null = null;
let gasCheckJob: cron.ScheduledTask | null = null;
let tpSlCheckJob: cron.ScheduledTask | null = null;
let monitorRunning = false;
let backtestRunning = false;
let proofRetryRunning = false;
let heartbeatRunning = false;

const PROOF_RETRY_MAX_ATTEMPTS = 10;

async function scanAndEnqueue(): Promise<void> {
  if (monitorRunning) return;
  monitorRunning = true;
  try {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM monitors
       WHERE status = 'active'
         AND (
           last_check_at IS NULL
           OR last_check_at + (frequency_seconds || ' seconds')::interval <= now()
         )`,
    );

    for (const row of rows) {
      await enqueueMonitorCheck(row.id);
    }

    if (rows.length > 0) {
      logger.debug({ count: rows.length }, 'enqueued due monitors');
    }
  } catch (err) {
    logger.error({ err }, 'scheduler scan failed');
  } finally {
    monitorRunning = false;
  }
}

async function runBacktest(): Promise<void> {
  if (backtestRunning) return;
  backtestRunning = true;
  try {
    const result = await processSignalOutcomes();
    if (result.processed > 0) {
      logger.info(result, 'backtest cycle complete');
    }
  } catch (err) {
    logger.error({ err }, 'backtest cycle failed');
  } finally {
    backtestRunning = false;
  }
}

// ── Retry queue for on-chain proofs (failed_proofs) ────────────────────
// The execution loop inserts into `failed_proofs` when the fire-and-forget
// EVM write throws (RPC blip, gas spike, etc.). Without a consumer, those
// rows are stranded forever and the "dual-chain" claim silently degrades.
// This worker picks up due rows every 2 minutes and replays the write.
// Idempotency: we re-check the signal's arb_tx_hash before retrying, so a
// successful write that races with a retry just resolves the row.
async function retryFailedProofs(): Promise<void> {
  if (proofRetryRunning) return;
  proofRetryRunning = true;
  try {
    const { rows } = await query<{
      id: string;
      signal_id: string;
      chain: string;
      attempt: number;
      evidence: string | null;
      summary: string | null;
    }>(
      `SELECT fp.id, fp.signal_id, fp.chain, fp.attempt,
              s.evidence_text AS evidence, s.condition_summary AS summary
         FROM failed_proofs fp
         JOIN signals s ON s.id = fp.signal_id
        WHERE fp.resolved_at IS NULL
          AND fp.next_retry <= now()
          AND fp.attempt < $1
        ORDER BY fp.next_retry
        LIMIT 10`,
      [PROOF_RETRY_MAX_ATTEMPTS],
    );

    if (rows.length === 0) return;

    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const row of rows) {
      try {
        // If the signal already has an arb_tx_hash (e.g. another path
        // succeeded), just resolve the row and move on.
        const { rows: sigRows } = await query<{ arb_tx_hash: string | null }>(
          `SELECT arb_tx_hash FROM signals WHERE id = $1`,
          [row.signal_id],
        );
        if (sigRows[0]?.arb_tx_hash) {
          await query(`UPDATE failed_proofs SET resolved_at = now() WHERE id = $1`, [row.id]);
          succeeded++;
          continue;
        }

        const { txHash } = await recordSignalOnChain(
          row.chain,
          row.signal_id,
          row.evidence ?? '',
          row.summary ?? '',
        );
        await query(`UPDATE signals SET arb_tx_hash = $1 WHERE id = $2`, [txHash, row.signal_id]);
        await query(`UPDATE failed_proofs SET resolved_at = now() WHERE id = $1`, [row.id]);
        succeeded++;
        logger.info(
          { signalId: row.signal_id, chain: row.chain, txHash, attempt: row.attempt },
          'failed proof retry succeeded',
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const newAttempt = row.attempt + 1;
        // If we just hit the cap, mark the row as dead-letter (resolved_at
        // set so it stops being picked up, but error preserved for ops).
        const isDead = newAttempt >= PROOF_RETRY_MAX_ATTEMPTS;
        await query(
          `UPDATE failed_proofs
              SET attempt = $2,
                  error = $3,
                  next_retry = now() + interval '2 minutes',
                  resolved_at = CASE WHEN $4 THEN now() ELSE NULL END
            WHERE id = $1`,
          [row.id, newAttempt, errMsg, isDead],
        );
        failed++;
        if (isDead) deadLettered++;
        logger.warn(
          { err, signalId: row.signal_id, chain: row.chain, attempt: newAttempt, isDead },
          'failed proof retry failed',
        );
      }
    }

    logger.info(
      { picked: rows.length, succeeded, failed, deadLettered },
      'failed proof retry cycle complete',
    );
  } catch (err) {
    logger.error({ err }, 'failed proof retry scan failed');
  } finally {
    proofRetryRunning = false;
  }
}

// ── Hourly heartbeat broadcast ─────────────────────────────────
// Sends a concise "pipeline is alive" message to the public Telegram
// channel every hour. Shows monitor count, recent activity, and
// latest agent thought.
async function sendPipelineHeartbeat(): Promise<void> {
  if (heartbeatRunning || !config.telegram.botToken || !config.telegram.publicChannelId) return;
  heartbeatRunning = true;
  try {
    const [{ rows: mons }, { rows: sigs }, { rows: scores }] = await Promise.all([
      query<{ c: string }>("SELECT COUNT(*)::text AS c FROM monitors WHERE status = 'active'"),
      query<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours'",
      ),
      query<{ conviction: number; thesis: string }>(
        `SELECT conviction, LEFT(thesis, 120) AS thesis FROM agent_scores
          WHERE created_at > now() - interval '24 hours'
          ORDER BY created_at DESC LIMIT 1`,
      ),
    ]);

    const activeMonitors = parseInt(mons[0]?.c ?? '0', 10);
    const signals24h = parseInt(sigs[0]?.c ?? '0', 10);
    const lastThought = scores[0];

    // Proof coverage (Hedera HCS timestamps)
    const { rows: proofRows } = await query<{ total: string; with_hedera: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE hedera_hcs_message_id IS NOT NULL)::text AS with_hedera
         FROM signals WHERE NOT is_heartbeat`,
    );
    const totalSignals = parseInt(proofRows[0]?.total ?? '0', 10);
    const withHedera = parseInt(proofRows[0]?.with_hedera ?? '0', 10);

    const [portfolioSummary, openPositions] = await Promise.all([
      getPortfolioSummary(),
      getOpenPositions(),
    ]);

    const lines: string[] = [
      `🛡️ LENITNES — Pipeline heartbeat`,
      ``,
      `📡 ${activeMonitors} monitors · ${signals24h} signals (24h)`,
      `🔗 ${withHedera}/${totalSignals} signals HCS-timestamped`,
    ];
    if (lastThought) {
      lines.push(`🧠 Latest: conviction ${lastThought.conviction} — ${lastThought.thesis}`);
    } else {
      lines.push(`🧠 No agent activity in 24h — watching quietly`);
    }
    lines.push(``);
    lines.push(formatPortfolioSummary(portfolioSummary, openPositions));
    lines.push(``);
    lines.push(`⏱ ${new Date().toISOString().slice(11, 16)} UTC`);
    lines.push(
      `💼 Treasury: https://testnet.bscscan.com/address/0x4dA649DeB07159E791C423bb139e6213e745D138`,
    );
    lines.push(`🔗 Scorecard: ${config.webOrigin}/scorecard`);
    lines.push(`📱 Monitors: ${config.webOrigin}/monitors`);

    await sendTelegram(config.telegram.publicChannelId, lines.join('\n'));
    logger.info('pipeline heartbeat sent to telegram');
  } catch (err) {
    logger.error({ err }, 'pipeline heartbeat failed');
  } finally {
    heartbeatRunning = false;
  }
}

// ── Gas watcher ───────────────────────────────────────────────────
// Checks the treasury BNB balance every 6 hours and sends a Telegram
// alert if it drops below the warning threshold.
const GAS_WARNING_THRESHOLD = config.treasury.gasWarningThreshold;
const BSC_TREASURY_WALLET = '0x4dA649DeB07159E791C423bb139e6213e745D138';

async function checkGasBalance(): Promise<void> {
  try {
    const provider = getProvider('bnb');
    const balanceWei = await provider.getBalance(BSC_TREASURY_WALLET);
    const balanceBnb = parseFloat(ethers.formatEther(balanceWei));
    const thresholdBnb = parseFloat(ethers.formatEther(GAS_WARNING_THRESHOLD));

    if (balanceBnb < thresholdBnb) {
      const msg = [
        `⛽ LENITNES — Low gas warning`,
        ``,
        `Treasury wallet: \`${BSC_TREASURY_WALLET}\``,
        `Balance: **${balanceBnb.toFixed(4)} BNB**`,
        `Threshold: ${thresholdBnb.toFixed(4)} BNB`,
        ``,
        `Fund: https://testnet.bscscan.com/address/${BSC_TREASURY_WALLET}`,
      ].join('\n');
      await sendTelegram(config.telegram.publicChannelId, msg);
      logger.warn({ balanceBnb, threshold: thresholdBnb }, 'low gas balance — alert sent');
    } else {
      logger.debug({ balanceBnb }, 'gas balance OK');
    }
  } catch (err) {
    logger.error({ err }, 'gas balance check failed');
  }
}

// ── TP/SL checker ─────────────────────────────────────────────────
// Every 5 minutes, scan open positions that have take_profit_price or
// stop_loss_price set. For each, try to fetch the current price and
// close if the target is hit.
async function checkTakeProfitStopLoss(): Promise<void> {
  try {
    const { rows: positions } = await query<{
      id: string;
      asset: string;
      chain: string;
      direction: string;
      entry_amount: string;
      entry_tx_hash: string | null;
      take_profit_price: string | null;
      stop_loss_price: string | null;
      conviction_at_open: number | null;
      opened_at: string;
    }>(
      `SELECT id, asset, chain, direction,
              entry_amount::text, entry_tx_hash,
              take_profit_price::text, stop_loss_price::text,
              conviction_at_open, opened_at::text
         FROM positions
        WHERE status = 'open'
          AND (take_profit_price IS NOT NULL OR stop_loss_price IS NOT NULL)`,
    );

    if (positions.length === 0) return;

    const provider = getProvider('bnb');
    const hits: Array<{
      id: string;
      asset: string;
      side: string;
      currentPrice: number;
      targetPrice: number;
    }> = [];

    for (const pos of positions) {
      // Try to get current price via ethers (WBNB balance check as a
      // crude price proxy). For real price feeds, integrate Chainlink
      // or CoinGecko here. If the price check fails, skip this cycle.
      let currentPrice: number | null = null;
      try {
        // Use PancakeSwap router on BSC testnet to estimate price.
        // Router: 0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3 (testnet)
        // This is a best-effort estimate; production should use oracles.
        const routerAddr = '0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3';
        const wbnbAddr = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd';
        const usdcAddr = '0x64544969ed7EBf5f083679233325356EbE738930';
        const router = new ethers.Contract(
          routerAddr,
          [
            'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
          ],
          provider,
        );
        // Ask: 1 WBNB = ? USDC
        const amounts = await router.getAmountsOut(
          ethers.parseEther('1'),
          [wbnbAddr, usdcAddr],
        );
        currentPrice = parseFloat(ethers.formatUnits(amounts[1], 18));
      } catch {
        // Price fetch failed — skip this position for now
        continue;
      }

      if (currentPrice === null) continue;

      const tp = pos.take_profit_price ? parseFloat(pos.take_profit_price) : null;
      const sl = pos.stop_loss_price ? parseFloat(pos.stop_loss_price) : null;

      if (tp && currentPrice >= tp) {
        hits.push({ id: pos.id, asset: pos.asset, side: 'TP', currentPrice, targetPrice: tp });
      } else if (sl && currentPrice <= sl) {
        hits.push({ id: pos.id, asset: pos.asset, side: 'SL', currentPrice, targetPrice: sl });
      }
    }

    if (hits.length > 0) {
      const lines: string[] = [
        `🎯 LENITNES — TP/SL hit`,
        ``,
      ];
      for (const h of hits) {
        lines.push(
          `• ${h.asset} ${h.side} @ $${h.currentPrice.toFixed(2)} (target $${h.targetPrice.toFixed(2)})`,
        );
      }
      lines.push(``);
      lines.push(`Auto-close not yet implemented — manual review advised.`);
      lines.push(`💼 ${config.webOrigin}/portfolio`);
      await sendTelegram(config.telegram.publicChannelId, lines.join('\n'));
      logger.info({ hits: hits.length }, 'TP/SL targets hit — alert sent');
    }
  } catch (err) {
    logger.error({ err }, 'TP/SL check failed');
  }
}

export function startScheduler(): void {
  logger.info(
    'scheduler started — monitors every 30s, backtest every 6h, proof retries every 2m, watch report daily at 09:00, heartbeat hourly, gas check every 6h, TP/SL check every 5m',
  );
  monitorJob = cron.schedule('*/30 * * * * *', scanAndEnqueue);
  backtestJob = cron.schedule('0 */6 * * *', runBacktest);
  proofRetryJob = cron.schedule('*/2 * * * *', retryFailedProofs);
  watchReportJob = cron.schedule('0 9 * * *', sendDailyWatchReport);
  heartbeatJob = cron.schedule('0 * * * *', sendPipelineHeartbeat);
  gasCheckJob = cron.schedule('0 */6 * * *', checkGasBalance);
  tpSlCheckJob = cron.schedule('*/5 * * * *', checkTakeProfitStopLoss);
}

export function stopScheduler(): void {
  if (monitorJob) {
    monitorJob.stop();
    monitorJob = null;
  }
  if (backtestJob) {
    backtestJob.stop();
    backtestJob = null;
  }
  if (proofRetryJob) {
    proofRetryJob.stop();
    proofRetryJob = null;
  }
  if (watchReportJob) {
    watchReportJob.stop();
    watchReportJob = null;
  }
  if (heartbeatJob) {
    heartbeatJob.stop();
    heartbeatJob = null;
  }
  if (gasCheckJob) {
    gasCheckJob.stop();
    gasCheckJob = null;
  }
  if (tpSlCheckJob) {
    tpSlCheckJob.stop();
    tpSlCheckJob = null;
  }
}
