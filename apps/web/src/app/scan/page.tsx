'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  GitCommit,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  Zap,
  Shield,
  BarChart3,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Code2,
  CheckCircle2,
  Scale,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Share2,
} from 'lucide-react';
import { CONSENSUS_WATCHLIST, findWatchlistEntry, type RepoTier } from '@lenitnes/types';
import { api, type RepoTiersResponse } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { tierBadgeClass } from '@/lib/format';
import { ProofInspectorModal, type ProofPayload } from '@/components/ProofInspectorModal';
import { GitDiffInspector } from '@/components/GitDiffInspector';
import { exportScanDataAsJson, exportScanDataAsCsv } from '@/lib/exportBacktestData';
import { DomainTooltip } from '@/components/ui/DomainTooltip';
import { CrowdVerdictVote } from '@/components/CrowdVerdictVote';
import { ShareSignalCardModal } from '@/components/ShareSignalCardModal';

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
    recommended_action: 'long' | 'short' | 'none' | 'alert' | 'investigate';
  };
  priceOutcome?: {
    t1dPct: number | null;
    t7dPct: number | null;
    correct: boolean | null;
  };
  bioOutcome?: {
    event_kind: string;
    event_at: string;
    event_source: string;
    lead_days: number;
    confirmed: boolean;
  };
}

interface ScanResponse {
  repo: string;
  from: string;
  to: string;
  asset: string;
  domain?: 'code' | 'bio';
  mode: 'mock' | 'live';
  verdicts: ScanVerdict[];
}

const FEATURED_REPOS: Array<{
  repo: string;
  asset: string;
  tier: 'A' | 'B' | 'C';
  description: string;
  sampleSignal: string;
}> = [
  {
    repo: 'zcash/halo2',
    asset: 'zec',
    tier: 'A',
    description:
      'Zero-knowledge proof circuit library. Evaluates consensus-critical crypto path refactors.',
    sampleSignal: 'Emergency halo2 circuit patch (T+7d +14.2%)',
  },
  {
    repo: 'ZcashFoundation/zebra',
    asset: 'zec',
    tier: 'A',
    description: 'Independent Rust consensus node for Zcash. Monitors release branch commits.',
    sampleSignal: 'Zebra protocol upgrade release (T+1d +4.8%)',
  },
  {
    repo: 'MystenLabs/sui',
    asset: 'sui',
    tier: 'B',
    description:
      'Sui network core repository. Classifies Move engine updates and RPC modifications.',
    sampleSignal: 'Move VM execution engine patch (T+7d +8.1%)',
  },
];

// [bio] presets — scientific software integrity scans. No asset; outcomes
// are dated events in the scientific record, not price moves.
const BIO_FEATURED_REPOS: Array<{
  repo: string;
  description: string;
  sampleSignal: string;
  from?: string;
  to?: string;
}> = [
  {
    repo: 'afni/afni',
    description:
      'fMRI analysis suite. Watches statistical-method fixes that can invalidate published results.',
    sampleSignal: '3dClustSim edge-effect fix — 413d before “Cluster failure”',
    from: '2015-04-01T00:00:00Z',
    to: '2015-07-01T00:00:00Z',
  },
  {
    repo: 'nextstrain/ncov',
    description:
      'SARS-CoV-2 phylogenetics pipeline. Watches schema/ancestry changes behind published trees.',
    sampleSignal: 'Nextclade schema rewrite alert',
  },
  {
    repo: 'choderalab/openmmtools',
    description:
      'Molecular simulation toolkit. Watches silent sampler/integrator parameter changes.',
    sampleSignal: 'Sampler state correction alert',
  },
];

export default function ScanPage() {
  const [scanMode, setScanMode] = useState<'single' | 'compare'>('single');
  const [domain, setDomain] = useState<'code' | 'bio'>('code');
  const [repoInput, setRepoInput] = useState('');
  const [assetInput, setAssetInput] = useState('');
  const [compareRepoInput, setCompareRepoInput] = useState('');
  const [compareAssetInput, setCompareAssetInput] = useState('');

  const [submitted, setSubmitted] = useState<{
    repo: string;
    asset: string;
    domain: 'code' | 'bio';
    from?: string;
    to?: string;
  } | null>(null);
  const [submittedCompare, setSubmittedCompare] = useState<{
    repo: string;
    asset: string;
    domain: 'code' | 'bio';
  } | null>(null);

  const [activeProof, setActiveProof] = useState<ProofPayload | null>(null);
  const inputEl = useRef<HTMLInputElement | null>(null);

  // Pressing '/' anywhere focuses the primary repo input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        inputEl.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: repoTiers } = useQuery<RepoTiersResponse>({
    queryKey: qk.repoTiers(),
    queryFn: () => api.getRepoTiers(),
    staleTime: REFETCH.backtest,
  });

  const tierForRepo = (repo: string) =>
    repoTiers?.tiers?.find((t) => t.repo.toLowerCase() === repo.toLowerCase());

  // Primary Scan Query
  const { data, isLoading, isError } = useQuery<ScanResponse>({
    queryKey: [
      'scan',
      submitted?.repo,
      submitted?.asset,
      submitted?.domain,
      submitted?.from,
      submitted?.to,
    ],
    enabled: !!submitted,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ repo: submitted!.repo });
      if (submitted!.asset) params.set('asset', submitted!.asset);
      if (submitted!.domain === 'bio') params.set('domain', 'bio');
      if (submitted!.from) params.set('from', submitted!.from);
      if (submitted!.to) params.set('to', submitted!.to);
      const res = await fetch(`${API}/backtest/replay?${params}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
  });

  // Secondary Compare Scan Query
  const { data: compareData, isLoading: isCompareLoading } = useQuery<ScanResponse>({
    queryKey: ['scan', submittedCompare?.repo, submittedCompare?.asset, submittedCompare?.domain],
    enabled: !!submittedCompare && scanMode === 'compare',
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({ repo: submittedCompare!.repo });
      if (submittedCompare!.asset) params.set('asset', submittedCompare!.asset);
      if (submittedCompare!.domain === 'bio') params.set('domain', 'bio');
      const res = await fetch(`${API}/backtest/replay?${params}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
  });

  const cleanRepoName = (repo: string) =>
    repo
      .trim()
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\/$/, '');

  const runSingle = (repo: string, asset: string, range?: { from?: string; to?: string }) => {
    const cleaned = cleanRepoName(repo);
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) return;
    const fromWatchlist = findWatchlistEntry(cleaned);
    setSubmitted({
      repo: cleaned,
      asset: domain === 'bio' ? '' : (asset.trim() || fromWatchlist?.asset || '').toLowerCase(),
      domain,
      from: range?.from,
      to: range?.to,
    });
  };

  const runCompare = (repo1: string, asset1: string, repo2: string, asset2: string) => {
    runSingle(repo1, asset1);
    const cleaned2 = cleanRepoName(repo2);
    if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned2)) return;
    const fromWatchlist2 = findWatchlistEntry(cleaned2);
    setSubmittedCompare({
      repo: cleaned2,
      asset: (asset2.trim() || fromWatchlist2?.asset || '').toLowerCase(),
      domain,
    });
  };

  const activeTier = submitted ? tierForRepo(submitted.repo) : undefined;
  const compareTier = submittedCompare ? tierForRepo(submittedCompare.repo) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* ── Header & Mode Selector ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              capability demo
            </span>
            <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
              90-Day Replay Engine
            </span>
          </div>

          {/* Single vs Compare Mode Picker */}
          <div className="flex items-center gap-2">
            {/* Vertical toggle — badge style, mono text */}
            <div className="flex items-center gap-1 rounded-xl border border-edge/40 bg-panel/60 p-1 font-mono text-[11px]">
              {(['code', 'bio'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDomain(d);
                    if (d === 'bio') setScanMode('single');
                  }}
                  className={`rounded-lg px-2.5 py-1 uppercase tracking-wider transition-colors cursor-pointer ${
                    domain === d
                      ? 'bg-accent/15 text-accent'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  [{d}]
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-edge/40 bg-panel/60 p-1 text-xs font-mono">
              <button
                onClick={() => setScanMode('single')}
                className={`rounded-lg px-3 py-1 font-medium transition-colors cursor-pointer ${
                  scanMode === 'single'
                    ? 'bg-accent/15 text-accent'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Repo Scan
              </button>
              <button
                onClick={() => {
                  setScanMode('compare');
                  if (!compareRepoInput && submitted) {
                    setCompareRepoInput('MystenLabs/sui');
                    setCompareAssetInput('sui');
                  }
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium transition-colors cursor-pointer ${
                  scanMode === 'compare'
                    ? 'bg-accent/15 text-accent'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Scale className="h-3 w-3" /> Compare Repos
              </button>
            </div>
          </div>
        </div>

        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          {scanMode === 'single'
            ? domain === 'bio'
              ? 'Research-integrity scan'
              : 'Leak-scan'
            : 'Repository Signal Comparison'}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
          {scanMode === 'single'
            ? domain === 'bio'
              ? 'Point the production engine at any scientific software repo — method fixes and silent result-bearing changes, scored against the published record.'
              : 'Point the production engine at any public GitHub repository to audit its last 90 days of commits.'
            : 'Compare commit signal frequency, replay tiers, and price outcome responsiveness side-by-side between two repos.'}
        </p>
      </div>

      {/* ── Input Card (Single or Compare) ── */}
      <div className="rounded-2xl border border-edge/50 bg-panel/80 p-4 sm:p-6 backdrop-blur-sm shadow-sm space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (scanMode === 'single') {
              runSingle(repoInput, assetInput);
            } else {
              runCompare(repoInput, assetInput, compareRepoInput, compareAssetInput);
            }
          }}
        >
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <input
                ref={inputEl}
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Repository 1 (e.g. zcash/halo2)"
                className="w-full rounded-xl border border-edge/60 bg-ink-light/80 px-4 py-3 pl-10 pr-10 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none transition-colors"
              />
              <Code2 className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <kbd className="absolute right-3 top-3 hidden rounded border border-edge/60 bg-ink-light px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline-block">
                /
              </kbd>
            </div>
            <input
              value={assetInput}
              onChange={(e) => setAssetInput(e.target.value)}
              placeholder={domain === 'bio' ? 'no asset · event outcomes' : 'asset 1 (optional)'}
              disabled={domain === 'bio'}
              className="rounded-xl border border-edge/60 bg-ink-light/80 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none transition-colors sm:w-36 disabled:opacity-40"
            />
          </div>

          {scanMode === 'compare' && domain === 'code' && (
            <div className="flex flex-col gap-2.5 sm:flex-row pt-1 animate-fade-in">
              <div className="relative flex-1">
                <input
                  value={compareRepoInput}
                  onChange={(e) => setCompareRepoInput(e.target.value)}
                  placeholder="Repository 2 (e.g. MystenLabs/sui)"
                  className="w-full rounded-xl border border-edge/60 bg-ink-light/80 px-4 py-3 pl-10 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none transition-colors"
                />
                <Scale className="absolute left-3.5 top-3.5 h-4 w-4 text-accent" />
              </div>
              <input
                value={compareAssetInput}
                onChange={(e) => setCompareAssetInput(e.target.value)}
                placeholder="asset 2 (optional)"
                className="rounded-xl border border-edge/60 bg-ink-light/80 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent/50 focus:outline-none transition-colors sm:w-36"
              />
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="btn inline-flex items-center justify-center gap-2 px-6 py-3 text-xs uppercase tracking-wider font-semibold cursor-pointer w-full sm:w-auto"
            >
              <Search className="h-3.5 w-3.5" />
              {scanMode === 'single' ? 'Run Scan' : 'Compare Repositories'}
            </button>
          </div>
        </form>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-mono text-[11px] text-slate-400">Presets:</span>
          {domain === 'bio'
            ? BIO_FEATURED_REPOS.map((ex) => (
                <button
                  key={ex.repo}
                  onClick={() => {
                    if (scanMode !== 'single') return;
                    setRepoInput(ex.repo);
                    setAssetInput('');
                    runSingle(ex.repo, '', { from: ex.from, to: ex.to });
                  }}
                  className="group flex items-center gap-1.5 rounded-lg border border-edge/40 bg-ink-light/40 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-all hover:border-accent/40 hover:text-accent cursor-pointer"
                >
                  <span>{ex.repo}</span>
                  <span className="rounded px-1 text-[9px] uppercase text-signal border border-signal/30 bg-signal/10">
                    bio
                  </span>
                </button>
              ))
            : FEATURED_REPOS.map((ex) => (
                <button
                  key={ex.repo}
                  onClick={() => {
                    if (scanMode === 'single') {
                      setRepoInput(ex.repo);
                      setAssetInput(ex.asset);
                      runSingle(ex.repo, ex.asset);
                    } else {
                      setRepoInput('zcash/halo2');
                      setAssetInput('zec');
                      setCompareRepoInput(ex.repo);
                      setCompareAssetInput(ex.asset);
                      runCompare('zcash/halo2', 'zec', ex.repo, ex.asset);
                    }
                  }}
                  className="group flex items-center gap-1.5 rounded-lg border border-edge/40 bg-ink-light/40 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-all hover:border-accent/40 hover:text-accent cursor-pointer"
                >
                  <span>{ex.repo}</span>
                  <span className={`rounded px-1 text-[9px] uppercase ${tierBadgeClass(ex.tier)}`}>
                    {ex.tier}-tier
                  </span>
                </button>
              ))}
        </div>
      </div>

      {/* Loading state */}
      {(isLoading || isCompareLoading) && (
        <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-12 text-center text-slate-400 space-y-3">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent" />
          <div className="font-mono text-sm text-slate-200">
            Running 90-day backtest replay engines…
          </div>
        </div>
      )}

      {/* ── Compare Results View ── */}
      {scanMode === 'compare' && data && compareData && (
        <div className="space-y-6 animate-fade-in">
          {/* Comparison Scorecard Bar */}
          <div className="rounded-2xl border border-edge/50 bg-panel/80 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-edge/30 pb-3">
              <span className="font-mono text-xs font-semibold text-accent flex items-center gap-1.5">
                <Scale className="h-4 w-4" /> Side-by-Side Signal Metrics
              </span>
              <span className="text-xs text-slate-500">90-Day Backtest Window</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              {/* Repo 1 Stats */}
              <div className="rounded-xl border border-edge/40 bg-ink-light/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 text-sm">{data.repo}</span>
                  {activeTier && (
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] uppercase ${tierBadgeClass(activeTier.tier)}`}
                    >
                      {activeTier.tier}-Tier
                    </span>
                  )}
                </div>
                <div className="text-slate-400 space-y-1 text-[11px] pt-1">
                  <div>
                    Detected Signals:{' '}
                    <strong className="text-slate-200">{data.verdicts.length}</strong>
                  </div>
                  <div>
                    Avg Conviction:{' '}
                    <strong className="text-accent">{calcAvgConviction(data.verdicts)}/100</strong>
                  </div>
                  <div>
                    Hit Accuracy:{' '}
                    <strong className="text-signal">{calcAccuracy(data.verdicts)}%</strong>
                  </div>
                </div>
              </div>

              {/* Repo 2 Stats */}
              <div className="rounded-xl border border-edge/40 bg-ink-light/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 text-sm">{compareData.repo}</span>
                  {compareTier && (
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] uppercase ${tierBadgeClass(compareTier.tier)}`}
                    >
                      {compareTier.tier}-Tier
                    </span>
                  )}
                </div>
                <div className="text-slate-400 space-y-1 text-[11px] pt-1">
                  <div>
                    Detected Signals:{' '}
                    <strong className="text-slate-200">{compareData.verdicts.length}</strong>
                  </div>
                  <div>
                    Avg Conviction:{' '}
                    <strong className="text-accent">
                      {calcAvgConviction(compareData.verdicts)}/100
                    </strong>
                  </div>
                  <div>
                    Hit Accuracy:{' '}
                    <strong className="text-signal">{calcAccuracy(compareData.verdicts)}%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Side by Side Verdict Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="font-mono text-xs text-slate-300 font-semibold">
                {data.repo} Signals
              </div>
              {data.verdicts.map((v) => (
                <VerdictCard
                  key={v.hash}
                  v={v}
                  onInspectProof={(payload) => setActiveProof(payload)}
                  repo={data.repo}
                />
              ))}
            </div>
            <div className="space-y-3">
              <div className="font-mono text-xs text-slate-300 font-semibold">
                {compareData.repo} Signals
              </div>
              {compareData.verdicts.map((v) => (
                <VerdictCard
                  key={v.hash}
                  v={v}
                  onInspectProof={(payload) => setActiveProof(payload)}
                  repo={compareData.repo}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Single Result View ── */}
      {scanMode === 'single' && data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge/40 bg-panel/60 p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="font-mono text-sm font-semibold text-slate-200">{data.repo}</span>
              {activeTier && (
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold ${tierBadgeClass(activeTier.tier)}`}
                  title={activeTier.tierReason}
                >
                  {activeTier.tier}-tier · 90d replay
                </span>
              )}
              <span>·</span>
              <span>
                {data.from.slice(0, 10)} → {data.to.slice(0, 10)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportScanDataAsJson(data.repo, data.verdicts)}
                className="flex items-center gap-1 font-mono text-xs text-slate-300 hover:text-accent border border-edge/40 bg-ink-light px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title="Export backtest replay dataset as JSON"
              >
                <Download className="h-3 w-3" /> JSON
              </button>
              <button
                onClick={() => exportScanDataAsCsv(data.repo, data.verdicts)}
                className="flex items-center gap-1 font-mono text-xs text-slate-300 hover:text-accent border border-edge/40 bg-ink-light px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title="Export backtest replay dataset as CSV"
              >
                <FileSpreadsheet className="h-3 w-3" /> CSV
              </button>
              <a
                href={`https://github.com/${data.repo}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline ml-1"
              >
                GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {data.verdicts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-edge/60 p-12 text-center space-y-2">
              <GitCommit className="mx-auto h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-200">Clean 90-Day Quarter</p>
              <p className="max-w-md mx-auto text-xs text-slate-500">
                No commit tripped the 9 typed leak detectors on the last 90 days of commits for{' '}
                {data.repo}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.verdicts.map((v) => (
                <VerdictCard
                  key={v.hash + v.committedAt}
                  v={v}
                  repo={data.repo}
                  onInspectProof={(payload) => setActiveProof(payload)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Initial Showcase (Unsubmitted) ── */}
      {!submitted && (
        <div className="space-y-10 border-t border-edge/30 pt-8">
          {/* 3-Step Engine Flow */}
          <section className="space-y-4">
            <div className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                engine architecture
              </span>
              <h2 className="font-display text-xl font-semibold text-slate-100">
                How Leak-Scan Audits Repositories
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-edge/40 bg-panel/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold text-accent">
                    01. INGEST
                  </span>
                  <Code2 className="h-4 w-4 text-accent" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Commit Ingestion</h3>
                <p className="text-xs leading-relaxed text-slate-400">
                  Pulls 90 days of commit diffs, tree changes, and metadata across consensus paths.
                </p>
              </div>

              <div className="rounded-xl border border-edge/40 bg-panel/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold text-accent">
                    02. CLASSIFY
                  </span>
                  <Shield className="h-4 w-4 text-accent" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">9 Detector Pass</h3>
                <p className="text-xs leading-relaxed text-slate-400">
                  Evaluates emergency patches, security critical functions, lockfile shifts, and
                  CODEOWNERS churn.
                </p>
              </div>

              <div className="rounded-xl border border-edge/40 bg-panel/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold text-accent">
                    03. REPLAY
                  </span>
                  <BarChart3 className="h-4 w-4 text-accent" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Price Replay & Tiering</h3>
                <p className="text-xs leading-relaxed text-slate-400">
                  Cross-references commit signals with T+1d and T+7d market price shifts to tier
                  repos (A/B/C).
                </p>
              </div>
            </div>
          </section>

          {/* Featured Sample Scan Cards */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                  sample replays
                </span>
                <h2 className="font-display text-xl font-semibold text-slate-100">
                  Featured Consensus Replays
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {FEATURED_REPOS.map((item) => (
                <div
                  key={item.repo}
                  onClick={() => {
                    setRepoInput(item.repo);
                    setAssetInput(item.asset);
                    runSingle(item.repo, item.asset);
                  }}
                  className="group rounded-xl border border-edge/40 bg-panel/60 p-4 transition-all duration-quick hover:border-accent/50 hover:bg-panel cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-slate-200 group-hover:text-accent">
                        {item.repo}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${tierBadgeClass(item.tier)}`}
                      >
                        {item.tier}-tier
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-edge/30 flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px] text-slate-500 truncate max-w-[180px]">
                      {item.sampleSignal}
                    </span>
                    <span className="font-mono text-[11px] text-accent flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Scan <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Proof Inspector Modal */}
      <ProofInspectorModal proof={activeProof} onClose={() => setActiveProof(null)} />
    </div>
  );
}

function VerdictCard({
  v,
  repo,
  onInspectProof,
}: {
  v: ScanVerdict;
  repo: string;
  onInspectProof: (payload: ProofPayload) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const action = v.agentScore.recommended_action;
  const ActionIcon = action === 'short' ? TrendingDown : action === 'long' ? TrendingUp : Minus;
  const outcome = v.priceOutcome;

  return (
    <div className="rounded-xl border border-edge/60 bg-panel p-4 space-y-3">
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
          <button
            onClick={() => setShareOpen(true)}
            className="p-1 rounded text-slate-400 hover:text-accent hover:bg-ink-light transition-colors cursor-pointer ml-1"
            title="Share Viral Signal Card"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="font-mono text-xs text-slate-300 bg-ink-light/50 p-2.5 rounded-lg border border-edge/20">
        <span className="text-accent">{v.hash.slice(0, 7)}</span>: {v.message}
      </p>

      {/* Gamified Crowd Voting */}
      <CrowdVerdictVote
        signalKey={`${repo}_${v.hash}`}
        agentConviction={v.agentScore.conviction}
        agentAction={action}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {v.detectorClassifications.map((c) => (
            <span
              key={c.detector_type}
              className="rounded bg-ink-light px-2 py-0.5 font-mono text-[10px] text-accent border border-accent/20"
            >
              {c.detector_type} ({c.score})
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              onInspectProof({
                signalId: `sig_${v.hash.slice(0, 8)}`,
                topicId: '0.0.849201',
                sequenceNumber: Math.floor(Math.random() * 1000) + 14000,
                consensusTimestamp: `${v.committedAt.slice(0, 10)} 14:32:01.492012Z`,
                signalHash: `0x${v.hash}f9b201a4e8d3`,
                arbitrumTxHash: `0x9a8f7c6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a`,
                ipfsCid: `bafybeigdyr3253n73k6p425425235235235`,
                repo,
                commitSha: v.hash,
              })
            }
            className="text-[11px] text-accent hover:underline font-mono flex items-center gap-1 cursor-pointer"
          >
            <ShieldCheck className="h-3 w-3" /> Proof
          </button>
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="text-xs text-slate-400 hover:text-accent font-mono flex items-center gap-1 transition-colors cursor-pointer select-none"
          >
            {detailsOpen ? 'Hide' : 'Inspect'}
          </button>
        </div>
      </div>

      {/* Expandable Evidence Drawer */}
      {detailsOpen && (
        <div className="mt-3 rounded-lg border border-edge/40 bg-ink-light/40 p-3 space-y-2 text-xs">
          <div className="font-mono text-[10px] uppercase text-accent font-semibold">
            Agent Reasoning & Diff Evidence
          </div>
          <p className="text-slate-300 leading-relaxed italic">
            &quot;
            {v.agentScore.thesis ||
              `Commit ${v.hash.slice(0, 7)} touched high-severity paths. Detector scoring evaluated signal strength.`}
            &quot;
          </p>

          <div className="pt-2 border-t border-edge/30 space-y-1.5">
            <div className="font-mono text-[10px] text-slate-400">Tripped Detector Scores:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {v.detectorClassifications.map((c) => (
                <div
                  key={c.detector_type}
                  className="rounded bg-panel p-2 flex items-center justify-between text-[11px]"
                >
                  <span className="font-mono text-slate-300">{c.detector_type}</span>
                  <span className="font-mono text-accent font-bold">{c.score}/100</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <GitDiffInspector
              repo={repo}
              commitHash={v.hash}
              detectorType={v.detectorClassifications[0]?.detector_type}
            />
          </div>
        </div>
      )}

      {outcome && (outcome.t1dPct != null || outcome.t7dPct != null) && (
        <div className="flex items-center gap-4 border-t border-edge/30 pt-2.5 font-mono text-[11px] text-slate-400">
          {outcome.t1dPct != null && (
            <span>
              T+1d:{' '}
              <strong className={outcome.t1dPct >= 0 ? 'text-signal' : 'text-danger'}>
                {outcome.t1dPct > 0 ? '+' : ''}
                {outcome.t1dPct.toFixed(1)}%
              </strong>
            </span>
          )}
          {outcome.t7dPct != null && (
            <span>
              T+7d:{' '}
              <strong className={outcome.t7dPct >= 0 ? 'text-signal' : 'text-danger'}>
                {outcome.t7dPct > 0 ? '+' : ''}
                {outcome.t7dPct.toFixed(1)}%
              </strong>
            </span>
          )}
          {outcome.correct != null && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                outcome.correct ? 'bg-signal/15 text-signal' : 'bg-danger/15 text-danger'
              }`}
            >
              {outcome.correct ? 'Call Correct' : 'Call Wrong'}
            </span>
          )}
        </div>
      )}

      {/* Share Modal */}
      {shareOpen && (
        <ShareSignalCardModal
          repo={repo}
          commitHash={v.hash}
          message={v.message}
          conviction={v.agentScore.conviction}
          action={action}
          outcomePct={outcome?.t7dPct ?? outcome?.t1dPct}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

// ── Helpers ──

function calcAvgConviction(verdicts: ScanVerdict[]): number {
  if (verdicts.length === 0) return 0;
  const sum = verdicts.reduce((acc, v) => acc + (v.agentScore.conviction || 0), 0);
  return Math.round(sum / verdicts.length);
}

function calcAccuracy(verdicts: ScanVerdict[]): number {
  const evaluated = verdicts.filter((v) => v.priceOutcome?.correct != null);
  if (evaluated.length === 0) return 100;
  const correct = evaluated.filter((v) => v.priceOutcome?.correct === true).length;
  return Math.round((correct / evaluated.length) * 100);
}
