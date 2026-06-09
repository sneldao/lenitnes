/**
 * Shared formatting utilities — single source of truth for display logic.
 * Every component should use these rather than inlining format logic.
 */

import type { MonitorStatus } from '@lenitnes/types';

/** Strip protocol from a URL for compact display. */
export function formatMonitorUrl(url: string, maxLen = 40): string {
  return url.replace(/^https?:\/\//, '').slice(0, maxLen);
}

/** Format a date string for display (short month, day, hour:minute). */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format check frequency seconds into a human-readable string. */
export function formatFrequency(seconds: number): string {
  if (seconds >= 86_400) return `Every ${(seconds / 86_400).toFixed(0)}d`;
  if (seconds >= 3_600) return `Every ${(seconds / 3_600).toFixed(0)}h`;
  if (seconds >= 60) return `Every ${(seconds / 60).toFixed(0)}m`;
  return `Every ${seconds}s`;
}

/** Compute per-day burn rate and estimated days remaining. */
export function burnRate(monitor: {
  hbar_balance: string | number;
  cost_per_check: string | number;
  frequency_seconds: number;
}): { perDay: number; daysLeft: number } {
  const bal = Number(monitor.hbar_balance);
  const cost = Number(monitor.cost_per_check);
  const checksPerDay = 86_400 / monitor.frequency_seconds;
  const perDay = checksPerDay * cost;
  const daysLeft = perDay > 0 ? bal / perDay : Infinity;
  return { perDay, daysLeft };
}

/** Map monitor status to Tailwind badge classes. */
export function statusColor(s: MonitorStatus): string {
  switch (s) {
    case 'active':
      return 'bg-signal/15 text-signal';
    case 'triggered':
      return 'bg-accent/15 text-accent';
    case 'paused':
      return 'bg-slate-500/15 text-slate-400';
    case 'insufficient_balance':
      return 'bg-danger/15 text-danger';
  }
}

/** Color for burn bar and days-left display. */
export function daysColor(daysLeft: number): string {
  if (daysLeft > 14) return 'text-signal';
  if (daysLeft > 5) return 'text-warn';
  return 'text-danger';
}

/** Background color class for burn bar. */
export function burnBarColor(daysLeft: number): string {
  if (daysLeft > 14) return 'bg-signal';
  if (daysLeft > 5) return 'bg-warn';
  return 'bg-danger';
}
