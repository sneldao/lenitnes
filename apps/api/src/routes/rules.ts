import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import type { Rule } from "../types.js";

export const rulesRouter = Router();

const createSchema = z.object({
  monitorId: z.string().uuid(),
  actionType: z.enum(["trade", "webhook", "email", "telegram"]),
  actionConfig: z.record(z.unknown()).default({}),
  conditions: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

// POST /rules — connect a monitor to an action.
rulesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;
  const { rows } = await query<Rule>(
    `INSERT INTO rules (monitor_id, action_type, action_config, conditions, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [b.monitorId, b.actionType, JSON.stringify(b.actionConfig), JSON.stringify(b.conditions), b.isActive]
  );
  res.status(201).json(rows[0]);
});

// GET /rules?monitorId=...
rulesRouter.get("/", async (req, res) => {
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;
  const { rows } = monitorId
    ? await query<Rule>(`SELECT * FROM rules WHERE monitor_id = $1 ORDER BY created_at DESC`, [monitorId])
    : await query<Rule>(`SELECT * FROM rules ORDER BY created_at DESC`);
  res.json(rows);
});
