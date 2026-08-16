'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ArrowUpRight,
  Loader2,
  GitCommit,
  Layers,
  FlaskConical,
  CalendarClock,
  FileWarning,
} from 'lucide-react';

interface LiteratureRef {
  title: string;
  doi?: string | null;
  primary_id?: string | null;
  year?: string | null;
  source?: string | null;
}

interface ClustsimVerdict {
  hash: string;
  message: string;
  committedAt: string;
  detectorClassifications: Array<{
    detector_type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
  agentScore: {
    conviction: number;
    thesis: string;
    recommended_action: 'alert' | 'investigate' | 'none';
    confidence_band: 'low' | 'mid' | 'high';
    rubric_version: string;
    hcs_dispatch?: string;
    literature?: LiteratureRef[];
  };
  bioOutcome?: {
    event_kind: string;
    event_at: string;
    event_source: string;
    lead_days: number;
    confirmed: boolean;
  };
}

interface ClustsimResponse {
  repo: string;
  domain: string;
  verdicts: ClustsimVerdict[];
}

// The story arc: a quiet statistical fix → a public invalidation a year later.
// Honesty note: the system did not exist in 2015. The alert is a replay of the
// historical commit through today's pipeline, demonstrating what it would catch.
const TIMELINE = [
  { date: 'May 12, 2015', event: 'AFNI commits an edge-effect fix to 3dClustSim (2baf5710)' },
  {
    date: 'Jun 28, 2016',
    event: '"Cluster failure" published in PNAS — inflated fMRI false positives',
  },
  { date: 'Afterward', event: 'Cluster-inference results across task-fMRI called into question' },
  {
    date: 'Aug 2026',
    event: 'Replayed through LENITNES[bio]: the pipeline flags the fix as an integrity alert',
  },
];

export default function ClustsimCaseStudyPage() {
  const { data, isLoading, isError } = useQuery<ClustsimResponse>({
    queryKey: ['backtest', 'replay', 'clustsim'],
    queryFn: async () => {
      const res = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || '/api') + '/backtest/replay/clustsim',
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 text-slate-500 py-20">
        <Loader2 className="h-4 w-4 animate-spin" />
        Replaying afni 3dClustSim…
      </div>
    );
  }

  if (isError || !data || data.verdicts.length === 0) {
    return (
      <div className="py-20">
        <div className="card border-danger/30 text-danger text-center">
          Could not load the replay — the API may be down.
        </div>
      </div>
    );
  }

  const verdict = data.verdicts[0];
  const outcome = verdict.bioOutcome;
  const leadDays = outcome?.lead_days ?? 0;
  const literature = verdict.agentScore.literature ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      {/* ── Hero ── */}
      <header className="reveal in-view">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            [bio]
          </span>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            founding case study
          </p>
        </div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-5xl">
          A quiet <span className="text-accent">3dClustSim</span> fix went unnoticed for{' '}
          <span className="text-accent">413 days</span> — this replay shows the sentinel would catch
          it
        </h1>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {TIMELINE.map((event, i) => (
            <div key={i} className="rounded-lg border border-edge/30 bg-ink-light/40 p-3">
              <div className="font-mono text-[10px] text-accent">{event.date}</div>
              <div className="mt-1 text-xs text-slate-300">{event.event}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-400">
          In 2015,{' '}
          <a
            href="https://github.com/afni/afni"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            AFNI
          </a>{' '}
          quietly fixed an edge-effect bug in 3dClustSim. A year later, Eklund et al. showed those
          methods inflated fMRI false positives far beyond 5%. That fix commit is exactly the
          pattern LENITNES[bio] watches for. This page is a{' '}
          <strong className="text-slate-300">replay</strong>: the system was built in 2026 and run
          against the historical commit to prove the detection pipeline end-to-end. A live monitor
          now watches afni/afni for anything similar.
        </p>
      </header>

      {/* ── Agent verdict card ── */}
      <section className="card border-accent/30">
        <div className="mb-5 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              agent verdict — replayed
            </p>
            <h2 className="text-lg font-semibold text-slate-100">{verdict.message}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <GitCommit className="h-3 w-3" />
                {verdict.hash.slice(0, 12)}
              </span>
              <span>&middot;</span>
              <span>{new Date(verdict.committedAt).toLocaleDateString()}</span>
              <span>&middot;</span>
              <span>rubric {verdict.agentScore.rubric_version}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-5xl font-bold text-accent">
              {verdict.agentScore.conviction}
              <span className="text-xl text-slate-500">/100</span>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {verdict.agentScore.confidence_band} · {verdict.agentScore.recommended_action}
            </div>
          </div>
        </div>

        <blockquote className="rounded-lg border border-accent/20 bg-accent/5 p-5 text-base italic leading-relaxed text-slate-200">
          &ldquo;{verdict.agentScore.thesis}&rdquo;
        </blockquote>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <DetailTile
            icon={FileWarning}
            label="Commitment"
            value={verdict.agentScore.recommended_action.toUpperCase()}
            hint="HCS-anchored integrity alert — no trade"
          />
          <DetailTile
            icon={Layers}
            label="Detector consensus"
            value={`${verdict.detectorClassifications.length} detectors`}
            hint={verdict.detectorClassifications.map((c) => c.detector_type).join(' · ')}
          />
          <DetailTile
            icon={CalendarClock}
            label="Historical window"
            value={`${leadDays} days`}
            hint="fix commit → public disclosure; a live run would alert at the commit"
          />
        </div>
      </section>

      {/* ── Detector detail ── */}
      <section className="card reveal reveal-delay-1 in-view">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-accent" />
          Detector consensus
        </h2>
        <ul className="space-y-3">
          {verdict.detectorClassifications.map((c) => (
            <li
              key={c.detector_type}
              className="rounded-xl border border-edge/30 bg-ink-light/30 p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                    {c.detector_type}
                  </div>
                  <div className="mt-1 text-sm text-slate-200">{c.label}</div>
                </div>
                <div className="shrink-0 text-right font-mono">
                  <div className="text-lg font-bold text-slate-100">
                    {c.score}
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                  <div className="text-[10px] text-slate-500">conf {c.confidence}</div>
                </div>
              </div>
              <div className="relative h-1 overflow-hidden rounded-full bg-edge/30">
                <div
                  className="absolute inset-y-0 left-0 bg-accent"
                  style={{ width: `${c.score}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Ground-truth outcome ── */}
      {outcome && (
        <section className="card reveal reveal-delay-2 in-view border-signal/30">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-signal" />
            Historical reference
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-edge/30 bg-ink-light/30 p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                event
              </div>
              <div className="mt-1 font-mono text-lg font-bold capitalize text-slate-100">
                {outcome.event_kind}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {new Date(outcome.event_at).toLocaleDateString()}
              </div>
            </div>
            <div className="rounded-xl border border-edge/30 bg-ink-light/30 p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                window (replayed)
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-slate-100">
                {outcome.lead_days} days
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                fix commit → public disclosure
              </div>
            </div>
            <div className="rounded-xl border border-edge/30 bg-ink-light/30 p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                status
              </div>
              <div
                className={`mt-1 font-mono text-lg font-bold ${
                  outcome.confirmed ? 'text-signal' : 'text-slate-400'
                }`}
              >
                {outcome.confirmed ? 'CONFIRMED' : 'RELATED DISCLOSURE'}
              </div>
              <div className="mt-0.5 break-all text-[11px] text-slate-500">
                {outcome.event_source}
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            No price to mark to market — this replay is compared with a dated scientific-record
            disclosure. It is a calibration example, not causal proof that this commit produced the
            later finding.
          </p>
        </section>
      )}

      {/* ── Literature ── */}
      {literature.length > 0 && (
        <section className="card reveal reveal-delay-2 in-view">
          <h2 className="section-title mb-4 flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            Corroborating literature
          </h2>
          <ul className="space-y-2">
            {literature.map((ref) => (
              <li
                key={ref.doi ?? ref.title}
                className="flex items-start justify-between gap-3 rounded-xl border border-edge/30 bg-ink-light/30 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-slate-200">{ref.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {ref.year ? `${ref.year} · ` : ''}
                    {ref.doi ? `doi:${ref.doi}` : ref.primary_id}
                  </div>
                </div>
                <span className="shrink-0 rounded border border-edge/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-500">
                  {ref.source}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge/30 pt-6">
        <Link
          href="/scorecard?domain=bio"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-100"
        >
          See the [bio] scorecard
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-widest text-slate-600 transition-colors hover:text-slate-300"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
  hint,
  positive,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  hint: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-edge/30 bg-ink-light/30 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg font-bold ${positive ? 'text-signal' : 'text-slate-100'}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>
    </div>
  );
}
