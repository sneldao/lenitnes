import pLimit from 'p-limit';
import { query, withTransaction } from '../db/pool.js';
import { config } from '../config.js';
import type { Monitor, Rule, TinyFishResult } from '@lenitnes/types';
import * as tinyfish from '../services/tinyfish.js';
import * as scraper from '../services/scraper.js';
import * as ipfs from '../services/ipfs.js';
import * as kraken from '../services/kraken.js';
import * as notify from '../services/notify.js';
import { decrypt } from '../services/crypto.js';
import { getProofService } from '../services/proof.js';
import { isCircuitOpen, recordSuccess, recordFailure } from '../services/circuit.js';
import { incCounter } from '../middleware/metrics.js';
import { logger } from '../logger.js';
import { tradeConfigSchema } from '../validation/index.js';
import { runDetectors } from '../services/detectors/registry.js';
import { executeEvmTrade } from '../services/evm/trade.js';
import { recordSignalOnChain } from '../services/evm/signal-registry.js';
import { resolveTokenAddress } from '../services/evm/tokens.js';
import { FEATURES } from '../features.js';

// ─────────────────────────────────────────────────────────────
// Monitor execution loop — the heart of LENITNES.
// One pass over every monitor that is due for a check.
// ─────────────────────────────────────────────────────────────

/** Select monitors whose next check is due based on frequency + last_check_at. */
async function dueMonitors(): Promise<Monitor[]> {
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors
     WHERE status = 'active'
       AND (
         last_check_at IS NULL
         OR last_check_at + (frequency_seconds || ' seconds')::interval <= now()
       )`,
  );
  return rows;
}

const CONCURRENCY = 5;
const limit = pLimit(CONCURRENCY);

export async function runDueChecks(): Promise<void> {
  const monitors = await dueMonitors();
  await Promise.all(
    monitors.map((monitor) =>
      limit(() =>
        executeCheck(monitor).catch((err) => {
          logger.error({ err, monitorId: monitor.id }, 'monitor check failed');
        }),
      ),
    ),
  );
}

export interface CheckMetadata {
  checkMethod: 'tinyfish' | 'tinyfish-fetch' | 'scraper-fallback';
  circuitOpen: boolean;
  githubCommitsFetched: number;
  confidence: number;
  confidenceThreshold: number;
  thresholdBlocked: boolean;
  classifications?: Array<{
    type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
}

export async function executeCheck(
  monitor: Monitor,
  opts: { skipDebit?: boolean } = {},
): Promise<{
  signalId: string | null;
  conditionMet: boolean;
  isHeartbeat: boolean;
  summary: string | null;
  metadata: CheckMetadata;
}> {
  const proof = getProofService();
  const cost = Number(monitor.cost_per_check) || config.hedera.defaultCostPerCheck;
  const isPaid = !opts.skipDebit;

  let debitTxId = 'x402-on-demand';
  const circuitOpts = { name: 'tinyfish', threshold: 5, windowMs: 60_000, cooldownMs: 300_000 };

  // ── 1) Atomic balance debit (outside transaction) ─────────────────
  if (isPaid) {
    const { rowCount } = await query(
      `UPDATE monitors SET hbar_balance = hbar_balance - $1,
         status = CASE WHEN hbar_balance - $1 < 0 THEN 'insufficient_balance' ELSE status END
       WHERE id = $2 AND hbar_balance >= $1`,
      [cost, monitor.id],
    );
    if (!rowCount) {
      await query(`UPDATE monitors SET status = 'insufficient_balance' WHERE id = $1`, [
        monitor.id,
      ]);
      logger.warn({ monitorId: monitor.id }, 'monitor paused: insufficient balance');
      return {
        signalId: null,
        conditionMet: false,
        isHeartbeat: false,
        summary: null,
        metadata: {
          checkMethod: 'scraper-fallback',
          circuitOpen: false,
          githubCommitsFetched: 0,
          confidence: 0,
          confidenceThreshold: monitor.confidence_threshold,
          thresholdBlocked: false,
        },
      };
    }

    // External proof call — record the debit on-ledger.
    const debit = await proof.debitPerCheckFee!({
      fromAccountId: monitor.escrow_account_id ?? config.hedera.treasuryId,
      amountHbar: cost,
    });
    debitTxId = debit.hederaTxId;
  }

  // ── 2) Three-tier scraping: Fetch (free) → Agent (credits) → scraper ─────
  let result: TinyFishResult;
  const agentCircuitOpen = isCircuitOpen(circuitOpts);
  let checkMethod: 'tinyfish' | 'tinyfish-fetch' | 'scraper-fallback' = 'tinyfish-fetch';

  // Tier 1: Fetch API (free, Chromium-rendered page content)
  try {
    const fetchedPage = await tinyfish.fetchPage(monitor.url);
    result = scraper.analyzeContent(fetchedPage.content, monitor.condition_text, 'tinyfish-fetch');
    recordSuccess(circuitOpts);
    logger.debug({ monitorId: monitor.id, confidence: result.confidence }, 'Fetch API succeeded');
  } catch (err) {
    logger.warn({ err, monitorId: monitor.id }, 'Fetch API failed, trying Agent fallback');

    // Tier 2: Agent API (credits, full NL evaluation)
    if (agentCircuitOpen) {
      logger.warn({ monitorId: monitor.id }, 'Agent circuit open — using scraper fallback');
      result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
      checkMethod = 'scraper-fallback';
      incCounter('tinyfish_errors_total', { fallback: 'scraper' });
    } else {
      try {
        result = await tinyfish.runMonitorCheck({
          url: monitor.url,
          condition: monitor.condition_text,
          lastSeenCommitHash: monitor.last_seen_commit_hash,
          screenshots: monitor.screenshots_enabled,
        });
        checkMethod = 'tinyfish';
        recordSuccess(circuitOpts);
        logger.debug({ monitorId: monitor.id }, 'Agent API succeeded after Fetch failure');
      } catch (agentErr) {
        recordFailure(circuitOpts);
        incCounter('tinyfish_errors_total', { fallback: 'scraper' });
        logger.warn({ err: agentErr, monitorId: monitor.id }, 'Agent failed — scraper fallback');
        result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
        checkMethod = 'scraper-fallback';
      }
    }
  }

  // ── 3) DB mutations inside a transaction ──────────────────────────
  let signalId: string | null = null;
  let isHeartbeat: boolean;
  const summary: string | null = result.summary;

  try {
    const txResult = await withTransaction((client) =>
      executeCheckTransaction(client, {
        monitor,
        result,
        debitTxId,
        isPaid,
      }),
    );
    signalId = txResult.signalId;
    isHeartbeat = txResult.isHeartbeat;
  } catch (err) {
    logger.error({ err, monitorId: monitor.id }, 'monitor check transaction failed');

    // Compensating refund: if the debit was already charged, release escrow.
    if (isPaid) {
      try {
        await proof.releaseEscrow?.({
          toWalletAddress: monitor.escrow_account_id ?? config.hedera.treasuryId,
          amountHbar: cost,
        });
        logger.info(
          { monitorId: monitor.id, amountHbar: cost },
          'escrow released after failed transaction',
        );
      } catch (refundErr) {
        logger.error({ err: refundErr, monitorId: monitor.id }, 'failed to release escrow');
      }
    }

    return {
      signalId: null,
      conditionMet: false,
      isHeartbeat: false,
      summary: null,
      metadata: {
        checkMethod,
        circuitOpen: agentCircuitOpen,
        githubCommitsFetched: result.githubCommitsFetched ?? 0,
        confidence: result.confidence,
        confidenceThreshold: monitor.confidence_threshold,
        thresholdBlocked: false,
      },
    };
  }

  // ── 4) Post-commit: IPFS + HCS (best-effort) ──────────────────────
  if (!isHeartbeat && signalId) {
    try {
      const { cid } = await ipfs.uploadProofPackage({
        signalId,
        monitorId: monitor.id,
        detectedAt: new Date().toISOString(),
        url: monitor.url,
        condition: monitor.condition_text,
        tinyfishRunId: result.runId,
        evidence: result.evidence,
        summary: result.summary,
        screenshots: result.screenshots,
        hederaTxId: debitTxId,
      });

      const hcs = await proof.writeHcsMessage!({
        kind: 'signal',
        signalId,
        monitorId: monitor.id,
        ipfsCid: cid,
        ts: new Date().toISOString(),
      });

      await query(`UPDATE signals SET ipfs_cid = $1, hedera_hcs_message_id = $2 WHERE id = $3`, [
        cid,
        hcs.hederaTxId,
        signalId,
      ]);
    } catch (err) {
      logger.error({ err, monitorId: monitor.id, signalId }, 'post-commit IPFS/HCS write failed');
      // Intentional swallow — the signal row is already committed in the DB.
    }

    // Also write a heartbeat HCS message for the successful signal.
    try {
      await proof.writeHcsMessage!({
        kind: 'heartbeat',
        monitorId: monitor.id,
        ts: new Date().toISOString(),
        txRef: debitTxId,
      });
    } catch (err) {
      logger.error({ err, monitorId: monitor.id }, 'failed to write HCS heartbeat (best-effort)');
    }
  }

  // ── 4a) Record signal on Arbitrum (dual-chain proof, best-effort) ────────
  if (!isHeartbeat && signalId && FEATURES.evmProof) {
    recordSignalOnChain('arbitrum', signalId, result.evidence, result.summary)
      .then(({ txHash }) =>
        query(`UPDATE signals SET arb_tx_hash = $1 WHERE id = $2`, [txHash, signalId]),
      )
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ err, signalId }, 'Arbitrum proof recording failed — queued for retry');
        query(
          `INSERT INTO failed_proofs (signal_id, chain, error, next_retry)
           VALUES ($1, 'arbitrum', $2, now() + interval '2 minutes')`,
          [signalId, errMsg],
        ).catch((e) => logger.error({ err: e, signalId }, 'failed to write to failed_proofs'));
      });
  }

  // ── 4b) Run detector pipeline on new signals (best-effort) ─────────
  let classifications: Array<{ type: string; score: number; confidence: number; label: string }> =
    [];
  if (!isHeartbeat && signalId && result.commits && result.commits.length > 0) {
    try {
      const detectorResults = runDetectors({
        result,
        commits: result.commits,
        monitorUrl: monitor.url,
        monitorCondition: monitor.condition_text,
      });
      if (detectorResults.length > 0) {
        classifications = detectorResults.map((c) => ({
          type: c.type,
          score: c.score,
          confidence: c.confidence,
          label: c.label,
        }));
        await Promise.all(
          detectorResults.map((c) =>
            query(
              `INSERT INTO signal_classifications
               (signal_id, detector_type, score, confidence, label, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [signalId, c.type, c.score, c.confidence, c.label, JSON.stringify(c.metadata)],
            ),
          ),
        );
      }
    } catch (err) {
      logger.warn({ err, signalId }, 'detector pipeline failed (non-blocking)');
    }
  }

  // ── 4c) Search enrichment: find related context (free, best-effort) ───────
  if (!isHeartbeat && signalId && result.summary) {
    tinyfish
      .searchWeb(`${monitor.url} ${result.summary}`)
      .then((results) => {
        if (results.length > 0) {
          return query(`UPDATE signals SET search_results = $1 WHERE id = $2`, [
            JSON.stringify(results),
            signalId,
          ]);
        }
      })
      .catch((err) => {
        logger.warn({ err, signalId }, 'search enrichment failed (non-blocking)');
      });
  }

  // ── 5) Best-effort rule execution ─────────────────────────────────
  if (!isHeartbeat && signalId) {
    executeRules(monitor, signalId, result.summary).catch((err) => {
      logger.error({ err, monitorId: monitor.id }, 'rule execution error (best-effort)');
    });
  }

  return {
    signalId,
    conditionMet: !isHeartbeat,
    isHeartbeat,
    summary,
    metadata: {
      checkMethod,
      circuitOpen: agentCircuitOpen,
      githubCommitsFetched: result.githubCommitsFetched ?? 0,
      confidence: result.confidence,
      confidenceThreshold: monitor.confidence_threshold ?? 50,
      thresholdBlocked:
        result.conditionMet && result.confidence < (monitor.confidence_threshold ?? 50),
      ...(classifications.length > 0 ? { classifications } : {}),
    },
  };
}

// ── Transaction handler ──────────────────────────────────────

interface TxHandlerParams {
  monitor: Monitor;
  result: TinyFishResult;
  debitTxId: string;
  isPaid: boolean;
}

async function executeCheckTransaction(
  client: import('pg').PoolClient,
  params: TxHandlerParams,
): Promise<{ signalId: string | null; isHeartbeat: boolean }> {
  const { monitor, result, debitTxId, isPaid } = params;

  // Update last_check_at.
  await client.query(`UPDATE monitors SET last_check_at = now() WHERE id = $1`, [monitor.id]);

  // Track the newest commit hash so we only evaluate new commits next cycle.
  if (result.latestCommitHash) {
    await client.query(`UPDATE monitors SET last_seen_commit_hash = $1 WHERE id = $2`, [
      result.latestCommitHash,
      monitor.id,
    ]);
  }

  // If this was an on-demand check, write the heartbeat HCS message from inside the
  // transaction (the on-demand middleware already settled payment).
  if (!isPaid) {
    const proof = getProofService();
    await proof.writeHcsMessage!({
      kind: 'heartbeat',
      monitorId: monitor.id,
      ts: new Date().toISOString(),
      txRef: debitTxId,
    }).catch((err: unknown) => {
      logger.error(
        { err, monitorId: monitor.id },
        'failed to write on-demand heartbeat (best-effort)',
      );
    });
  }

  // No signal -> store a heartbeat row.
  if (!result.conditionMet) {
    const { rows: heartbeatRows } = await client.query<{ id: string }>(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)
       RETURNING id`,
      [monitor.id, result.runId, result.summary],
    );
    return { signalId: heartbeatRows[0]?.id ?? null, isHeartbeat: true };
  }

  // Condition met but confidence below threshold -> treat as heartbeat.
  const threshold = monitor.confidence_threshold ?? 50;
  if (result.confidence < threshold) {
    const { rows: heartbeatRows } = await client.query<{ id: string }>(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)
       RETURNING id`,
      [
        monitor.id,
        result.runId,
        `Confidence ${result.confidence} below threshold ${threshold}. ${result.summary}`,
      ],
    );
    return { signalId: heartbeatRows[0]?.id ?? null, isHeartbeat: true };
  }

  // Signal! Insert the signal row.
  const detectedAt = new Date().toISOString();
  const { rows: sigRows } = await client.query<{ id: string }>(
    `INSERT INTO signals
       (monitor_id, detected_at, hedera_tx_id, tinyfish_run_id, evidence_text,
        screenshot_urls, condition_summary, is_heartbeat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     RETURNING id`,
    [
      monitor.id,
      detectedAt,
      debitTxId,
      result.runId,
      result.evidence,
      JSON.stringify(result.screenshots),
      result.summary,
    ],
  );
  const signalId = sigRows[0].id;

  // Mark the monitor as triggered.
  await client.query(`UPDATE monitors SET status = 'triggered' WHERE id = $1`, [monitor.id]);

  return { signalId, isHeartbeat: false };
}

// ── Rule execution ───────────────────────────────────────────

async function executeRules(monitor: Monitor, signalId: string, summary: string): Promise<void> {
  const { rows: rules } = await query<Rule>(
    `SELECT * FROM rules WHERE monitor_id = $1 AND is_active = true`,
    [monitor.id],
  );

  for (const rule of rules) {
    if (!(await passesConditions(rule.conditions, signalId))) continue;

    try {
      switch (rule.action_type) {
        case 'trade':
          await executeTrade(monitor, rule, signalId);
          break;
        case 'webhook':
          await notify.sendWebhook(String(rule.action_config.url), {
            signalId,
            monitorId: monitor.id,
            summary,
          });
          break;
        case 'telegram':
          await notify.sendTelegram(
            String(rule.action_config.chatId),
            notify.formatSignalMessage({
              summary,
              monitorUrl: monitor.url,
              pair: rule.action_config.pair as string | undefined,
            }),
          );
          break;
        case 'email': {
          const proofUrl = signalId ? `${config.webOrigin}/proof/public/${signalId}` : null;
          const { subject, body } = notify.formatSignalEmail({
            summary,
            monitorUrl: monitor.url,
            proofUrl,
          });
          await notify.sendEmail(String(rule.action_config.to), subject, body);
          break;
        }
        case 'trade_dex': {
          const chain = (rule.action_config.chain as string) ?? 'arbitrum';
          const evmResult = await executeEvmTrade({
            chain,
            tokenIn: rule.action_config.tokenIn as string,
            tokenOut: rule.action_config.tokenOut as string,
            amountIn: rule.action_config.amountIn as string,
            slippageBps: rule.action_config.slippageBps as number | undefined,
          });
          await query(
            `INSERT INTO orders (signal_id, rule_id, order_params, status, chain, chain_tx_hash)
             VALUES ($1, $2, $3, 'filled', $4, $5)`,
            [signalId, rule.id, JSON.stringify(rule.action_config), chain, evmResult.txHash],
          );
          break;
        }
        case 'trade_stock': {
          const stockToken = rule.action_config.tokenOut as string;
          const stockAmount = rule.action_config.amountIn as string;
          const usdg = resolveTokenAddress('USDG', 'robinhood');
          if (!usdg) throw new Error('USDG not configured for Robinhood Chain');
          const stockResult = await executeEvmTrade({
            chain: 'robinhood',
            tokenIn: usdg,
            tokenOut: stockToken,
            amountIn: stockAmount,
          });
          await query(
            `INSERT INTO orders (signal_id, rule_id, order_params, status, chain, chain_tx_hash)
             VALUES ($1, $2, $3, 'filled', 'robinhood', $4)`,
            [signalId, rule.id, JSON.stringify(rule.action_config), stockResult.txHash],
          );
          break;
        }
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id, actionType: rule.action_type }, 'rule action failed');
    }
  }

  // ── Public feed: post to Telegram channel if monitor is public ──
  const tradeRule = rules.find((r) => r.action_type === 'trade');
  if (monitor.is_public && config.telegram.publicChannelId) {
    try {
      const proofUrl = `${config.webOrigin}/proof/public/${signalId}`;
      await notify.sendTelegram(
        config.telegram.publicChannelId,
        notify.formatSignalMessage({
          summary,
          monitorUrl: monitor.url,
          pair: tradeRule?.action_config.pair as string | undefined,
          proofUrl,
        }),
      );
      logger.info({ signalId, monitorId: monitor.id }, 'public signal posted to Telegram');
    } catch (err) {
      logger.error({ err, signalId }, 'failed to post public signal to Telegram');
    }
  }
}

/** Evaluate optional rule conditions (time-of-day filters, detector type filters, etc.). */
async function passesConditions(
  conditions: Record<string, unknown>,
  signalId: string,
): Promise<boolean> {
  const window = conditions.utcHours as { from: number; to: number } | undefined;
  if (window) {
    const hour = new Date().getUTCHours();
    if (hour < window.from || hour >= window.to) return false;
  }

  const detectorTypes = conditions.detectorTypes as string[] | undefined;
  if (detectorTypes && detectorTypes.length > 0) {
    const { rows } = await query<{ detector_type: string }>(
      `SELECT detector_type FROM signal_classifications WHERE signal_id = $1`,
      [signalId],
    );
    const matchedTypes = rows.map((r) => r.detector_type);
    const hasMatch = detectorTypes.some((t) => matchedTypes.includes(t));
    if (!hasMatch) return false;
  }

  return true;
}

function validateTradeConfig(raw: Record<string, unknown>): kraken.AddOrderParams {
  const parsed = tradeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid trade config: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** @internal exported for concurrency tests */
export async function executeTrade(monitor: Monitor, rule: Rule, signalId: string): Promise<void> {
  const order = validateTradeConfig(rule.action_config);
  order.cancelAfter = config.trade.cancelAfterSeconds;

  // Determine if this is a paper trade (validate mode)
  const isPaper = order.validate === true;

  // Load + decrypt the owning user's Kraken credentials.
  const { rows } = await query<{ k: string | null; s: string | null }>(
    `SELECT kraken_api_key_encrypted AS k, kraken_api_secret_encrypted AS s
     FROM users WHERE id = $1`,
    [monitor.user_id],
  );
  const enc = rows[0];
  const hasCreds = !!enc?.k && !!enc?.s;

  // If live trade and no credentials, abort.
  if (!isPaper && !hasCreds) {
    throw new Error('user has no Kraken credentials');
  }

  // Atomic guard + insert: lock the user row to serialize concurrent
  // trade checks, preventing two signals from both passing the cap.
  const orderId = await withTransaction(async (client) => {
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [monitor.user_id]);

    const cooldownSeconds = config.trade.cooldownMinutes * 60;
    const { rows: recent } = await client.query<{ id: string }>(
      `SELECT o.id FROM orders o
       JOIN signals s ON s.id = o.signal_id
       JOIN monitors m ON m.id = s.monitor_id
       WHERE m.user_id = $1
         AND o.order_params->>'pair' = $2
         AND o.status IN ('placed', 'filled', 'partially_filled')
         AND o.placed_at > now() - make_interval(secs => $3)
       LIMIT 1`,
      [monitor.user_id, order.pair, cooldownSeconds],
    );
    if (recent.length > 0) {
      logger.warn(
        { userId: monitor.user_id, pair: order.pair },
        'trade skipped: pair cooldown active',
      );
      return null;
    }

    const { rows: openCount } = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM orders o
       JOIN signals s ON s.id = o.signal_id
       JOIN monitors m ON m.id = s.monitor_id
       WHERE m.user_id = $1 AND o.status = 'placed'`,
      [monitor.user_id],
    );
    if (Number(openCount[0]?.count ?? 0) >= config.trade.maxOpenOrders) {
      logger.warn(
        { userId: monitor.user_id, openOrders: openCount[0].count },
        'trade skipped: max open orders reached',
      );
      return null;
    }

    const { rows: orderRows } = await client.query<{ id: string }>(
      `INSERT INTO orders (signal_id, rule_id, order_params, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [signalId, rule.id, JSON.stringify(order)],
    );
    return orderRows[0].id;
  });

  if (!orderId) return;

  try {
    let res: { krakenOrderId: string | null; raw: unknown };
    if (isPaper) {
      // Credential-less paper trade via the CLI built-in paper engine.
      logger.info(
        { userId: monitor.user_id, pair: order.pair },
        'executing paper trade (no credentials)',
      );
      res = await kraken.paperAddOrder(order);
    } else {
      // hasCreds is true here, so enc.k and enc.s are non-null.
      const { k, s } = enc as { k: string; s: string };
      res = await kraken.addOrder(order, {
        apiKey: decrypt(k),
        apiSecret: decrypt(s),
      });
    }
    await query(
      `UPDATE orders SET kraken_order_id = $1, status = 'placed', placed_at = now(), kraken_response = $2 WHERE id = $3`,
      [res.krakenOrderId, JSON.stringify(res.raw), orderId],
    );
  } catch (err) {
    await query(`UPDATE orders SET status = 'failed', kraken_response = $1 WHERE id = $2`, [
      JSON.stringify({ error: String(err) }),
      orderId,
    ]);
    throw err;
  }
}
