import { Router } from "express";
import { query } from "../db/pool.js";
import { ipfsGatewayUrl } from "../services/ipfs.js";
import type { Signal } from "../types.js";

export const signalsRouter = Router();

// GET /signals?monitorId=...  (heartbeats excluded by default)
signalsRouter.get("/", async (req, res) => {
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;
  const includeHeartbeats = req.query.includeHeartbeats === "true";
  const where: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (monitorId) { where.push(`monitor_id = $${i++}`); vals.push(monitorId); }
  if (!includeHeartbeats) where.push(`is_heartbeat = false`);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await query<Signal>(
    `SELECT * FROM signals ${clause} ORDER BY detected_at DESC`,
    vals
  );
  res.json(rows);
});

// GET /signals/:id — full proof package (public-facing proof explorer).
signalsRouter.get("/:id", async (req, res) => {
  const { rows } = await query<Signal>(`SELECT * FROM signals WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not found" });
  const signal = rows[0];

  const orders = await query(`SELECT * FROM orders WHERE signal_id = $1`, [signal.id]);
  const monitor = await query(`SELECT id, url, condition_text FROM monitors WHERE id = $1`, [
    signal.monitor_id,
  ]);

  res.json({
    ...signal,
    monitor: monitor.rows[0] ?? null,
    orders: orders.rows,
    proof: {
      ipfsUrl: signal.ipfs_cid ? ipfsGatewayUrl(signal.ipfs_cid) : null,
      hashscanUrl: signal.hedera_tx_id
        ? `https://hashscan.io/testnet/transaction/${encodeURIComponent(signal.hedera_tx_id)}`
        : null,
    },
  });
});
