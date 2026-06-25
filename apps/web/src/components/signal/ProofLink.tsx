import { ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function ProofLink({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: LucideIcon;
  label: string;
  href: string | null;
  color: string;
}) {
  return (
    <div className="stat-card flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon className={'h-4 w-4 ' + color} />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-glow"
        >
          Verify
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-xs text-slate-600">pending</span>
      )}
    </div>
  );
}
