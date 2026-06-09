import { Router } from 'express';
import { query } from '../db/pool.js';
import type { Monitor } from '../types.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { executeCheck } from '../execution/loop.js';
import { logger } from '../logger.js';
import { createSignalShareToken } from '../services/share-token.js';

export const executeRouter = Router();

/**
 * POST /execute/:monitorId
 *
 * x402-gated on-demand execution endpoint.
 * The x402 middleware verifies/settles payment before this handler runs.
 * After payment confirmation, we run the monitor check immediately and
 * return the result (signal or heartbeat) to the caller.
 */
executeRouter.post('/:monitorId', async (req, res) => {
  const monitorId = req.params.monitorId;
  const userId = (req as unknown as AuthenticatedRequest).user?.id;

  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  // Verify monitor exists and belongs to user.
  const { rows } = await query<Monitor>(`SELECT * FROM monitors WHERE id = $1 AND user_id = $2`, [
    monitorId,
    userId,
  ]);
  const monitor = rows[0];
  if (!monitor) {
    res.status(404).json({ error: 'monitor_not_found' });
    return;
  }

  if (monitor.status !== 'active') {
    res.status(400).json({ error: 'monitor_not_active' });
    return;
  }

  try {
    const result = await executeCheck(monitor, { skipDebit: true });
    res.json({
      ok: true,
      monitorId,
      ...result,
      publicShareToken: result.signalId ? createSignalShareToken(result.signalId) : null,
    });
  } catch (err) {
    logger.error({ err, monitorId }, 'on-demand execution failed');
    res.status(500).json({ error: 'execution_failed', detail: String(err) });
  }
});
