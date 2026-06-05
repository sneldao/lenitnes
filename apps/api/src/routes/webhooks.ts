import { Router } from "express";
import { query } from "../db/pool.js";

export const webhooksRouter = Router();

// POST /webhooks/kraken — receive Kraken order confirmations.
webhooksRouter.post("/kraken", async (req, res) => {
  const { krakenOrderId, status, raw } = req.body ?? {};
  if (krakenOrderId) {
    await query(
      `UPDATE orders SET status = COALESCE($1, status), kraken_response = $2 WHERE kraken_order_id = $3`,
      [status ?? null, JSON.stringify(raw ?? req.body), krakenOrderId]
    );
  }
  res.json({ ok: true });
});
