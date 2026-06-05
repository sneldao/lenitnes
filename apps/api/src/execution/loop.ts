import { query } from "../db/pool.js";
import { config } from "../config.js";
import type { Monitor, Rule } from "../types.js";
import * as hedera from "../services/hedera.js";
import * as tinyfish from "../services/tinyfish.js";
import * as ipfs from "../services/ipfs.js";
import * as kraken from "../services/kraken.js";
import * as notify from "../services/notify.js";
import { decrypt } from "../services/crypto.js";

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
       )`
  );
  return rows;
}

export async function runDueChecks(): Promise<void> {
  const monitors = await dueMonitors();
  for (const monitor of monitors) {
    try {
      await executeCheck(monitor);
    } catch (err) {
      console.error(`[loop] monitor ${monitor.id} failed:`, err);
    }
  }
}

export async function executeCheck(monitor: Monitor): Promise<void> {
  const cost = Number(monitor.cost_per_check) || config.hedera.defaultCostPerCheck;
  const balance = Number(monitor.hbar_balance);

  // 1) Balance check.
  if (balance < cost) {
    await query(`UPDATE monitors SET status = 'insufficient_balance' WHERE id = $1`, [monitor.id]);
    console.warn(`[loop] monitor ${monitor.id} paused: insufficient balance`);
    return;
  }

  // 2) Debit per-check fee + write heartbeat to HCS (immutable "check ran" record).
  const debit = await hedera.debitPerCheckFee({
    fromAccountId: monitor.escrow_account_id ?? config.hedera.treasuryId,
    amountHbar: cost,
  });
  await hedera.writeHcsMessage({
    kind: "heartbeat",
    monitorId: monitor.id,
    ts: new Date().toISOString(),
    txRef: debit.hederaTxId,
  });
  const newBalance = balance - cost;
  await query(
    `UPDATE monitors SET hbar_balance = $1, last_check_at = now() WHERE id = $2`,
    [newBalance, monitor.id]
  );

  // 3) Run TinyFish.
  const result = await tinyfish.runMonitorCheck({
    url: monitor.url,
    condition: monitor.condition_text,
    lastSeenCommitHash: monitor.last_seen_commit_hash,
  });

  // Track the newest commit hash so we only evaluate new commits next cycle.
  if (result.latestCommitHash) {
    await query(`UPDATE monitors SET last_seen_commit_hash = $1 WHERE id = $2`, [
      result.latestCommitHash,
      monitor.id,
    ]);
  }

  // 4) No signal -> store a heartbeat row and stop.
  if (!result.conditionMet) {
    await query(
      `INSERT INTO signals (monitor_id, tinyfish_run_id, is_heartbeat, condition_summary)
       VALUES ($1, $2, true, $3)`,
      [monitor.id, result.runId, result.summary]
    );
    return;
  }

  // 5) Signal! Package proof and pin to IPFS.
  const detectedAt = new Date().toISOString();
  const { rows: sigRows } = await query<{ id: string }>(
    `INSERT INTO signals
       (monitor_id, detected_at, hedera_tx_id, tinyfish_run_id, evidence_text,
        screenshot_urls, condition_summary, is_heartbeat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     RETURNING id`,
    [
      monitor.id,
      detectedAt,
      debit.hederaTxId,
      result.runId,
      result.evidence,
      JSON.stringify(result.screenshots),
      result.summary,
    ]
  );
  const signalId = sigRows[0].id;

  const { cid } = await ipfs.uploadProofPackage({
    signalId,
    monitorId: monitor.id,
    detectedAt,
    url: monitor.url,
    condition: monitor.condition_text,
    tinyfishRunId: result.runId,
    evidence: result.evidence,
    summary: result.summary,
    screenshots: result.screenshots,
    hederaTxId: debit.hederaTxId,
  });

  // 6) Write the signal record to HCS (immutable on-chain proof).
  const hcs = await hedera.writeHcsMessage({
    kind: "signal",
    signalId,
    monitorId: monitor.id,
    ipfsCid: cid,
    ts: detectedAt,
  });

  await query(
    `UPDATE signals SET ipfs_cid = $1, hedera_hcs_message_id = $2 WHERE id = $3`,
    [cid, hcs.hederaTxId, signalId]
  );
  await query(`UPDATE monitors SET status = 'triggered' WHERE id = $1`, [monitor.id]);

  // 7) Execute attached rules.
  await executeRules(monitor, signalId, result.summary);
}

async function executeRules(monitor: Monitor, signalId: string, summary: string): Promise<void> {
  const { rows: rules } = await query<Rule>(
    `SELECT * FROM rules WHERE monitor_id = $1 AND is_active = true`,
    [monitor.id]
  );

  for (const rule of rules) {
    if (!passesConditions(rule.conditions)) continue;

    try {
      switch (rule.action_type) {
        case "trade":
          await executeTrade(monitor, rule, signalId);
          break;
        case "webhook":
          await notify.sendWebhook(String(rule.action_config.url), {
            signalId,
            monitorId: monitor.id,
            summary,
          });
          break;
        case "telegram":
          await notify.sendTelegram(String(rule.action_config.chatId), `LENITNES signal: ${summary}`);
          break;
        case "email":
          await notify.sendEmail(String(rule.action_config.to), "LENITNES signal", summary);
          break;
      }
    } catch (err) {
      console.error(`[loop] rule ${rule.id} action failed:`, err);
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

async function executeTrade(monitor: Monitor, rule: Rule, signalId: string): Promise<void> {
  // Load + decrypt the owning user's Kraken credentials.
  const { rows } = await query<{ k: string | null; s: string | null }>(
    `SELECT kraken_api_key_encrypted AS k, kraken_api_secret_encrypted AS s
     FROM users WHERE id = $1`,
    [monitor.user_id]
  );
  const enc = rows[0];
  if (!enc?.k || !enc?.s) throw new Error("user has no Kraken credentials");

  const order = rule.action_config as unknown as kraken.AddOrderParams;
  const { rows: orderRows } = await query<{ id: string }>(
    `INSERT INTO orders (signal_id, rule_id, order_params, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [signalId, rule.id, JSON.stringify(order)]
  );
  const orderId = orderRows[0].id;

  try {
    const res = await kraken.addOrder(order, {
      apiKey: decrypt(enc.k),
      apiSecret: decrypt(enc.s),
    });
    await query(
      `UPDATE orders SET kraken_order_id = $1, status = 'placed', placed_at = now(), kraken_response = $2 WHERE id = $3`,
      [res.krakenOrderId, JSON.stringify(res.raw), orderId]
    );
  } catch (err) {
    await query(
      `UPDATE orders SET status = 'failed', kraken_response = $1 WHERE id = $2`,
      [JSON.stringify({ error: String(err) }), orderId]
    );
    throw err;
  }
}
