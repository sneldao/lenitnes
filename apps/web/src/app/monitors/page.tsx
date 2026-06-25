'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, Clock, Shield, ExternalLink, GitBranch } from 'lucide-react';
import { api, type Monitor } from '@/lib/api';
import {
  shortUrl,
  urlType,
  repoLabel,
  timeAgo,
  freqLabel,
  assetTicker,
  statusDotColor,
} from '@/lib/format';
import { PageLoader, PageError } from '@/components/ui/page-states';

export default function MonitorsPage() {
  const {
    data: monitors,
    isLoading,
    isError,
  } = useQuery<Monitor[]>({
    queryKey: ['monitors'],
    queryFn: () => api.listMonitors(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <PageLoader label="Loading monitors…" />;
  if (isError || !monitors) return <PageError message="Failed to load monitors." />;

  const grouped = new Map<string, Monitor[]>();
  for (const m of monitors) {
    const key = repoLabel(m.url);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-slate-100">Watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">
          {monitors.length} active monitors across {grouped.size} repositories
        </p>
      </div>

      <div className="space-y-6">
        {[...grouped.entries()].map(([repo, mons]) => {
          const latestCheck = mons.reduce(
            (latest, m) =>
              !latest || (m.last_check_at && m.last_check_at > latest) ? m.last_check_at : latest,
            null as string | null,
          );
          return (
            <div key={repo}>
              <div className="mb-2 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-slate-500" />
                <Link
                  href={`https://github.com/${repo}`}
                  className="text-sm font-medium text-slate-300 hover:text-accent transition-colors"
                  target="_blank"
                >
                  {repo}
                </Link>
                <span className="text-xs text-slate-500">checked {timeAgo(latestCheck)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mons.map((m) => {
                  const type = urlType(m.url);
                  const asset = m.asset_mapping?.coingeckoId ?? '?';
                  return (
                    <Link
                      key={m.id}
                      href={`/signals?monitorId=${m.id}`}
                      className="group relative rounded-xl border border-edge/60 bg-panel p-4 transition-all hover:border-accent/40 hover:shadow-card"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent/10 text-[10px] font-bold text-accent">
                            {assetTicker(asset)}
                          </span>
                          <span className="text-xs font-medium text-slate-400">{type}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotColor(m.status)}`}
                          />
                          <span className="text-[10px] uppercase text-slate-500">{m.status}</span>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {m.condition_text}
                      </p>

                      <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {freqLabel(m.frequency_seconds)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          conf {m.confidence_threshold}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {timeAgo(m.last_check_at)}
                        </span>
                      </div>

                      <ExternalLink className="absolute right-3 top-3 h-3 w-3 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {monitors.length === 0 && (
        <div className="rounded-xl border border-dashed border-edge/60 p-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-slate-500" />
          <p className="mt-3 text-sm text-slate-400">No monitors yet</p>
        </div>
      )}
    </div>
  );
}
