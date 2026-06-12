import { query } from '../../db/pool.js';

/**
 * Signal domain service — pure business logic, no Express.
 * Routes are thin adapters that call these functions and serialize responses.
 */

export interface MarkSignalViewedResult {
  signalId: string;
  monitorId: string;
  monitorRearmed: boolean;
  wasAlreadyViewed: boolean;
}

/**
 * Mark a signal as viewed by the given user. Idempotent: re-calling on an
 * already-viewed signal is a no-op that returns `wasAlreadyViewed: true`.
 *
 * As a side effect, if the signal's parent monitor is currently in the
 * `triggered` state, the monitor is re-armed to `active` (assuming it still
 * has HBAR balance). This is what makes the "Signal caught!" celebration
 * go away once the user has actually looked at the proof.
 */
export async function markSignalViewed(
  signalId: string,
  userId: string,
): Promise<MarkSignalViewedResult | null> {
  // Atomically:
  //   1. Look up the signal and confirm ownership through the parent monitor.
  //   2. If viewed_at is already set, return early (idempotent).
  //   3. Otherwise set viewed_at + viewed_by.
  //   4. If the parent monitor is in 'triggered' and still has balance,
  //      re-arm it to 'active'.
  // The single CTE keeps the read + write in one round-trip.
  const { rows } = await query<{
    signal_id: string;
    monitor_id: string;
    monitor_status: string;
    monitor_balance: string;
    was_already_viewed: boolean;
    rearmed: boolean;
  }>(
    `WITH owned AS (
       SELECT s.id AS signal_id, s.monitor_id, s.viewed_at, m.user_id,
              m.status AS monitor_status, m.hbar_balance::text AS monitor_balance
         FROM signals s
         JOIN monitors m ON m.id = s.monitor_id
        WHERE s.id = $1
     ),
     stamped AS (
       UPDATE signals
          SET viewed_at  = COALESCE(signals.viewed_at, now()),
              viewed_by  = COALESCE(signals.viewed_by, $2)
         FROM owned
        WHERE signals.id = owned.signal_id
          AND owned.user_id = $2
        RETURNING signals.id
     ),
     rearm AS (
       UPDATE monitors
          SET status = 'active'
         FROM owned
        WHERE monitors.id = owned.monitor_id
          AND owned.user_id = $2
          AND owned.monitor_status = 'triggered'
          AND owned.hbar_balance > 0
        RETURNING monitors.id
     )
     SELECT
       (SELECT id FROM owned)        AS signal_id,
       (SELECT monitor_id FROM owned) AS monitor_id,
       (SELECT monitor_status FROM owned) AS monitor_status,
       (SELECT monitor_balance FROM owned) AS monitor_balance,
       (SELECT viewed_at IS NOT NULL FROM owned) AS was_already_viewed,
       EXISTS (SELECT 1 FROM rearm)   AS rearmed`,
    [signalId, userId],
  );

  const row = rows[0];
  if (!row?.signal_id) return null;

  return {
    signalId: row.signal_id,
    monitorId: row.monitor_id,
    monitorRearmed: row.rearmed,
    wasAlreadyViewed: row.was_already_viewed,
  };
}
