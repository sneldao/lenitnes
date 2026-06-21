'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  Clock,
  Shield,
  ExternalLink,
  GitBranch,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { api, type Monitor } from '@/lib/api';

function shortUrl(url: string): { label: string; type: 'release' | 'commits' } {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    if (path.includes('/releases')) return { label: path, type: 'release' };
    if (path.includes('/commits')) return { label: path, type: 'commits' };
    return { label: path, type: 'release' };
  } catch {
    return { label: url, type: 'release' };
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function freqLabel(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `Every ${mins}m`;
  const hours = Math.round(mins / 60);
  return `Every ${hours}h`;
}

function assetIcon(asset: string): string {
  const icons: Record<string, string> = {
    zcash: 'ZEC',
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL',
    arbitrum: 'ARB',
    sui: 'SUI',
  };
  return icons[asset] ?? asset.slice(0, 3).toUpperCase();
}

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

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading monitors...
        </div>
      </main>
    );
  }

  if (isError || !monitors) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center justify-center gap-3 text-red-400">
          <AlertCircle className="h-4 w-4" />
          Failed to load monitors
        </div>
      </main>
    );
  }

  const grouped = new Map<string, Monitor[]>();
  for (const m of monitors) {
    const key = shortUrl(m.url).label.split('/').slice(0, 2).join('/');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">
          {monitors.length} active monitors across {grouped.size} repositories
        </p>
      </div>

      <div className="space-y-6">
        {[...grouped.entries()].map(([repo, mons]) => {
          const totalSignals = 0; // would need a separate query
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
                  const urlInfo = shortUrl(m.url);
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
                            {assetIcon(asset)}
                          </span>
                          <span className="text-xs font-medium text-slate-400">{urlInfo.type}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                              m.status === 'active'
                                ? 'bg-green-500'
                                : m.status === 'paused'
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
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
                          {m.last_check_at ? timeAgo(m.last_check_at) : 'pending'}
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
    </main>
  );
}
