import { sourceBadgeClass, sourceTag, sourceLabel } from '@/lib/format';
import type { SignalSourceCategory } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SignalSourceBadgeProps {
  category: SignalSourceCategory | null | undefined;
  label?: string;
  /** Show the emoji tag prefix. */
  showTag?: boolean;
  /** Compact hides the label text, shows only the tag (for dense tables). */
  compact?: boolean;
  className?: string;
}

/**
 * Attribution badge for a signal's origin. Distinguishes the four
 * surfaces: single-commit detection vs the three synthesis jobs
 * (narrative / thesis / proactive). This distinction is the
 * credibility product — a trade from aggregated evidence reads
 * differently than one from a keyword match.
 */
export function SignalSourceBadge({
  category,
  label,
  showTag = true,
  compact = false,
  className,
}: SignalSourceBadgeProps) {
  const cls = sourceBadgeClass(category);
  const tag = showTag ? sourceTag(category) : null;
  const text = compact ? '' : (label ?? sourceLabel(category));

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        cls,
        className,
      )}
      title={label ?? sourceLabel(category)}
    >
      {tag && <span aria-hidden="true">{tag}</span>}
      {text}
    </span>
  );
}
