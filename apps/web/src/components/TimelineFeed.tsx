'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import { api, type ScorecardRecentCall } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { convictionColor, formatIsoShort, shortUrl, timeAgo } from '@/lib/format';
import { domainLabel } from '@/lib/domain';
import { hcsCommitted, STAGE_COLORS, stageOf, type StageInfo } from '@/lib/stages';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OutcomePill } from '@/components/ui/outcome-pill';
import { ShowMoreButton, useShowMore } from '@/components/ui/show-more';
import { Skeleton } from '@/components/ui/skeleton';

// ─────────────────────────────────────────────────────────────
// Unified timeline — one oracle-toggled feed for both verticals
// (lenitnes-consolidation-spec.md §2/§8). Replaces the two
// duplicate homepage feeds with a single record whose every row
// carries its lifecycle stage (Detect → Commit → Track → Score)
// and state-aware copy. Absences explain themselves; failures are
// visible; replays are labelled so they never read as live.
//
// Motion (transitions.dev, tokens in globals.css): sliding tabs,
// grid-rows accordion, text-state swap on stage change, one-shot
// error shake on failed cards, skeleton for proof-pending. All
// covered by the global prefers-reduced-motion kill-switch.
// ─────────────────────────────────────────────────────────────

type OracleFilter = 'all' | 'code' | 'science';
const VISIBLE_INITIAL = 8;

function freshnessLabel(iso: string): string {
  return `updated ${timeAgo(iso)}`;
}

export function TimelineFeed({ limit = 20 }: { limit?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.scorecardRecent(limit),
    queryFn: () => api.getScorecardRecent(limit),
    refetchInterval: REFETCH.medium,
  });
  const [oracle, setOracle] = useState<OracleFilter>('all');

  const items = useMemo(
    () => (data ?? []).filter((c) => oracle === 'all' || c.domain === oracle),
    [data, oracle],
  );
  const more = useShowMore(items.length, VISIBLE_INITIAL);

  if (isError)
    return (
      <div className="card border-danger/30 text-center text-sm text-danger">
        Timeline feed unavailable — the API may be down.
      </div>
    );

  return (
    <section aria-label="Unified timeline">
      <h2 className="mb-1 text-center font-display text-xl font-semibold text-slate-100 sm:text-2xl">
        The record, <span className="italic">live.</span>
      </h2>
      <p className="mx-auto mb-5 max-w-xl text-center text-xs leading-relaxed text-slate-500">
        One timeline, both oracles. Every entry shows where it sits in the loop —{' '}
        <span className="text-slate-400">detect → commit → track → score</span> — and says why, in
        its own state.
      </p>

      <div className="mb-4 flex flex-col items-center gap-3">
        <OracleTabs oracle={oracle} onChange={setOracle} counts={data ?? []} />
        <StageLegend />
        {data?.[0]?.detectedAt && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">
            {freshnessLabel(data[0].detectedAt)}
          </span>
        )}
      </div>

      {isLoading ? (
        <TimelineSkeleton />
      ) : items.length === 0 ? (
        <div className="text-center">
          <p className="text-sm text-slate-400">
            No new calls in this view. Monitoring continues; silence means no threshold was met.
          </p>
          <Link
            href="/case-study/halo2"
            className="mt-2 inline-block font-mono text-xs text-accent hover:underline"
          >
            meanwhile: the halo2 replay →
          </Link>
        </div>
      ) : (
        <>
          <AdaptiveSummary items={items} />
          <ul className="space-y-2">
            {items.slice(0, more.shown).map((call, i) => (
              <TimelineCard key={`${call.signalId}:${stageOf(call).stage}`} call={call} index={i} />
            ))}
          </ul>
          {more.needsToggle && (
            <div className="flex justify-center">
              <ShowMoreButton
                total={items.length}
                initial={VISIBLE_INITIAL}
                expanded={more.expanded}
                onToggle={more.toggle}
                noun="entries"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Sliding oracle tabs (transitions.dev sliding-tabs) ───────

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'code', label: 'Markets' },
  { key: 'science', label: 'Research' },
] as const;

function OracleTabs({
  oracle,
  onChange,
  counts,
}: {
  oracle: OracleFilter;
  onChange: (o: OracleFilter) => void;
  counts: ScorecardRecentCall[];
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ x: 0, w: 0 });

  const measure = useCallback(() => {
    const el = tabRefs.current[oracle];
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [oracle]);

  useLayoutEffect(measure, [measure, counts.length]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const countOf = (key: OracleFilter) =>
    key === 'all' ? counts.length : counts.filter((c) => c.domain === key).length;

  return (
    <div
      role="tablist"
      aria-label="Filter timeline by oracle"
      className="relative inline-flex rounded-full border border-edge/40 bg-ink-light/60 p-1"
    >
      <span
        aria-hidden
        className="absolute bottom-1 left-0 top-1 rounded-full bg-edge-light/80 transition-[transform,width] duration-fast ease-smooth-out"
        style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
      />
      {TABS.map((tab) => (
        <button
          key={tab.key}
          ref={(el) => {
            tabRefs.current[tab.key] = el;
          }}
          role="tab"
          aria-selected={oracle === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'relative z-10 rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors duration-fast ease-smooth-out',
            oracle === tab.key ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300',
          )}
        >
          {tab.label}
          <span className="ml-1.5 text-[9px] text-slate-600">{countOf(tab.key)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Loop legend — the abstract loop, inline with the feed ────

function StageLegend() {
  const steps = [
    { stage: 'detect', label: 'Detect' },
    { stage: 'commit', label: 'Commit' },
    { stage: 'track', label: 'Track' },
    { stage: 'score', label: 'Score' },
  ] as const;
  return (
    <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-slate-600">
      {steps.map((s, i) => (
        <span key={s.stage} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>→</span>}
          <span className="flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_COLORS[s.stage].dot)} />
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Adaptive summary — absences never own the page ───────────

function AdaptiveSummary({ items }: { items: ScorecardRecentCall[] }) {
  const stages = items.map(stageOf);
  const detecting = stages.filter((s) => s.stage === 'detect').length;
  const committed = stages.filter((s) => s.stage === 'commit' || s.stage === 'track').length;
  const failed = stages.filter((s) => s.stage === 'failed').length;
  if (detecting === 0 && failed === 0) return null;
  return (
    <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-edge/30 bg-panel/40 px-4 py-2.5 text-xs text-slate-500">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400 opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400" />
      </span>
      <span>
        <strong className="font-semibold text-slate-300">{items.length} changes tracked</strong> in
        this window
        {detecting > 0 && ` · ${detecting} detected, no call committed yet`}
        {committed > 0 && ` · ${committed} awaiting the oracle`}
        {failed > 0 && ` · ${failed} notarization${failed > 1 ? 's' : ''} held for retry`}
      </span>
    </div>
  );
}

// ── Card — stage badge + state-aware headline + accordion ────

function TimelineCard({ call, index }: { call: ScorecardRecentCall; index: number }) {
  const stage = stageOf(call);
  const label = domainLabel(call.domain);
  const colors = STAGE_COLORS[stage.stage];
  const noun = call.domain === 'science' ? 'alert' : 'thesis';
  const source = sourceLabelFromCall(call);
  const tradeState = call.tradeTxHash ? (call.tradeTxHash.startsWith('0xpap') ? 'PAPER' : 'LIVE') : null;
  const asset = call.asset ? call.asset.toUpperCase() : null;
  const action = call.recommendedAction && call.recommendedAction !== 'none' ? call.recommendedAction : null;

  return (
    <li
      className={cn('animate-signal-enter', stage.stage === 'failed' && 'tl-shake')}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <Collapsible className="group">
        <div
          className={cn(
            'rounded-xl border bg-panel/60 transition-colors hover:border-accent/30',
            stage.stage === 'failed' ? 'border-danger/40' : 'border-edge/40',
          )}
        >
          <CollapsibleTrigger className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span
              className={cn(
                'mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider',
                colors.bg,
                colors.text,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />
              {stage.badge}
            </span>
            <span className="min-w-0 flex-1">
              {/* Keyed on the headline so a stage change re-mounts the span →
                  text-state-swap plays and the user registers the change. */}
              <span key={stage.headline} className="tl-swap block text-sm text-slate-100">
                {asset && <span className="mr-2 font-mono text-accent">{asset}</span>}
                {action && <span className="mr-2 font-mono uppercase text-slate-300">{action}</span>}
                {call.conviction != null && (
                  <span className="mr-2 font-mono text-slate-400">conviction {call.conviction}/100</span>
                )}
                {tradeState && <span className="mr-2 font-mono text-warn">{tradeState}</span>}
                {stage.headline}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-slate-600">
                <span className={label === 'research' ? 'text-signal/70' : 'text-accent/70'}>
                  [{label}]
                </span>
                <span className="truncate">{source}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{displaySource(call.monitorUrl)}</span>
                <span aria-hidden>·</span>
                <span>{timeAgo(call.detectedAt)}</span>
                {call.evaluationMode === 'replay' && (
                  <span className="rounded border border-edge/60 px-1 text-slate-500">replay</span>
                )}
                {call.outcomeStatus !== 'pending' && (
                  <span className="text-slate-500">{call.outcomeStatus}</span>
                )}
              </span>
            </span>
            <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform duration-fast ease-smooth-out group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-collapsible-down">
            <div className="border-t border-edge/30 px-4 py-3">
              <CardDetail call={call} stage={stage} noun={noun} />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </li>
  );
}

// ── Detail rows — committed · pending · absent, each with a reason ──

function sourceLabelFromCall(call: ScorecardRecentCall): string {
  if (call.monitorUrl === 'narrative:portfolio') return 'narrative synthesis';
  if (call.monitorUrl === 'synthesis:thesis') return 'thesis synthesis';
  if (call.monitorUrl === 'proactive:signals') return 'proactive scan';
  return call.domain === 'science' ? 'research monitor' : 'commit monitor';
}

function displaySource(url: string): string {
  if (url.startsWith('narrative:') || url.startsWith('synthesis:') || url.startsWith('proactive:')) {
    return 'aggregated evidence';
  }
  return shortUrl(url);
}

// ── Detail rows — committed · pending · absent, each with a reason ──

function CardDetail({
  call,
  stage,
  noun,
}: {
  call: ScorecardRecentCall;
  stage: StageInfo;
  noun: string;
}) {
  const isScience = call.domain === 'science';
  return (
    <div className="space-y-2.5">
      {call.detectorTypes.length > 0 && (
        <DetailRow
          label="Detected"
          value={
            <span className="flex flex-wrap gap-1">
              {call.detectorTypes.map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-edge/40 bg-ink-light/50 px-2 py-px font-mono text-[10px] text-slate-400"
                >
                  {d.replaceAll('_', ' ')}
                </span>
              ))}
            </span>
          }
        />
      )}
      {call.thesis != null && (
        <DetailRow
          label={isScience ? 'Alert' : 'Thesis'}
          value={<span className="text-slate-300">{call.thesis}</span>}
        />
      )}
      {stage.stage === 'detect' && (
        <p className="font-mono text-[10px] leading-relaxed text-slate-600">
          Why nothing is committed: the agent scored this change below its firing threshold, or has
          not committed a {noun} yet. Sub-threshold silence is a judgment too —{' '}
          <Link href="/reasoning" className="text-accent/80 hover:underline">
            see the reasoning archive →
          </Link>
        </p>
      )}
      {stage.stage === 'commit' && (
        <DetailRow
          label="Proof"
          value={
            // Skeleton, not spinner: notarization is a finite, verifiable
            // process — the receipt lands here when the HCS write completes.
            <span className="t-skel block h-3 w-3/4 rounded bg-edge/50" />
          }
        />
      )}
      {stage.stage === 'failed' && (
        <DetailRow
          label="Proof"
          value={
            <span className="block">
              <span className="text-danger">Notarization failed</span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-600">
                {call.hcsMessageId?.slice(0, 120)}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-slate-500">
                Auto-retry is queued — the record shows failures, we don&apos;t hide them.
              </span>
            </span>
          }
        />
      )}
      {hcsCommitted(call.hcsMessageId) && (
        <DetailRow
          label="Proof"
          value={
            <span className="flex items-center gap-1.5 text-signal">
              <Check className="h-3 w-3" />
              Notarized · HCS{' '}
              <span className="font-mono text-[10px] text-slate-500">
                {call.hcsMessageId?.split('@')[0]}
              </span>
            </span>
          }
        />
      )}
      {!isScience && (stage.stage === 'score' || call.tradeTxHash) && (
        <DetailRow
          label="Outcomes"
          value={
            <span className="flex flex-wrap items-center gap-1.5">
              <OutcomePill label="T+1h" value={call.outcomes.t1h} />
              <OutcomePill label="T+1d" value={call.outcomes.t1d} />
              <OutcomePill label="T+7d" value={call.outcomes.t7d} />
              {call.tradeTxHash && (
                  <span className="font-mono text-[10px] text-accent">
                    {call.tradeTxHash.startsWith('0xpap') ? 'PAPER' : 'LIVE'} trade
                  </span>
                )}
            </span>
          }
        />
      )}
      {isScience && (
        <DetailRow
          label="Record"
          value={
            call.event ? (
              <span className="font-mono text-[10px] text-slate-400">
                {call.event.kind}
                {call.event.at ? ` · ${formatIsoShort(call.event.at)}` : ''}
                {call.event.leadDays != null ? ` · +${Math.round(call.event.leadDays)}d lead` : ''}
                {call.event.matchStatus ? ` · ${call.event.matchStatus}` : ''}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-slate-600">
                No adjudication event on the record yet — alerts are graded only against published
                retractions, corrections and releases.
              </span>
            )
          }
        />
      )}
      <Link
        href={`/signals/${call.signalId}`}
        className="inline-flex items-center gap-1 pt-1 font-mono text-[11px] text-accent transition-colors hover:text-accent-glow"
      >
        full record <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-16 shrink-0 pt-px font-mono text-[9px] uppercase tracking-wider text-slate-600">
        {label}
      </span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-edge/30 bg-panel/40 px-4 py-3"
        >
          <Skeleton className="h-5 w-28 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
