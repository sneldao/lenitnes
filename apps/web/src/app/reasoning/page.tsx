'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowUpRight, Filter } from 'lucide-react';
import { api, type ReasoningItem } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { formatDate, shortUrl, timeAgo } from '@/lib/format';
import { PageLoader, PageError } from '@/components/ui/page-states';

type FeedFilter = 'all' | 'traded' | 'passed';

// ─────────────────────────────────────────────────────────────
// Public reasoning archive — every scored call the agent made,
// most of which it PASSED on. This page is the answer to
// "show me what the agent saw, not just what it traded."
// ─────────────────────────────────────────────────────────────
export default function ReasoningPage() {
  const [filter, setFilter] = useState<FeedFilter>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reasoning', 'feed'],
    queryFn: () => api.listReasoning(60),
    refetchInterval: REFETCH.medium,
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === 'traded') return all.filter((i) => i.traded);
    if (filter === 'passed') return all.filter((i) => !i.traded);
    return all;
  }, [data, filter]);

  const tradedCount = data?.items.filter((i) => i.traded).length ?? 0;
  const passedCount = (data?.count ?? 0) - tradedCount;

  if (isLoading) return <PageLoader label="Loading reasoning archive…" />;
  if (isError || !data)
    return <PageError message="Failed to load the reasoning archive — the API may be down." />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header — one line, then the feed. */}
      <header>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
          public reasoning archive
        </p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          What the agent saw — and mostly passed on
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Every signal the rubric scored, including the ones that never traded. Selective silence is
          the skill; the scored log is the proof.
        </p>
      </header>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: 'all', label: `All · ${data.count}` },
            { key: 'traded', label: `Traded · ${tradedCount}` },
            { key: 'passed', label: `Passed · ${passedCount}` },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors',
              filter === f.key
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-edge/40 text-slate-400 hover:border-edge-light/60 hover:text-slate-300',
            )}
          >
            <Filter className="h-3 w-3" />
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card border-edge/30 text-center text-sm text-slate-500">
          No {filter !== 'all' ? filter : ''} reasoning rows yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <ReasoningRow key={item.signalId} item={item} index={i} />
          ))}
        </ul>
      )}

      <p className="text-center font-mono text-[10px] text-slate-600">
        rubric versions noted per row · generated {formatDate(data.generatedAt)}
      </p>
    </div>
  );
}

function ReasoningRow({ item, index }: { item: ReasoningItem; index: number }) {
  const conviction = item.conviction ?? 0;
  const action = item.recommendedAction ?? 'none';
  const actionTone =
    action === 'long'
      ? 'text-signal bg-signal/15'
      : action === 'short'
        ? 'text-danger bg-danger/15'
        : 'text-slate-400 bg-slate-500/15';

  return (
    <li
      className="group animate-signal-enter rounded-xl border border-edge/40 bg-panel/60 p-4 transition-colors hover:border-accent/30"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="flex items-start gap-4">
        {/* Conviction meter — the selective-silence score */}
        <div className="w-14 shrink-0 text-center">
          <p className="font-mono text-xl font-bold tabular-nums text-accent">{conviction}</p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-edge/40">
            <div
              className={cn('h-full rounded-full', conviction >= 70 ? 'bg-signal' : 'bg-accent/60')}
              style={{ width: `${conviction}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-600">
            {item.traded ? 'traded' : 'passed'}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('badge text-[10px] uppercase', actionTone)}>{action}</span>
            {item.asset && (
              <span className="font-mono text-xs font-semibold text-slate-200">{item.asset}</span>
            )}
            <span className="font-mono text-[10px] text-slate-500">
              {shortUrl(item.monitorUrl)}
            </span>
            {item.detectorTypes.length > 0 && (
              <span className="truncate font-mono text-[10px] text-slate-600">
                {item.detectorTypes.join(' · ')}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] text-slate-600">
              {timeAgo(item.createdAt)}
            </span>
          </div>
          {item.thesis && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-400 group-hover:text-slate-300">
              {item.thesis}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
              rubric {item.rubricVersion}
              {item.confidenceBand ? ` · ${item.confidenceBand}` : ''}
            </span>
            <Link
              href={`/signals/${item.signalId}`}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors hover:text-accent-glow"
            >
              full record <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}
