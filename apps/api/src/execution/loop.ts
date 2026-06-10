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

export async function executeCheck(
  monitor: Monitor,
  opts: { skipDebit?: boolean } = {},
): Promise<{
  signalId: string | null;
  conditionMet: boolean;
  isHeartbeat: boolean;
  summary: string | null;
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
      return { signalId: null, conditionMet: false, isHeartbeat: false, summary: null };
    }

    // External proof call — record the debit on-ledger.
    const debit = await proof.debitPerCheckFee!({
      fromAccountId: monitor.escrow_account_id ?? config.hedera.treasuryId,
      amountHbar: cost,
    });
    debitTxId = debit.hederaTxId;
  }

  // ── 2) Run TinyFish (with circuit breaker + scraper fallback) ─────
  let result: TinyFishResult;
  if (isCircuitOpen(circuitOpts)) {
    logger.warn({ monitorId: monitor.id }, 'TinyFish circuit open — using scraper fallback');
    result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
    incCounter('tinyfish_errors_total', { fallback: 'scraper' });
  } else {
    try {
      result = await tinyfish.runMonitorCheck({
        url: monitor.url,
        condition: monitor.condition_text,
        lastSeenCommitHash: monitor.last_seen_commit_hash,
        screenshots: monitor.screenshots_enabled,
      });
      recordSuccess(circuitOpts);
    } catch (err) {
      recordFailure(circuitOpts);
      incCounter('tinyfish_errors_total', { fallback: 'none' });
      logger.warn({ err, monitorId: monitor.id }, 'TinyFish failed, trying scraper fallback');
      result = await scraper.runScraperFallback(monitor.url, monitor.condition_text);
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

    return { signalId: null, conditionMet: false, isHeartbeat: false, summary: null };
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
    if (!passesConditions(rule.conditions)) continue;

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
            `LENITNES signal: ${summary}`,
          );
          break;
        case 'email':
          await notify.sendEmail(String(rule.action_config.to), 'LENITNES signal', summary);
          break;
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id, actionType: rule.action_type }, 'rule action failed');
    }
  }

  // ── Public feed: post to Telegram channel if monitor is public ──
  if (monitor.is_public && config.telegram.publicChannelId) {
    try {
      const url = `${config.webOrigin}/proof/public/${signalId}`;
      await notify.sendTelegram(
        config.telegram.publicChannelId,
        `🔔 Public signal detected\n\n${summary}\n\nProof: ${url}`,
      );
      logger.info({ signalId, monitorId: monitor.id }, 'public signal posted to Telegram');
    } catch (err) {
      logger.error({ err, signalId }, 'failed to post public signal to Telegram');
    }
  }
}

/** Evaluate optional rule conditions (time-of-day filters, etc.). */
function passesConditions(conditions: Record<string, unknown>): boolean {
  const window = conditions.utcHours as { from: number; to: number } | undefined;
  if (window) {
    const hour = new Date().getUTCHours();
    if (hour < window.from || hour >= window.to) return false;
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

async function executeTrade(monitor: Monitor, rule: Rule, signalId: string): Promise<void> {
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

  // Pair-level cooldown: skip if same user+pair traded within the cooldown window.
  const cooldownSeconds = config.trade.cooldownMinutes * 60;
  const { rows: recent } = await query<{ id: string }>(
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
    return;
  }

  // Max open orders: prevent unbounded accumulation of live orders.
  const { rows: openCount } = await query<{ count: string }>(
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
    return;
  }

  const { rows: orderRows } = await query<{ id: string }>(
    `INSERT INTO orders (signal_id, rule_id, order_params, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [signalId, rule.id, JSON.stringify(order)],
  );
  const orderId = orderRows[0].id;

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
