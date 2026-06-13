import { query } from '../../db/pool.js';
import type { Rule, ActionType } from '@lenitnes/types';

/**
 * Rule domain service — pure business logic, no Express.
 */

export interface CreateRuleParams {
  monitorId: string;
  actionType: ActionType;
  actionConfig: Record<string, unknown>;
  conditions: Record<string, unknown>;
  isActive: boolean;
}

export async function monitorExists(id: string, userId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM monitors WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows.length > 0;
}

export async function createRule(userId: string, params: CreateRuleParams): Promise<Rule | null> {
  // Verify the monitor belongs to the user before creating the rule.
  if (!(await monitorExists(params.monitorId, userId))) return null;

  const { rows } = await query<Rule>(
    `INSERT INTO rules (monitor_id, action_type, action_config, conditions, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      params.monitorId,
      params.actionType,
      JSON.stringify(params.actionConfig),
      JSON.stringify(params.conditions),
      params.isActive,
    ],
  );
  return rows[0];
}

export async function listRules(userId: string, monitorId?: string): Promise<Rule[]> {
  if (monitorId) {
    if (!(await monitorExists(monitorId, userId))) return [];
    const { rows } = await query<Rule>(
      `SELECT r.* FROM rules r
       JOIN monitors m ON m.id = r.monitor_id
       WHERE r.monitor_id = $1 AND m.user_id = $2
       ORDER BY r.created_at DESC`,
      [monitorId, userId],
    );
    return rows;
  }
  const { rows } = await query<Rule>(
    `SELECT r.* FROM rules r
     JOIN monitors m ON m.id = r.monitor_id
     WHERE m.user_id = $1
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return rows;
}
