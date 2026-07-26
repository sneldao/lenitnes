'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { GitPullRequest, RefreshCw, Eye, Radio, GitCommitHorizontal, Zap } from 'lucide-react';
import {
  api,
  type IntelligenceSnapshot,
  type VelocityReading,
  type PullRequestReading,
  type NearMissSignal,
  type SynthesisActivity,
} from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { timeAgo, convictionColor, assetTicker } from '@/lib/format';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SkeletonList } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { SignalSourceBadge } from '@/components/SignalSourceBadge';

// ─────────────────────────────────────────────────────────────
// Intelligence — the visibility layer over the synthesis pipeline.
//
// The system runs three synthesis jobs every 2 hours (narrative,
// thesis, proactive) plus per-monitor commit detection. This page
// surfaces the reasoning surface even when nothing traded: the
// commit-velocity baseline of every watched repo, the impact score
// of every notable open PR, and the sub-threshold calls the agent
// evaluated and passed on. "We did the work even on quiet days."
// ─────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<IntelligenceSnapshot>({
    queryKey: qk.intelligence(),
    queryFn: () => api.getIntelligence(),
    refetchInterval: REFETCH.medium,
  });

  const refresh = useMutation({
    mutationFn: () => api.getIntelligence(true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.intelligence() }),
  });

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-8">
        <Breadcrumbs crumbs={[{ label: 'Intelligence' }]} />
        <h1 className="font-display text-2xl font-semibold text-slate-100">Intelligence</h1>
        <SkeletonList rows={3} />
        <SkeletonList rows={5} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="animate-fade-in space-y-8">
        <Breadcrumbs crumbs={[{ label: 'Intelligence' }]} />
        <h1 className="font-display text-2xl font-semibold text-slate-100">Intelligence</h1>
        <div className="card border-danger/30 bg-danger/5 p-6 text-center text-sm text-danger">
          Failed to load the intelligence snapshot.
        </div>
      </div>
    );
  }

  const { velocity, pullRequests, nearMisses, synthesisActivity, thresholds } = data;
  const triggeredVelocity = velocity.filter((v) => v.triggered).length;
  const triggeredPrs = pullRequests.filter((p) => p.triggered).length;

  return (
    <div className="animate-fade-in space-y-10">
      <Breadcrumbs crumbs={[{ label: 'Intelligence' }]} />

      {/* ── Header: pipeline pulse + refresh ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-100">
              Intelligence
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/30 bg-signal/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
              </span>
              live
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
            The synthesis pipeline&rsquo;s reasoning surface — commit-velocity baselines, PR impact
            scores, and the calls the agent evaluated but passed on. Refreshed every 2 hours; this
            snapshot is {timeAgo(data.generatedAt)}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-slate-600 sm:block">
            {triggeredVelocity} velocity · {triggeredPrs} PR alerts
          </span>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="btn-ghost inline-flex items-center gap-2 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
            {refresh.isPending ? 'Scanning…' : 'Rescan now'}
          </button>
        </div>
      </div>

      {/* ── Synthesis activity strip ── */}
      <ActivityStrip activity={synthesisActivity} />

      {/* ── Two-column board: velocity (wide) + near-misses ── */}
      <div className="grid gap-8 xl:grid-cols-3">
        <div className="space-y-8 xl:col-span-2">
          <VelocityBoard readings={velocity} thresholdSigma={thresholds.velocitySigma} />
          <PrBoard readings={pullRequests} threshold={thresholds.prScore} />
        </div>
        <NearMissFeed nearMisses={nearMisses} convictionFloor={thresholds.conviction} />
      </div>
    </div>
  );
}

// ── Synthesis activity strip ───────────────────────────────────

function ActivityStrip({ activity }: { activity: SynthesisActivity[] }) {
  const order = ['thesis', 'narrative', 'proactive'];
  const sorted = [...activity].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );

  return (
    <section aria-label="Synthesis pipeline activity">
      <SectionHeading
        icon={<Radio className="h-4 w-4" />}
        title="Synthesis pipeline · last 7 days"
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {sorted.map((a, i) => (
          <div
            key={a.category}
            className="animate-fade-slide-up card group relative overflow-hidden transition-shadow hover:shadow-card-hover"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            <div className="flex items-center justify-between">
              <SignalSourceBadge category={a.category as never} label={a.label} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
                7d
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tabular-nums text-slate-100">
                {a.total}
              </span>
              <span className="text-xs text-slate-500">signals evaluated</span>
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
              <span className="text-signal">{a.traded} traded</span>
              <span className={convictionColor(a.avgConviction)}>
                avg conviction {a.avgConviction ?? '—'}
              </span>
            </div>
            {/* traded-vs-evaluated ratio bar */}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-edge/40">
              <div
                className="h-full rounded-full bg-signal/70 transition-all duration-slower"
                style={{ width: `${a.total > 0 ? (a.traded / a.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Commit velocity board ──────────────────────────────────────

function VelocityBoard({
  readings,
  thresholdSigma,
}: {
  readings: VelocityReading[];
  thresholdSigma: number;
}) {
  return (
    <section aria-label="Commit velocity">
      <SectionHeading
        icon={<GitCommitHorizontal className="h-4 w-4" />}
        title="Commit velocity vs 30-day baseline"
        hint={`fires at ±${thresholdSigma}σ`}
        hintTip={`σ (sigma) measures how far this week's commit count sits from the repo's 30-day average. Beyond ±${thresholdSigma}σ the scanner opens a signal.`}
      />
      <div className="card mt-4 overflow-hidden">
        {readings.length === 0 ? (
          <EmptyNote text="No monitored repos reporting velocity yet." />
        ) : (
          <ul className="divide-y divide-edge/40">
            {readings.map((r, i) => (
              <VelocityRow
                key={r.monitorId}
                reading={r}
                index={i}
                thresholdSigma={thresholdSigma}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function VelocityRow({
  reading: r,
  index,
  thresholdSigma,
}: {
  reading: VelocityReading;
  index: number;
  thresholdSigma: number;
}) {
  // Bipolar deviation bar, clamped to ±3σ for display.
  const MAX = 3;
  const clamped = Math.max(-MAX, Math.min(MAX, r.deviation));
  const widthPct = (Math.abs(clamped) / MAX) * 50;
  const isElevated = r.direction === 'elevated';
  const isSuppressed = r.direction === 'suppressed';
  const isNearMiss = !r.triggered && Math.abs(r.deviation) >= thresholdSigma * 0.75;

  const barColor = r.triggered
    ? isElevated
      ? 'bg-signal'
      : 'bg-danger'
    : isNearMiss
      ? 'bg-warn'
      : 'bg-slate-600';

  return (
    <li
      className="animate-fade-slide-up group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-panel-hover sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto]"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Repo + asset */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm text-slate-200">{r.repo}</span>
          {r.asset && (
            <span className="shrink-0 rounded bg-edge/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {assetTicker(r.asset)}
            </span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
          {r.current7d} this wk · ~{r.baselineWeekly} baseline
        </p>
      </div>

      {/* Bipolar deviation bar */}
      <div className="hidden items-center sm:flex" aria-hidden="true">
        <div className="relative flex h-2 flex-1 items-center">
          {/* center line */}
          <div className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-edge-light" />
          {/* threshold ticks */}
          <div
            className="absolute top-[-3px] h-[14px] w-px bg-edge-light/70"
            style={{ left: `${50 - (thresholdSigma / MAX) * 50}%` }}
          />
          <div
            className="absolute top-[-3px] h-[14px] w-px bg-edge-light/70"
            style={{ left: `${50 + (thresholdSigma / MAX) * 50}%` }}
          />
          {/* deviation bar */}
          <div
            className={`absolute top-0 h-2 rounded-full ${barColor} ${r.triggered ? 'shadow-glow-signal' : ''} transition-all duration-slower`}
            style={
              isSuppressed
                ? { right: '50%', width: `${widthPct}%` }
                : { left: '50%', width: `${widthPct}%` }
            }
          />
        </div>
      </div>

      {/* Deviation value + status */}
      <div className="flex items-center justify-end gap-3">
        <span
          className={`font-mono text-sm font-bold tabular-nums ${
            r.triggered
              ? isElevated
                ? 'text-signal'
                : 'text-danger'
              : isNearMiss
                ? 'text-warn'
                : 'text-slate-500'
          }`}
        >
          <Tooltip
            label={`${Math.abs(r.deviation).toFixed(1)} standard deviations ${r.deviation >= 0 ? 'above' : 'below'} this repo's 30-day commit baseline. ${r.triggered ? 'Crossed the alert threshold.' : 'Below the alert threshold.'}`}
          >
            {r.deviation > 0 ? '+' : ''}
            {r.deviation.toFixed(1)}σ
          </Tooltip>
        </span>
        {r.triggered ? (
          <span className="rounded-md bg-signal/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal">
            alert
          </span>
        ) : isNearMiss ? (
          <span className="animate-pulse rounded-md bg-warn/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">
            watch
          </span>
        ) : (
          <span className="rounded-md bg-edge/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-600">
            {r.direction}
          </span>
        )}
      </div>
    </li>
  );
}

// ── PR impact board ────────────────────────────────────────────

function PrBoard({ readings, threshold }: { readings: PullRequestReading[]; threshold: number }) {
  // Show the most notable PRs; cap the list so the board stays scannable.
  const shown = readings.slice(0, 12);

  return (
    <section aria-label="Open pull request impact">
      <SectionHeading
        icon={<GitPullRequest className="h-4 w-4" />}
        title="Open PR impact"
        hint={`signals at score ≥ ${threshold}`}
        hintTip={`Impact score weighs keywords (breaking change, governance, exploit), size, review activity, and labels. PRs scoring ${threshold}+ open a signal.`}
      />
      <div className="card mt-4 overflow-hidden">
        {shown.length === 0 ? (
          <EmptyNote text="No notable open pull requests right now." />
        ) : (
          <ul className="divide-y divide-edge/40">
            {shown.map((pr, i) => (
              <PrRow key={`${pr.repo}-${pr.prNumber}`} pr={pr} index={i} threshold={threshold} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PrRow({
  pr,
  index,
  threshold,
}: {
  pr: PullRequestReading;
  index: number;
  threshold: number;
}) {
  const [open, setOpen] = useState(false);
  const isNearMiss = !pr.triggered && pr.score >= threshold * 0.75;
  const barColor = pr.triggered ? 'bg-warn' : isNearMiss ? 'bg-warn/60' : 'bg-slate-600';

  return (
    <li className="animate-fade-slide-up" style={{ animationDelay: `${index * 40}ms` }}>
      <button
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 px-4 py-3 text-left transition-colors hover:bg-panel-hover"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[10px] text-slate-500">
              {pr.repo}#{pr.prNumber}
            </span>
            {pr.labels.slice(0, 3).map((l) => (
              <span
                key={l}
                className="rounded bg-violet/15 px-1.5 py-0.5 font-mono text-[9px] text-violet"
              >
                {l}
              </span>
            ))}
          </div>
          <p className="mt-0.5 truncate text-sm text-slate-200">{pr.title}</p>
          <p className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
            {pr.author} · +{pr.additions}/−{pr.deletions} · {pr.changedFiles} files ·{' '}
            {pr.comments + pr.reviewComments} comments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden w-24 sm:block" aria-hidden="true">
            <div className="h-1.5 overflow-hidden rounded-full bg-edge/40">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-slower`}
                style={{ width: `${pr.score}%` }}
              />
            </div>
          </div>
          <span
            className={`font-mono text-sm font-bold tabular-nums ${
              pr.triggered ? 'text-warn' : isNearMiss ? 'text-warn/70' : 'text-slate-500'
            }`}
          >
            {pr.score}
          </span>
          {pr.triggered ? (
            <span className="rounded-md bg-warn/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">
              alert
            </span>
          ) : isNearMiss ? (
            <span className="animate-pulse rounded-md bg-warn/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn/70">
              watch
            </span>
          ) : null}
        </div>
      </button>
      {open && (
        <div className="border-t border-edge/30 bg-ink-light/40 px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
            impact factors
          </p>
          <ul className="mt-1.5 space-y-1">
            {pr.reasons.map((r) => (
              <li key={r} className="flex items-center gap-2 text-xs text-slate-400">
                <Zap className="h-3 w-3 shrink-0 text-warn/70" />
                {r}
              </li>
            ))}
          </ul>
          <a
            href={pr.prUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
          >
            open PR →
          </a>
        </div>
      )}
    </li>
  );
}

// ── Near-miss feed ─────────────────────────────────────────────

function NearMissFeed({
  nearMisses,
  convictionFloor,
}: {
  nearMisses: NearMissSignal[];
  convictionFloor: number;
}) {
  return (
    <section aria-label="Signals evaluated but passed on" className="xl:sticky xl:top-6">
      <SectionHeading
        icon={<Eye className="h-4 w-4" />}
        title="Watched, not traded"
        hint={`sub-${convictionFloor} conviction`}
      />
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Synthesis signals the agent scored below the trading floor. Surfacing them shows the
        pipeline reasoning even when it passes on a call.
      </p>
      <div className="mt-4 space-y-3">
        {nearMisses.length === 0 ? (
          <div className="card border-dashed p-6 text-center">
            <p className="text-xs text-slate-500">
              No near-misses in the archive yet. They&rsquo;ll appear as the synthesis jobs score
              sub-threshold signals.
            </p>
          </div>
        ) : (
          nearMisses.map((n, i) => (
            <Link
              key={n.signalId}
              href={`/signals/${n.signalId}`}
              className="card animate-fade-slide-up group block transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <SignalSourceBadge category={n.sourceCategory} label={n.sourceLabel} />
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${convictionColor(n.conviction)}`}
                >
                  {n.conviction}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {n.asset && <span className="text-slate-300">{assetTicker(n.asset)}</span>}
                <span>{n.recommendedAction}</span>
                <span>·</span>
                <span>{timeAgo(n.detectedAt)}</span>
              </div>
              {n.thesis && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400 group-hover:text-slate-300">
                  {n.thesis}
                </p>
              )}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

// ── Shared bits ────────────────────────────────────────────────

function SectionHeading({
  icon,
  title,
  hint,
  hintTip,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  hintTip?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="section-title flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      {hint &&
        (hintTip ? (
          <Tooltip label={hintTip} side="bottom">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
              {hint}
            </span>
          </Tooltip>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-600">
            {hint}
          </span>
        ))}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-xs text-slate-500">{text}</p>;
}
