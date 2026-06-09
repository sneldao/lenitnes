import { Check, X, ArrowUpRight, Ban } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-500/15 text-slate-400',
  placed: 'bg-accent/15 text-accent',
  filled: 'bg-signal/15 text-signal',
  partially_filled: 'bg-warn/15 text-warn',
  cancelled: 'bg-slate-500/15 text-slate-400',
  failed: 'bg-danger/15 text-danger',
  expired: 'bg-slate-500/15 text-slate-500',
  active: 'bg-signal/15 text-signal',
  triggered: 'bg-accent/15 text-accent',
  paused: 'bg-slate-500/15 text-slate-400',
  insufficient_balance: 'bg-danger/15 text-danger',
};

interface StatusBadgeProps {
  status: string;
  showPulse?: boolean;
}

/**
 * Reusable status badge — renders a colored pill with an optional pulse dot.
 *
 * @example
 * <StatusBadge status="placed" />
 * <StatusBadge status="active" showPulse />
 */
export function StatusBadge({ status, showPulse }: StatusBadgeProps) {
  const Icon =
    status === 'filled'
      ? Check
      : status === 'failed'
        ? X
        : status === 'placed'
          ? ArrowUpRight
          : status === 'cancelled'
            ? Ban
            : undefined;

  return (
    <span className={`badge ${STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-500'}`}>
      {showPulse && <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse" />}
      {Icon && <Icon className="h-3 w-3" />}
      {status.replace(/_/g, ' ')}
    </span>
  );
}
