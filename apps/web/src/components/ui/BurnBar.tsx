import { burnRate, burnBarColor } from '@/lib/format';
import type { Monitor } from '@lenitnes/types';

interface BurnBarProps {
  monitor: Pick<Monitor, 'hbar_balance' | 'cost_per_check' | 'frequency_seconds'>;
}

/**
 * Burn bar with days-left display.
 * Extracted from the dashboard MonitorCard for reuse in post-create flow.
 *
 * @example
 * <BurnBar monitor={monitor} />
 */
export function BurnBar({ monitor }: BurnBarProps) {
  const { daysLeft } = burnRate(monitor);
  const bal = Number(monitor.hbar_balance);
  const pct = Math.min(100, Math.max(0, (daysLeft / 30) * 100));
  const color = burnBarColor(daysLeft);
  const daysText = Number.isFinite(daysLeft) ? `${daysLeft.toFixed(0)}d remaining` : '∞';

  return (
    <div className="space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-edge/60">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">{bal.toFixed(1)} ℏ staked</span>
        <span className={`font-medium text-slate-400`}>{daysText}</span>
      </div>
    </div>
  );
}
