import { ExternalLink, Loader2 } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface ProofRowProps {
  icon: LucideIcon;
  iconClass?: string;
  label: string;
  detail: string;
  /** If provided, renders a "View" external link button */
  href?: string | null;
  hrefLabel?: string;
  /** If provided, renders a copy button for this value */
  copyValue?: string | null;
  /** Shows a pending spinner instead of a View button */
  pending?: boolean;
  mono?: boolean;
}

/**
 * Single row in a proof chain detail list.
 * Replaces the ~20-line repeated pattern in signals/[id]/page.tsx.
 */
export function ProofRow({
  icon: Icon,
  iconClass = 'bg-accent/10 text-accent',
  label,
  detail,
  href,
  hrefLabel = 'View',
  copyValue,
  pending = false,
  mono = false,
}: ProofRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge/40 bg-ink-light/30 p-3">
      <div
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconClass)}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        <p className={cn('text-[10px] text-slate-500', mono && 'font-mono truncate')}>{detail}</p>
      </div>
      {copyValue && <CopyButton value={copyValue} />}
      {href && !copyValue && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20"
        >
          <ExternalLink className="h-3 w-3" />
          {hrefLabel}
        </a>
      )}
      {pending && !href && !copyValue && (
        <span className="flex items-center gap-1 rounded-lg bg-edge/40 px-2.5 py-1.5 text-[10px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Pending
        </span>
      )}
    </div>
  );
}
