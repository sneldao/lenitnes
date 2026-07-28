'use client';

import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Final verdict in Xh Ym" — live countdown to a signal's judgment
 * moment (default: the T+1d price snapshot, the canonical check).
 * Renders nothing once the deadline has passed — the verdict pill
 * takes over from there.
 */
export function JudgmentCountdown({
  detectedAt,
  windowSeconds = 86400,
  className,
}: {
  detectedAt: string;
  /** Seconds between detection and judgment. Defaults to the canonical T+1d. */
  windowSeconds?: number;
  className?: string;
}) {
  const deadline = new Date(detectedAt).getTime() + windowSeconds * 1000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const remaining = deadline - now;
  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500',
        className,
      )}
    >
      <Hourglass className="h-3 w-3 animate-pulse text-accent" />
      verdict in {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
    </span>
  );
}
