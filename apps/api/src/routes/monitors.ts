import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import * as hedera from '../services/hedera.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { Monitor } from '../types.js';

export const monitorsRouter = Router();

const createSchema = z.object({
  url: z.string().url(),
  conditionText: z.string().min(1),
  frequencySeconds: z.number().int().positive().default(3600),
  stakeHbar: z.number().nonnegative().default(0),
  costPerCheck: z.number().positive().optional(),
});

// POST /monitors — create monitor + provision escrow.
monitorsRouter.post('/', async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  const { rows } = await query<Monitor>(
    `INSERT INTO monitors (user_id, url, condition_text, frequency_seconds, hbar_balance, cost_per_check)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      authReq.user.id,
      b.url,
      b.conditionText,
      b.frequencySeconds,
      b.stakeHbar,
      b.costPerCheck ?? config.hedera.defaultCostPerCheck,
    ],
  );
  const monitor = rows[0];

  const { escrowAccountId } = await hedera.createEscrow(monitor.id);
  await query(`UPDATE monitors SET escrow_account_id = $1 WHERE id = $2`, [
    escrowAccountId,
    monitor.id,
  ]);

  res.status(201).json({ ...monitor, escrow_account_id: escrowAccountId });
});

// GET /monitors — list only the authenticated user's monitors.
monitorsRouter.get('/', async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors WHERE user_id = $1 ORDER BY created_at DESC`,
    [authReq.user.id],
  );
  res.json(rows);
});

// GET /monitors/:id — detail with signal history (own monitors only).
monitorsRouter.get('/:id', async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query<Monitor>(`SELECT * FROM monitors WHERE id = $1 AND user_id = $2`, [
    req.params.id,
    authReq.user.id,
  ]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  const signals = await query(
    `SELECT * FROM signals WHERE monitor_id = $1 ORDER BY detected_at DESC`,
    [req.params.id],
  );
  res.json({ ...rows[0], signals: signals.rows });
});

const patchSchema = z.object({
  frequencySeconds: z.number().int().positive().optional(),
  conditionText: z.string().min(1).optional(),
  topUpHbar: z.number().positive().optional(),
  status: z.enum(['active', 'paused']).optional(),
});

// PATCH /monitors/:id — update frequency/condition/top up/status (own monitors only).
monitorsRouter.patch('/:id', async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (b.frequencySeconds !== undefined) {
    sets.push(`frequency_seconds = $${i++}`);
    vals.push(b.frequencySeconds);
  }
  if (b.conditionText !== undefined) {
    sets.push(`condition_text = $${i++}`);
    vals.push(b.conditionText);
  }
  if (b.topUpHbar !== undefined) {
    sets.push(`hbar_balance = hbar_balance + $${i++}`);
    vals.push(b.topUpHbar);
  }
  if (b.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(b.status);
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });

  vals.push(req.params.id, authReq.user.id);
  const { rows } = await query<Monitor>(
    `UPDATE monitors SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals,
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

// DELETE /monitors/:id — pause + release remaining escrow (own monitors only).
monitorsRouter.delete('/:id', async (req, res) => {
  const authReq = req as unknown as AuthenticatedRequest;
  const { rows } = await query<Monitor>(`SELECT * FROM monitors WHERE id = $1 AND user_id = $2`, [
    req.params.id,
    authReq.user.id,
  ]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  const monitor = rows[0];

  const remaining = Number(monitor.hbar_balance);
  if (remaining > 0) {
    await hedera
      .releaseEscrow({ toWalletAddress: authReq.user.wallet_address, amountHbar: remaining })
      .catch((e: unknown) => console.error('[monitors] releaseEscrow failed:', e));
  }

  await query(`UPDATE monitors SET status = 'paused', hbar_balance = 0 WHERE id = $1`, [
    monitor.id,
  ]);
  res.json({ ok: true });
});
