/**
 * Shared formatting utilities — single source of truth for display logic.
 * Every component should use these rather than inlining format logic.
 */

import type { MonitorStatus } from '@lenitnes/types';

/** Compute per-day burn rate and estimated days remaining. */
export function burnRate(monitor: {
  hbar_balance: string | number;
  cost_per_check: string | number;
  frequency_seconds: number;
}): { perDay: number; daysLeft: number; checksRemaining: number } {
  const bal = Number(monitor.hbar_balance);
  const cost = Number(monitor.cost_per_check);
  const checksPerDay = 86_400 / monitor.frequency_seconds;
  const perDay = checksPerDay * cost;
  const checksRemaining = cost > 0 ? Math.floor(bal / cost) : 0;
  const daysLeft = perDay > 0 ? bal / perDay : Infinity;
  return { perDay, daysLeft, checksRemaining };
}

/** Map monitor status to Tailwind badge classes.
 *  Colors communicate emotional state, not just technical state:
 *  - active    → signal (green)   : calm, everything is fine
 *  - triggered → accent (cyan)    : exciting peak moment
 *  - paused    → danger (red)     : urgent, you are missing signals NOW
 *  - insufficient_balance → warn (orange) : fixable, act before it goes red
 */
export function statusColor(s: MonitorStatus): string {
  switch (s) {
    case 'active':
      return 'bg-signal/15 text-signal';
    case 'triggered':
      return 'bg-accent/15 text-accent';
    case 'paused':
      return 'bg-danger/15 text-danger';
    case 'insufficient_balance':
      return 'bg-warn/15 text-warn';
  }
}

/** Background color class for burn bar. */
export function burnBarColor(daysLeft: number): string {
  if (daysLeft > 14) return 'bg-signal';
  if (daysLeft > 5) return 'bg-warn';
  return 'bg-danger';
}
