'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, type ScorecardRecentCall } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { repoLabel, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

// Honest by construction: every item is a real scored signal fetched from the
// API — conviction, action, and T+1d outcome exactly as recorded (losses
// included). No hand-written sample data.
export function LiveSignalTicker() {
  const { data } = useQuery<ScorecardRecentCall[]>({
    queryKey: qk.scorecardRecent(6),
    queryFn: () => api.getScorecardRecent(6),
    refetchInterval: REFETCH.fast,
  });

  const calls = data ?? [];

  return (
    <div className="w-full overflow-hidden border-b border-edge/30 bg-ink-light/50 px-4 py-1.5 font-mono text-[11px]">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1.5 font-semibold text-accent">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-[10px] uppercase tracking-wider">Live signals</span>
        </div>

        <div className="no-scrollbar flex items-center gap-6 overflow-x-auto whitespace-nowrap py-0.5 text-slate-300">
          {calls.map((call) => {
            const action = call.recommendedAction as string | null;
            return (
              <Link
                key={call.signalId}
                href={`/signals/${call.signalId}`}
                className="group inline-flex items-center gap-2 transition-colors hover:text-accent"
              >
                <span className="font-bold text-slate-200 group-hover:text-accent">
                  {repoLabel(call.monitorUrl)}
                </span>
                {call.conviction != null && (
                  <span className="rounded bg-accent/10 px-1 py-0.5 text-[9px] font-bold text-accent">
                    {call.conviction}/100
                  </span>
                )}
                {action && (
                  <span
                    className={cn(
                      'text-[9px] uppercase',
                      action === 'long' || action === 'alert' || action === 'investigate'
                        ? 'text-signal'
                        : action === 'short'
                          ? 'text-danger'
                          : 'text-slate-500',
                    )}
                  >
                    {action}
                  </span>
                )}
                {call.outcomes.t1d != null && (
                  <span
                    className={cn(
                      'font-bold',
                      call.outcomes.t1d >= 0 ? 'text-signal' : 'text-danger',
                    )}
                  >
                    T+1d {call.outcomes.t1d > 0 ? '+' : ''}
                    {call.outcomes.t1d.toFixed(1)}%
                  </span>
                )}
                <span className="text-[10px] text-slate-600">{timeAgo(call.detectedAt)}</span>
              </Link>
            );
          })}
          {calls.length === 0 && (
            <span className="text-[10px] text-slate-500">
              watching the watchlist — every scored call publishes here, losses included
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
