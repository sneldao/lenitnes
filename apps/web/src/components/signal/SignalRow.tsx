import type { LucideIcon } from 'lucide-react';

export function SignalRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="section-title flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={'text-sm text-slate-200 ' + (mono ? 'font-mono text-xs' : '')}>{value}</span>
    </div>
  );
}
