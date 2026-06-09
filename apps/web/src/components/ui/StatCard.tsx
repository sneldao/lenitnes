import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value: string | number;
  suffix?: string;
}

/**
 * Reusable stat card — displays an icon, label, and value.
 * Used throughout dashboard, orders, and monitors pages.
 *
 * @example
 * <StatCard icon={Activity} label="Active" value={activeCount} />
 */
export function StatCard({
  icon: Icon,
  iconColor = 'text-accent',
  label,
  value,
  suffix,
}: StatCardProps) {
  return (
    <div className="stat-card space-y-1">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="section-title">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">
        {value}
        {suffix && <span className="text-sm font-normal text-slate-500 ml-1">{suffix}</span>}
      </p>
    </div>
  );
}
