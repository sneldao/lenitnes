import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'positive' | 'negative' | 'neutral';

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: Tone;
  caveat?: string;
  /** 'sm' renders without the .card shell — use inside tight panels */
  size?: 'default' | 'sm';
  className?: string;
}

const toneValueClass: Record<Tone, string> = {
  positive: 'text-signal',
  negative: 'text-danger',
  neutral: 'text-slate-100',
};

export function StatCard({
  icon,
  label,
  value,
  tone = 'neutral',
  caveat,
  size = 'default',
  className,
}: StatCardProps) {
  const shell =
    size === 'sm'
      ? 'flex flex-col gap-0.5 rounded-lg border border-edge/30 bg-ink-light/40 px-2 py-1.5'
      : 'card flex flex-col gap-2';

  return (
    <div className={cn(shell, className)}>
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'font-mono font-bold',
          size === 'sm' ? 'text-sm' : 'text-2xl',
          toneValueClass[tone],
        )}
      >
        {value}
      </div>
      {caveat && <div className="font-mono text-[10px] text-slate-500">{caveat}</div>}
    </div>
  );
}
