'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { Activity, ChevronDown, Clock, ExternalLink, GitBranch, Shield } from 'lucide-react';
import { api, type Monitor } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { urlType, repoLabel, timeAgo, freqLabel, assetTicker, statusDotColor } from '@/lib/format';
import { PageLoader, PageError } from '@/components/ui/page-states';

type DomainFilter = 'all' | 'code' | 'bio';

// System monitors (thesis synthesis, scanners) aren't GitHub repos —
// they get their own quiet section instead of mixing into repo tiles.
function isSystemMonitor(m: Monitor): boolean {
  return urlType(m.url) === 'other';
}

function monitorDomain(mons: Monitor[]): 'code' | 'bio' {
  return mons.some((m) => m.domain === 'bio') ? 'bio' : 'code';
}

function DomainTag({ domain }: { domain: 'code' | 'bio' }) {
  return (
    <span
      className={`rounded border px-1 py-px font-mono text-[9px] uppercase tracking-wider ${
        domain === 'bio'
          ? 'border-signal/30 bg-signal/10 text-signal'
          : 'border-accent/30 bg-accent/10 text-accent'
      }`}
    >
      [{domain}]
    </span>
  );
}

export default function MonitorsPage() {
  const {
    data: monitors,
    isLoading,
    isError,
  } = useQuery<Monitor[]>({
    queryKey: qk.monitors(),
    queryFn: () => api.listMonitors(),
    refetchInterval: REFETCH.slow,
  });

  // One repo expanded at a time — the user controls how much is on screen.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<DomainFilter>('all');

  if (isLoading) return <PageLoader label="Loading monitors…" />;
  if (isError || !monitors) return <PageError message="Failed to load monitors." />;

  // Group monitors by repo.
  const grouped = new Map<string, Monitor[]>();
  for (const m of monitors) {
    const key = repoLabel(m.url);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  const repos = [...grouped.entries()].filter(([_, mons]) => !isSystemMonitor(mons[0]));
  const system = [...grouped.entries()].filter(([_, mons]) => isSystemMonitor(mons[0]));

  // Puzzle order: bio first, then code; alphabetical within each domain.
  repos.sort((a, b) => {
    const da = monitorDomain(a[1]);
    const db = monitorDomain(b[1]);
    if (da !== db) return da === 'bio' ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });

  const visibleRepos =
    filter === 'all' ? repos : repos.filter(([_, mons]) => monitorDomain(mons) === filter);

  const activeCount = monitors.filter((m) => m.status === 'active').length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">Watchlist</h1>
          <p className="mt-1 text-sm text-slate-400">
            {monitors.length} monitors · {grouped.size} repos · same coverage as a customer
            leak-scan
          </p>
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="Filter by domain">
          {(['all', 'code', 'bio'] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded border px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                filter === f
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-edge/40 text-slate-500 hover:border-edge hover:text-slate-300'
              }`}
            >
              {f === 'all' ? `all ${repos.length}` : `[${f}]`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Repo tiles: dense grid, click to expand ── */}
      <div className="grid grid-cols-1 gap-2 [grid-auto-flow:row_dense] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleRepos.map(([repo, mons]) => {
          const domain = monitorDomain(mons);
          const isOpen = expanded === repo;
          const latestCheck = mons.reduce(
            (latest, m) =>
              !latest || (m.lastCheckAt && m.lastCheckAt > latest) ? m.lastCheckAt : latest,
            null as string | null,
          );
          const allActive = mons.every((m) => m.status === 'active');
          const assets = [
            ...new Set(
              mons.map((m) => m.assetMapping?.coingeckoId).filter((id): id is string => !!id),
            ),
          ];

          return (
            <div
              key={repo}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : repo)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded(isOpen ? null : repo);
                }
              }}
              className={`group cursor-pointer rounded-xl border p-3 text-left transition-all duration-quick ease-smooth-out ${
                isOpen
                  ? 'col-span-full border-accent/40 bg-panel shadow-glow-sm'
                  : 'border-edge/60 bg-panel/60 hover:-translate-y-px hover:border-accent/40 hover:bg-panel hover:shadow-card'
              }`}
            >
              {/* Tile header — always visible, one compact row */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    allActive ? 'bg-signal' : 'bg-warn'
                  } ${allActive ? 'animate-pulse' : ''}`}
                  title={allActive ? 'all monitors active' : 'a monitor is paused'}
                />
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span
                  className={`min-w-0 truncate text-sm font-medium transition-colors ${
                    isOpen ? 'text-slate-100' : 'text-slate-300 group-hover:text-accent'
                  }`}
                >
                  {repo}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <DomainTag domain={domain} />
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-quick ease-smooth-out ${
                      isOpen ? 'rotate-180 text-accent' : ''
                    }`}
                  />
                </span>
              </div>

              {/* Tile meta — badges only, no sentences */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {assets.length > 0 && (
                  <span className="flex h-5 items-center justify-center rounded bg-accent/10 px-1.5 font-mono text-[10px] font-bold text-accent">
                    {assets.map(assetTicker).join(' · ')}
                  </span>
                )}
                {[...new Set(mons.map((m) => urlType(m.url)))].map((t) => (
                  <span
                    key={t}
                    className="rounded border border-edge/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-500"
                  >
                    {t}
                  </span>
                ))}
                <span className="font-mono text-[10px] text-slate-600">
                  {mons.length} {mons.length === 1 ? 'monitor' : 'monitors'}
                </span>
                <span className="ml-auto font-mono text-[10px] text-slate-600">
                  {latestCheck ? `checked ${timeAgo(latestCheck)}` : 'never checked'}
                </span>
              </div>

              {/* Expanded detail — monitor rows, revealed on click */}
              {isOpen && (
                <div className="mt-3 space-y-2 border-t border-edge/40 pt-3 animate-fade-in">
                  {mons.map((m) => {
                    const type = urlType(m.url);
                    const asset = m.assetMapping?.coingeckoId;
                    return (
                      <Link
                        key={m.id}
                        href="/scorecard"
                        onClick={(e: MouseEvent) => e.stopPropagation()}
                        className="flex items-start gap-3 rounded-lg border border-edge/40 bg-ink-light/40 p-2.5 transition-colors hover:border-accent/40"
                      >
                        <span
                          className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusDotColor(m.status)}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] uppercase text-slate-400">
                              {type}
                            </span>
                            {asset && (
                              <span className="font-mono text-[10px] font-bold text-accent">
                                {assetTicker(asset)}
                              </span>
                            )}
                            <span className="ml-auto flex items-center gap-3 font-mono text-[10px] text-slate-600">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {freqLabel(m.frequencySeconds)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                conf {m.confidenceThreshold}
                              </span>
                              <span className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                {timeAgo(m.lastCheckAt)}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">
                            {m.conditionText}
                          </p>
                        </div>
                        <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-slate-600" />
                      </Link>
                    );
                  })}
                  <div className="flex justify-end">
                    <a
                      href={`https://github.com/${repo}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                      className="font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-accent"
                    >
                      open repo ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── System monitors — quiet single row, no tiles ── */}
      {system.length > 0 && filter === 'all' && (
        <div className="mt-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">
            system
          </p>
          <div className="flex flex-wrap gap-2">
            {system.map(([name, mons]) => {
              const m = mons[0];
              return (
                <span
                  key={name}
                  title={m.conditionText}
                  className="inline-flex items-center gap-2 rounded-lg border border-edge/50 bg-panel/40 px-2.5 py-1.5 font-mono text-[10px] text-slate-500"
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotColor(m.status)}`}
                  />
                  {name}
                  <span className="text-slate-600">· {freqLabel(m.frequencySeconds)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {monitors.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge/60 p-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">No monitors yet</p>
        </div>
      )}
    </div>
  );
}
