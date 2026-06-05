import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Rule } from '../types.js';

export const rulesRouter = Router();

const createSchema = z.object({
  monitorId: z.string().uuid(),
  actionType: z.enum(['trade', 'webhook', 'email', 'telegram']),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
  conditions: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
});

// POST /rules — connect a monitor to an action.
rulesRouter.post('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  const { rows: m } = await query<{ id: string }>(
    `SELECT id FROM monitors WHERE id = $1 AND user_id = $2`,
    [b.monitorId, authReq.user.id],
  );
  if (!m.length) return res.status(404).json({ error: 'monitor not found' });

  const { rows } = await query<Rule>(
    `INSERT INTO rules (monitor_id, action_type, action_config, conditions, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      b.monitorId,
      b.actionType,
      JSON.stringify(b.actionConfig),
      JSON.stringify(b.conditions),
      b.isActive,
    ],
  );
  res.status(201).json(rows[0]);
});

// GET /rules?monitorId=...  (own monitors only)
rulesRouter.get('/', async (req: Request, res: Response) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const monitorId = req.query.monitorId ? String(req.query.monitorId) : null;

  if (monitorId) {
    const { rows: m } = await query<{ id: string }>(
      `SELECT id FROM monitors WHERE id = $1 AND user_id = $2`,
      [monitorId, authReq.user.id],
    );
    if (!m.length) return res.status(404).json({ error: 'monitor not found' });
    const { rows } = await query<Rule>(
      `SELECT r.* FROM rules r
       JOIN monitors m ON m.id = r.monitor_id
       WHERE r.monitor_id = $1 AND m.user_id = $2
       ORDER BY r.created_at DESC`,
      [monitorId, authReq.user.id],
    );
    res.json(rows);
    return;
  }

  const { rows } = await query<Rule>(
    `SELECT r.* FROM rules r
     JOIN monitors m ON m.id = r.monitor_id
     WHERE m.user_id = $1
     ORDER BY r.created_at DESC`,
    [authReq.user.id],
  );
  res.json(rows);
});
