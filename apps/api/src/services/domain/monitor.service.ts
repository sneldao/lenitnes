import { query } from '../../db/pool.js';
import { config } from '../../config.js';
import type { Monitor } from '@lenitnes/types';
import { cacheInvalidate } from '../../middleware/cache.js';

/**
 * Monitor domain service — pure business logic, no Express.
 * Routes are thin adapters that call these functions and serialize responses.
 */

export interface CreateMonitorParams {
  userId: string;
  url: string;
  conditionText: string;
  frequencySeconds: number;
  costPerCheck?: number;
  screenshotsEnabled: boolean;
  isPublic?: boolean;
}

export async function createMonitor(params: CreateMonitorParams): Promise<Monitor> {
  const { rows } = await query<Monitor>(
    `INSERT INTO monitors (user_id, url, condition_text, frequency_seconds, hbar_balance, cost_per_check, screenshots_enabled, is_public)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7) RETURNING *`,
    [
      params.userId,
      params.url,
      params.conditionText,
      params.frequencySeconds,
      params.costPerCheck ?? config.hedera.defaultCostPerCheck,
      params.screenshotsEnabled,
      params.isPublic ?? false,
    ],
  );
  cacheInvalidate(`monitors:${params.userId}:`);
  return rows[0];
}

export async function listMonitors(
  userId: string,
  limit: number,
  offset: number,
): Promise<Monitor[]> {
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function getMonitorById(id: string, userId: string): Promise<Monitor | null> {
  const { rows } = await query<Monitor>(`SELECT * FROM monitors WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  return rows[0] ?? null;
}

export async function getMonitorWithSignals(
  id: string,
  userId: string,
): Promise<(Monitor & { signals: unknown[] }) | null> {
  const monitor = await getMonitorById(id, userId);
  if (!monitor) return null;
  const { rows: signals } = await query(
    `SELECT * FROM signals WHERE monitor_id = $1 ORDER BY detected_at DESC`,
    [id],
  );
  return { ...monitor, signals };
}

export interface UpdateMonitorParams {
  frequencySeconds?: number;
  conditionText?: string;
  topUpHbar?: number;
  status?: 'active' | 'paused';
  isPublic?: boolean;
}

export async function updateMonitor(
  id: string,
  userId: string,
  params: UpdateMonitorParams,
): Promise<Monitor | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (params.frequencySeconds !== undefined) {
    sets.push(`frequency_seconds = $${i++}`);
    vals.push(params.frequencySeconds);
  }
  if (params.conditionText !== undefined) {
    sets.push(`condition_text = $${i++}`);
    vals.push(params.conditionText);
  }
  if (params.topUpHbar !== undefined) {
    sets.push(`hbar_balance = hbar_balance + $${i++}`);
    vals.push(params.topUpHbar);
  }
  if (params.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(params.status);
  }
  if (params.isPublic !== undefined) {
    sets.push(`is_public = $${i++}`);
    vals.push(params.isPublic);
  }
  if (!sets.length) return null;

  vals.push(id, userId);
  const { rows } = await query<Monitor>(
    `UPDATE monitors SET ${sets.join(', ')} WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
    vals,
  );
  if (rows[0]) cacheInvalidate(`monitors:${userId}:`);
  return rows[0] ?? null;
}

export async function pauseAndReleaseEscrow(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE monitors SET status = 'paused', hbar_balance = 0 WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (rowCount) {
    cacheInvalidate(`monitors:${userId}:`);
    return true;
  }
  return false;
}
