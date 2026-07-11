'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, GitCommit, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { CONSENSUS_WATCHLIST, findWatchlistEntry } from '@lenitnes/types';
import { api, type RepoTiersResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { tierBadgeClass } from '@/lib/format';

// ─────────────────────────────────────────────────────────────
// /scan — the leak-scan demo. Point the production engine at any
// public GitHub repo and see what its commit history signaled,
// day by day. Public scans run the real detectors with
// deterministic scoring (no LLM); engagements get full agent
// reasoning. One page, show-don't-tell — this is the enterprise
// pitch as a working product instead of a paragraph.
// ─────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

interface ScanVerdict {
  hash: string;
  message: string;
  committedAt: string;
  commitCount?: number;
  detectorClassifications: Array<{ detector_type: string; score: number }>;
  agentScore: {
    conviction: number;
    thesis: string;
    recommended_action: 'long' | 'short' | 'none';
  };
  priceOutcome?: {
    t1dPct: number | null;
    t7dPct: number | null;
    correct: boolean | null;
  };
}

interface ScanResponse {
  repo: string;
  from: string;
  to: string;
  asset: string;
  mode: 'mock' | 'live';
  verdicts: ScanVerdict[];
}

const EXAMPLES = ['zcash/halo2', 'ZcashFoundation/zebra', 'MystenLabs/sui'].map((repo) => {
  const entry = findWatchlistEntry(repo)!;
  return { repo: entry.repo, asset: entry.asset };
});

export default function ScanPage() {
  const [repoInput, setRepoInput] = useState('');
  const [assetInput, setAssetInput] = useState('');
  const [submitted, setSubmitted] = useState<{ repo: string; asset: string } | null>(null);

  const { data: repoTiers } = useQuery<RepoTiersResponse>({
    queryKey: qk.repoTiers(),
    queryFn: () => api.getRepoTiers(),
    staleTime: REFETCH.backtest,
  });

  const tierForRepo = (repo: string) =>
    repoTiers?.tiers?.find((t) => t.repo.toLowerCase() === repo.toLowerCase());

  const { data, isLoading, isError } = useQuery<ScanResponse>({
    queryKey: ['scan', submitted?.repo, submitted?.asset],
    enabled: !!submitted,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ repo: submitted!.repo });
      if (submitted!.asset) params.set('asset', submitted!.asset);
      const res = await fetch(`${API}/backtest/replay?${params}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
  });

  const run = (repo: string, asset: string) => {
    const cleaned = repo
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\/$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) return;
    const fromWatchlist = findWatchlistEntry(cleaned);
    setSubmitted({
      repo: cleaned,
      asset: (asset.trim() || fromWatchlist?.asset || '').toLowerCase(),
    });
  };

  const activeTier = submitted ? tierForRepo(submitted.repo) : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-slate-100">Leak-scan</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          The same nine detectors that build the public track record, pointed at any repo&apos;s
          last 90 days. What did the commits signal — before anyone announced it? Watchlist repos
          show their A/B/C replay tier when available.
        </p>
      </div>

      <form
        className="mb-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(repoInput, assetInput);
        }}
      >
        <input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          placeholder="owner/repo — e.g. ZcashFoundation/zebra"
          className="flex-1 rounded-xl border border-edge/60 bg-panel px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent/50 focus:outline-none"
        />
        <input
          value={assetInput}
          onChange={(e) => setAssetInput(e.target.value)}
          placeholder="asset (optional)"
          className="rounded-xl border border-edge/60 bg-panel px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-accent/50 focus:outline-none sm:w-40"
        />
        <button
          type="submit"
          className="btn inline-flex items-center justify-center gap-2 px-6 py-3 text-xs uppercase tracking-wider"
        >
          <Search className="h-3.5 w-3.5" />
          Scan
        </button>
      </form>

      <div className="mb-10 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        watchlist:
        {EXAMPLES.map((ex) => (
          <button
            key={ex.repo}
            onClick={() => {
              setRepoInput(ex.repo);
              setAssetInput(ex.asset);
              run(ex.repo, ex.asset);
            }}
            className="rounded-md border border-edge/40 px-2 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:border-accent/40 hover:text-accent"
          >
            {ex.repo}
          </button>
        ))}
        <span className="text-slate-600">·</span>
        <span className="font-mono text-[10px] text-slate-600">
          {CONSENSUS_WATCHLIST.length} commit-level repos
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning {submitted?.repo} — fetching commits, running detectors…
        </div>
      )}

      {isError && (
        <div className="card border-danger/30 text-center text-sm text-danger">
          Scan failed — check the repo name (owner/repo, public repos only).
        </div>
      )}

      {data && (
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="font-mono text-slate-300">{data.repo}</span>
            {activeTier && (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${tierBadgeClass(activeTier.tier)}`}
                title={activeTier.tierReason}
              >
                {activeTier.tier}-tier · 90d replay
              </span>
            )}
            <span>·</span>
            <span>
              {data.from.slice(0, 10)} → {data.to.slice(0, 10)}
            </span>
            <span>·</span>
            <span className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {data.mode === 'mock' ? 'detector scoring' : 'live agent reasoning'}
            </span>
          </div>

          {activeTier?.tier === 'C' && (
            <p className="mb-4 rounded-lg border border-warn/20 bg-warn/[0.04] px-3 py-2 text-xs text-slate-400">
              This repo scored C-tier in our 90-day responsiveness sweep — high flag rate, weak
              historical price co-movement. Treat scan results as exploratory, not tradability
              proof.
            </p>
          )}

          {data.verdicts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-edge/60 p-10 text-center">
              <GitCommit className="mx-auto h-6 w-6 text-slate-500" />
              <p className="mt-3 text-sm text-slate-300">Clean quarter.</p>
              <p className="mt-1 text-xs text-slate-500">
                No detector fired on the last 90 days of commits — nothing here read as a leak.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.verdicts.map((v) => (
                <VerdictCard key={v.hash + v.committedAt} v={v} />
              ))}
            </div>
          )}

          <p className="mt-8 text-xs leading-relaxed text-slate-500">
            Public scans run the production detectors with deterministic scoring. Engagements add
            full agent reasoning (thesis per batch, calibrated conviction, private repos, scheduled
            delivery) — the engine behind the{' '}
            <a href="/scorecard" className="link-underline text-accent">
              public track record
            </a>
            . Tier rankings live on{' '}
            <a href="/calibration" className="link-underline text-accent">
              calibration
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function VerdictCard({ v }: { v: ScanVerdict }) {
  const action = v.agentScore.recommended_action;
  const ActionIcon = action === 'short' ? TrendingDown : action === 'long' ? TrendingUp : Minus;
  const outcome = v.priceOutcome;
  return (
    <div className="rounded-xl border border-edge/60 bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-slate-400">{v.committedAt.slice(0, 10)}</span>
          <span className="text-xs text-slate-500">
            {v.commitCount ?? 1} commit{(v.commitCount ?? 1) === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ActionIcon
            className={`h-3.5 w-3.5 ${action === 'none' ? 'text-slate-500' : 'text-accent'}`}
          />
          <span className="font-mono text-sm font-semibold text-slate-200">
            {v.agentScore.conviction}/100
          </span>
          <span className="font-mono text-[10px] uppercase text-slate-500">{action}</span>
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-xs text-slate-500">
        {v.hash.slice(0, 7)}: {v.message}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {v.detectorClassifications.map((c) => (
          <span
            key={c.detector_type}
            className="rounded bg-ink-light px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
          >
            {c.detector_type} {c.score}
          </span>
        ))}
      </div>
      {outcome && (outcome.t1dPct != null || outcome.t7dPct != null) && (
        <div className="mt-3 flex items-center gap-4 border-t border-edge/30 pt-2 font-mono text-[11px] text-slate-500">
          {outcome.t1dPct != null && <span>T+1d {outcome.t1dPct.toFixed(1)}%</span>}
          {outcome.t7dPct != null && <span>T+7d {outcome.t7dPct.toFixed(1)}%</span>}
          {outcome.correct != null && (
            <span className={outcome.correct ? 'text-signal' : 'text-danger'}>
              {outcome.correct ? 'call correct' : 'call wrong'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
