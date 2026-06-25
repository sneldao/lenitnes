import { cn } from '@/lib/utils';

interface OutcomePillProps {
  label: string;
  value: number | null;
  className?: string;
}

/**
 * Single price-outcome chip: T+1h / T+1d / T+7d.
 * Green for positive, red for negative, muted for pending.
 */
export function OutcomePill({ label, value, className }: OutcomePillProps) {
  if (value == null) {
    return (
      <div
        className={cn(
          'rounded-md bg-edge/20 px-2 py-1.5 text-center font-mono text-[10px]',
          className,
        )}
      >
        <div className="text-slate-600">{label}</div>
        <div className="text-slate-500">pending</div>
      </div>
    );
  }
  const positive = value > 0;
  return (
    <div
      className={cn(
        'rounded-md px-2 py-1.5 text-center font-mono text-[10px]',
        positive ? 'bg-signal/10' : 'bg-danger/10',
        className,
      )}
    >
      <div className="text-slate-500">{label}</div>
      <div className={cn('font-semibold', positive ? 'text-signal' : 'text-danger')}>
        {positive ? '+' : ''}
        {value.toFixed(2)}%
      </div>
    </div>
  );
}
