import { query } from '../../db/pool.js';
import type { AssetMapping, Monitor } from '@lenitnes/types';
import { cacheInvalidate } from '../../middleware/cache.js';
import { detectAssetMapping } from '../detectors/asset-lookup.js';

/**
 * Monitor domain service — pure business logic, no Express.
 * Routes are thin adapters that call these functions and serialize responses.
 *
 * Pivot note: user_id binding removed. The user_id column is dropped in
 * the Day 2 schema migration. Until then, the column is left in place
 * for backwards compatibility but no longer used for filtering.
 */

export interface CreateMonitorParams {
  url: string;
  conditionText: string;
  frequencySeconds: number;
  costPerCheck?: number;
  screenshotsEnabled: boolean;
  isPublic?: boolean;
  confidenceThreshold?: number;
  assetMapping?: AssetMapping;
}

export async function createMonitor(params: CreateMonitorParams): Promise<Monitor> {
  const assetMapping = params.assetMapping ?? detectAssetMapping(params.url) ?? {};
  const { rows } = await query<Monitor>(
    `INSERT INTO monitors (url, condition_text, frequency_seconds, screenshots_enabled, is_public, confidence_threshold, asset_mapping)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      params.url,
      params.conditionText,
      params.frequencySeconds,
      params.screenshotsEnabled,
      params.isPublic ?? true,
      params.confidenceThreshold ?? 50,
      JSON.stringify(assetMapping),
    ],
  );
  cacheInvalidate(`monitors:all:`);
  return rows[0];
}

export async function listMonitors(limit: number, offset: number): Promise<Monitor[]> {
  const { rows } = await query<Monitor>(
    `SELECT * FROM monitors ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function getMonitorById(id: string): Promise<Monitor | null> {
  const { rows } = await query<Monitor>(`SELECT * FROM monitors WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getMonitorWithSignals(
  id: string,
): Promise<(Monitor & { signals: unknown[] }) | null> {
  const monitor = await getMonitorById(id);
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
  status?: 'active' | 'paused';
  isPublic?: boolean;
}

export async function updateMonitor(
  id: string,
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
  if (params.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(params.status);
  }
  if (params.isPublic !== undefined) {
    sets.push(`is_public = $${i++}`);
    vals.push(params.isPublic);
  }
  if (!sets.length) return null;

  vals.push(id);
  const { rows } = await query<Monitor>(
    `UPDATE monitors SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  if (rows[0]) cacheInvalidate(`monitors:all:`);
  return rows[0] ?? null;
}

export async function pauseAndReleaseEscrow(id: string): Promise<boolean> {
  const { rowCount } = await query(`UPDATE monitors SET status = 'paused' WHERE id = $1`, [id]);
  if (rowCount) {
    cacheInvalidate(`monitors:all:`);
    return true;
  }
  return false;
}
