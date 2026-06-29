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
import { getPortfolioSummary, getOpenPositions } from '../services/portfolio.js';
import { closePositionById } from '../services/treasury.js';
import { computeTpSlLevels } from '../services/treasury/risk.js';
import { priceData } from '../services/data-providers/registry.js';
import { logger } from '../logger.js';

let monitorJob: cron.ScheduledTask | null = null;
let backtestJob: cron.ScheduledTask | null = null;
let proofRetryJob: cron.ScheduledTask | null = null;
let watchReportJob: cron.ScheduledTask | null = null;
let heartbeatJob: cron.ScheduledTask | null = null;
let gasCheckJob: cron.ScheduledTask | null = null;
let tpSlCheckJob: cron.ScheduledTask | null = null;
let narrativeJob: cron.ScheduledTask | null = null;
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

// ── Hourly editorial dispatch ──────────────────────────────────
// Posts a single "what the agent is doing right now" message to
// the public Telegram channel every hour. Voice = editorial
// dispatch, not sysadmin status. Leads with the top thesis,
// shows repo velocity, surfaces book state. Drops the redundant
// /monitors link and the "HCS-timestamped" infra noise.

/**
 * Build the "agent is operating" activity line for the quiet-hour
 * heartbeat: news items reviewed, next macro event, watched assets.
 * Returns null when there is nothing to surface (e.g. SoSoValue not
 * configured and no watched assets) so the caller can skip it.
 */
async function buildQuietScanActivity(): Promise<string | null> {
  const parts: string[] = [];

  // Watched assets — the public watchlist, always available.
  const { rows: watched } = await query<{ asset: string }>(
    `SELECT DISTINCT m.asset_mapping->>'coingeckoId' AS asset
       FROM monitors m
      WHERE m.url NOT LIKE 'narrative:%'
        AND m.asset_mapping->>'coingeckoId' IS NOT NULL
      ORDER BY 1`,
  );
  const assetList = watched.map((r) => (r.asset ?? '').toUpperCase()).filter(Boolean);

  // SoSoValue news + macro — best-effort, only when configured.
  let newsCount = 0;
  let nextMacro: string | null = null;
  if (process.env.SOSO_VALUE_API_KEY) {
    try {
      const { getNewsFeed, getMacroEvents } =
        await import('../services/data-providers/sosovalue/index.js');
      const feed = await getNewsFeed({ pageSize: 1 });
      newsCount = feed?.total ?? 0;
      const events = await getMacroEvents();
      // Next upcoming event = first day with date >= today.
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = events.find((d) => d.date >= today);
      nextMacro = upcoming ? `${upcoming.date}: ${upcoming.events[0] ?? 'macro event'}` : null;
    } catch (err) {
      logger.warn({ err }, 'heartbeat: sosovalue scan-activity fetch failed (non-blocking)');
    }
  }

  if (newsCount > 0) parts.push(`📰 ${newsCount} news items reviewed`);
  if (nextMacro) parts.push(`📅 next macro: ${nextMacro}`);
  if (assetList.length > 0) parts.push(`👁 watching: ${assetList.join(', ')}`);

  return parts.length > 0 ? parts.join(' · ') : null;
}

async function sendPipelineHeartbeat(): Promise<void> {
  if (heartbeatRunning || !config.telegram.botToken || !config.telegram.publicChannelId) return;
  heartbeatRunning = true;
  try {
    const [
      { rows: topThoughts },
      { rows: repoActivity },
      { rows: signals24h },
      portfolioSummary,
      openPositions,
    ] = await Promise.all([
      // Top thesis in last 24h — by conviction, falling back to most-recent.
      query<{
        conviction: number;
        thesis: string;
        asset: string | null;
        recommended_action: string;
      }>(
        `SELECT a.conviction,
                LEFT(a.thesis, 180) AS thesis,
                m.asset_mapping->>'coingeckoId' AS asset,
                a.recommended_action
           FROM agent_scores a
           JOIN signals s ON s.id = a.signal_id
           JOIN monitors m ON m.id = s.monitor_id
          WHERE a.created_at > now() - interval '24 hours'
          ORDER BY a.conviction DESC, a.created_at DESC
          LIMIT 1`,
      ),
      // Repo velocity — commits seen in the last 24h, top 3.
      query<{ url: string; commits: string }>(
        `SELECT m.url, COUNT(s.id)::text AS commits
           FROM monitors m
           LEFT JOIN signals s
             ON s.monitor_id = m.id
            AND s.detected_at > now() - interval '24 hours'
            AND NOT s.is_heartbeat
          WHERE m.status = 'active'
          GROUP BY m.id, m.url
         HAVING COUNT(s.id) > 0
          ORDER BY COUNT(s.id) DESC
          LIMIT 3`,
      ),
      query<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM signals WHERE detected_at > now() - interval '24 hours' AND NOT is_heartbeat",
      ),
      getPortfolioSummary(),
      getOpenPositions(),
    ]);

    const top = topThoughts[0];
    const sigCount = parseInt(signals24h[0]?.c ?? '0', 10);

    // Lead: agent posture as a verb. Falls through to "watching"
    // when there's no scored signal in the last 24h. The quiet
    // branch surfaces scan activity (news reviewed, macro calendar,
    // watched assets) so the channel reads as "the agent is
    // operating" rather than "the agent is doing nothing".
    const lines: string[] = [];
    if (top) {
      const action = top.recommended_action.toUpperCase();
      const asset = top.asset ?? 'watchlist';
      lines.push(
        `🛡️ LENITNES · ${asset.toUpperCase()} ${action} · conviction ${top.conviction}/100`,
      );
      lines.push('');
      lines.push(`💭 ${top.thesis}`);
    } else {
      lines.push(`🛡️ LENITNES · watching · ${sigCount} signals scanned (24h)`);
      lines.push('');
      lines.push(`💭 No conviction above threshold — quiet hour.`);
      // Prove the agent is operating, not idle: how many news items
      // it reviewed this hour, the next macro event on the calendar,
      // and the assets it's watching. Best-effort — a SoSoValue
      // failure just drops these lines.
      const scanActivity = await buildQuietScanActivity();
      if (scanActivity) {
        lines.push('');
        lines.push(scanActivity);
      }
    }
    lines.push('');

    // Watchlist velocity — only when something fired today.
    if (repoActivity.length > 0) {
      lines.push(`📊 Watchlist (24h)`);
      for (const r of repoActivity) {
        const repo = r.url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/.*$/, '');
        lines.push(`   ${repo} · ${r.commits} signal(s)`);
      }
      lines.push('');
    }

    // Book state — number of opens, oldest age, realized PnL.
    const openCount = portfolioSummary.total_open_positions;
    const closedCount = portfolioSummary.total_closed_positions;
    const realized = portfolioSummary.realized_pnl_usd;
    const unrealized = portfolioSummary.unrealized_pnl_usd;
    const realizedLine =
      closedCount > 0
        ? `${realized >= 0 ? '+' : ''}$${realized.toFixed(2)} realized · ${closedCount} closed`
        : '0 closed';
    const unrealizedLine =
      openCount > 0 ? `${unrealized >= 0 ? '+' : ''}$${unrealized.toFixed(2)} unrealized` : '';
    lines.push(`💼 Book · ${openCount} open · ${realizedLine}`);
    if (unrealizedLine) lines.push(`   ${unrealizedLine}`);

    if (openPositions.length > 0) {
      const oldest = openPositions.reduce(
        (acc, p) => (p.opened_at < acc.opened_at ? p : acc),
        openPositions[0],
      );
      const ageHrs = Math.round((Date.now() - new Date(oldest.opened_at).getTime()) / 3_600_000);
      lines.push(`   oldest: ${oldest.asset} · ${ageHrs}h`);
      // Surface the safety state so readers know whether positions
      // have auto-close armed.
      const armed = openPositions.filter(
        (p) => p.take_profit_price != null || p.stop_loss_price != null,
      ).length;
      if (armed < openPositions.length) {
        lines.push(`   ⚠ ${openPositions.length - armed} position(s) without TP/SL`);
      }
    }
    lines.push('');
    lines.push(`🔗 ${config.webOrigin}/scorecard`);

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
        `🛡️ LENITNES · gas low · ${balanceBnb.toFixed(4)} BNB (floor ${thresholdBnb.toFixed(4)})`,
        ``,
        `Trading will pause once the wallet can't cover swap gas.`,
        `🔗 https://testnet.bscscan.com/address/${BSC_TREASURY_WALLET}`,
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

// ── TP/SL backfill ────────────────────────────────────────────────
// Self-healing: any open position missing TP/SL levels gets them
// derived from entry_price_usd + conviction_at_open at the top of
// every TP/SL tick. Two cases we want this to catch:
//   1. The 5 positions opened before the at-open TP/SL writes
//      landed — they have conviction but no levels.
//   2. Any future position that somehow opens without levels
//      (shouldn't happen, but defense in depth).
//
// For positions also missing entry_price_usd, we fetch the
// historical CoinGecko price for opened_at first, then derive.
// A failed price lookup just defers the backfill to the next
// tick — never throws, never blocks the TP/SL check below.
async function backfillMissingTpSl(): Promise<void> {
  const { rows: needsBackfill } = await query<{
    id: string;
    asset: string;
    direction: string;
    entry_price_usd: string | null;
    opened_at: string;
    conviction_at_open: number | null;
  }>(
    `SELECT id, asset, direction, entry_price_usd::text, opened_at::text, conviction_at_open
       FROM positions
      WHERE status = 'open'
        AND conviction_at_open IS NOT NULL
        AND (take_profit_price IS NULL OR stop_loss_price IS NULL)`,
  );

  if (needsBackfill.length === 0) return;

  let filled = 0;
  for (const pos of needsBackfill) {
    try {
      let entryPrice = pos.entry_price_usd ? parseFloat(pos.entry_price_usd) : null;

      // Backfill entry_price_usd first if missing — same path the
      // portfolio service uses on read.
      if (entryPrice == null) {
        entryPrice = await priceData.getPriceAt(pos.asset, new Date(pos.opened_at));
        if (entryPrice == null) continue;
        await query(`UPDATE positions SET entry_price_usd = $2 WHERE id = $1`, [
          pos.id,
          entryPrice,
        ]);
      }

      const side = pos.direction === 'short' ? 'short' : 'long';
      const levels = computeTpSlLevels(entryPrice, pos.conviction_at_open!, side);
      await query(
        `UPDATE positions
            SET take_profit_price = COALESCE(take_profit_price, $2),
                stop_loss_price   = COALESCE(stop_loss_price,   $3)
          WHERE id = $1`,
        [pos.id, levels.takeProfitUsd, levels.stopLossUsd],
      );
      filled++;
    } catch (err) {
      logger.warn({ err, positionId: pos.id }, 'TP/SL backfill failed for position');
    }
  }

  if (filled > 0) {
    logger.info({ filled, attempted: needsBackfill.length }, 'TP/SL backfill: filled positions');
  }
}

// ── TP/SL checker ─────────────────────────────────────────────────
// Every 5 minutes, scan open positions that have take_profit_price or
// stop_loss_price set. Use the CoinGecko oracle for each asset's
// current USD price (the old PancakeSwap router query was actually
// returning WBNB→USDC, which is irrelevant to e.g. a BTC position).
// When a target is hit: close the position via closePositionById
// (paper-mode book-keeping for now; the live-mode swap is a
// follow-up tied to the asset-registry roll-out), then broadcast.
async function checkTakeProfitStopLoss(): Promise<void> {
  try {
    // Self-heal first — any position missing levels gets them now,
    // so this same tick can immediately check them.
    await backfillMissingTpSl();

    const { rows: positions } = await query<{
      id: string;
      asset: string;
      chain: string;
      direction: string;
      entry_amount: string;
      entry_price_usd: string | null;
      take_profit_price: string | null;
      stop_loss_price: string | null;
      opened_at: string;
    }>(
      `SELECT id, asset, chain, direction,
              entry_amount::text, entry_price_usd::text,
              take_profit_price::text, stop_loss_price::text,
              opened_at::text
         FROM positions
        WHERE status = 'open'
          AND (take_profit_price IS NOT NULL OR stop_loss_price IS NOT NULL)`,
    );

    if (positions.length === 0) return;

    // Deduplicate price lookups across positions sharing the same
    // asset. CoinGecko free tier is rate-limited; one fetch per
    // distinct asset keeps the cycle cheap.
    const uniqueAssets = Array.from(new Set(positions.map((p) => p.asset)));
    const now = new Date();
    const priceMap = new Map<string, number>();
    await Promise.all(
      uniqueAssets.map(async (asset) => {
        const p = await priceData.getPriceAt(asset, now);
        if (p != null) priceMap.set(asset, p);
      }),
    );

    interface Hit {
      id: string;
      asset: string;
      side: 'TP' | 'SL';
      currentPrice: number;
      targetPrice: number;
      pnlUsd: number | null;
    }
    const hits: Hit[] = [];

    for (const pos of positions) {
      const currentPrice = priceMap.get(pos.asset);
      if (currentPrice == null) continue;

      const tp = pos.take_profit_price ? parseFloat(pos.take_profit_price) : null;
      const sl = pos.stop_loss_price ? parseFloat(pos.stop_loss_price) : null;
      const side = pos.direction === 'short' ? 'short' : 'long';

      // Long: TP above, SL below. Short: TP below, SL above.
      let hit: { kind: 'TP' | 'SL'; target: number } | null = null;
      if (side === 'long') {
        if (tp != null && currentPrice >= tp) hit = { kind: 'TP', target: tp };
        else if (sl != null && currentPrice <= sl) hit = { kind: 'SL', target: sl };
      } else {
        if (tp != null && currentPrice <= tp) hit = { kind: 'TP', target: tp };
        else if (sl != null && currentPrice >= sl) hit = { kind: 'SL', target: sl };
      }
      if (!hit) continue;

      // Close the position. Book-keeping path: writes exit_price_usd
      // and computes realized PnL. Live-mode swap is wired in a
      // follow-up; for now the operator gets the alert and the
      // position is marked closed so it doesn't re-trigger.
      const closeResult = await closePositionById(
        pos.id,
        currentPrice,
        hit.kind === 'TP' ? 'take_profit' : 'stop_loss',
      );

      hits.push({
        id: pos.id,
        asset: pos.asset,
        side: hit.kind,
        currentPrice,
        targetPrice: hit.target,
        pnlUsd: closeResult.pnlUsd,
      });
    }

    if (hits.length > 0) {
      const totalPnl = hits.reduce((acc, h) => acc + (h.pnlUsd ?? 0), 0);
      const pnlLabel =
        totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`;
      const lines: string[] = [
        `🛡️ LENITNES · ${hits.length === 1 ? 'position closed' : `${hits.length} positions closed`} · ${pnlLabel}`,
        ``,
      ];
      for (const h of hits) {
        const reason = h.side === 'TP' ? 'take-profit' : 'stop-loss';
        const pnl = h.pnlUsd != null ? ` · ${h.pnlUsd >= 0 ? '+' : ''}$${h.pnlUsd.toFixed(2)}` : '';
        lines.push(
          `   ${h.asset.toUpperCase()} · ${reason} · @ $${h.currentPrice.toFixed(2)}${pnl}`,
        );
      }
      lines.push(``);
      lines.push(`🔗 ${config.webOrigin}/portfolio`);
      await sendTelegram(config.telegram.publicChannelId, lines.join('\n'));
      logger.info({ hits: hits.length }, 'TP/SL targets hit — positions closed and alert sent');
    }
  } catch (err) {
    logger.error({ err }, 'TP/SL check failed');
  }
}

export function startScheduler(): void {
  logger.info(
    'scheduler started — monitors every 30s, backtest every 6h, proof retries every 2m, watch report daily at 09:00, heartbeat hourly, gas check every 6h, TP/SL check every 5m, narrative scan every 2h',
  );
  monitorJob = cron.schedule('*/30 * * * * *', scanAndEnqueue);
  backtestJob = cron.schedule('0 */6 * * *', runBacktest);
  proofRetryJob = cron.schedule('*/2 * * * *', retryFailedProofs);
  watchReportJob = cron.schedule('0 9 * * *', sendDailyWatchReport);
  heartbeatJob = cron.schedule('0 * * * *', sendPipelineHeartbeat);
  gasCheckJob = cron.schedule('0 */6 * * *', checkGasBalance);
  tpSlCheckJob = cron.schedule('*/5 * * * *', checkTakeProfitStopLoss);
  // Cross-signal narrative synthesis (v3) — strings commits across
  // repos + SoSoValue news into a single tradeable thesis. No-ops
  // when the cluster is quiet, so it costs nothing on dead hours.
  narrativeJob = cron.schedule('0 */2 * * *', () =>
    import('../services/agent/narrative.js').then((m) => m.runNarrativeScan()),
  );
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
  if (narrativeJob) {
    narrativeJob.stop();
    narrativeJob = null;
  }
}
