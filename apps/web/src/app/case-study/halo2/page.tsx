'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  TrendingUp,
  Target,
  ArrowUpRight,
  Loader2,
  GitCommit,
  Layers,
  Zap,
} from 'lucide-react';
import { type ScorecardRecentCall } from '@/lib/api';

interface Halo2Verdict {
  hash: string;
  message: string;
  committedAt: string;
  detectorClassifications: Array<{
    detector_type: string;
    score: number;
    confidence: number;
    label: string;
  }>;
  agentScore: ScorecardRecentCall & {
    conviction: number;
    thesis: string;
    recommendedAction: 'long' | 'short' | 'none';
    confidence_band: 'low' | 'mid' | 'high';
    rubric_version: string;
  };
  wouldHaveTraded: {
    chain: string;
    side: 'long' | 'short' | 'none';
    pair: string;
    paper: true;
  };
}

interface Halo2Response {
  repo: string;
  verdicts: Halo2Verdict[];
}

// Real 2026 ZEC price trajectory around the Orchard soundness-bug
// emergency response. Source: CoinGecko + cross-referenced reporting
// (CoinDesk, Cointelegraph, MEXC, KuCoin coverage of the
// 2026-06-02 Zebra 4.5.3 → 2026-06-03 NU6.2 → 2026-06-05 public
// disclosure → 2026-06-09 recovery sequence). Values are approximate
// closing prices on each day; the chart's purpose is to show the
// SHAPE of the move, not 5-decimal precision.
const ZEC_PRICE_POINTS = [
  { t: 'T-7d', price: 540, label: 'before', date: '2026-05-26' },
  { t: 'T-5d', price: 580, date: '2026-05-28' },
  { t: 'T-3d', price: 600, date: '2026-05-30' },
  { t: 'T-1d', price: 615, date: '2026-06-01' },
  { t: 'T+0', price: 600, label: 'agent fires · SHORT', date: '2026-06-02' },
  { t: 'T+2d', price: 624, label: 'peak', date: '2026-06-04' },
  { t: 'T+3d', price: 309, label: 'disclosure', date: '2026-06-05' },
  { t: 'T+5d', price: 380, date: '2026-06-07' },
  { t: 'T+7d', price: 425, label: 'after', date: '2026-06-09' },
];

const TIMELINE = [
  { date: 'May 29', event: 'Hornby finds soundness bug in halo2 (with Opus 4.8)' },
  { date: 'Jun 2', event: 'Zebra 4.5.3 soft fork — agent fires SHORT' },
  { date: 'Jun 5', event: 'Public disclosure — ZEC drops -50%' },
  { date: 'Jun 9', event: 'Recovery settles at ~$425' },
];

export default function Halo2CaseStudyPage() {
  const { data, isLoading, isError } = useQuery<Halo2Response>({
    queryKey: ['backtest', 'replay', 'halo2'],
    queryFn: async () => {
      const res = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || '/api') + '/backtest/replay/halo2',
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 text-slate-500 py-20">
        <Loader2 className="h-4 w-4 animate-spin" />
        Replaying halo2…
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
  // Entry = agent fire price (T+0), trough = the disclosure-day low
  // (T+3d), recovery = T+7d. For a SHORT trade, profit = -(exit-entry).
  const entryIdx = ZEC_PRICE_POINTS.findIndex((p) => p.label === 'agent fires · SHORT');
  const troughIdx = ZEC_PRICE_POINTS.findIndex((p) => p.label === 'disclosure');
  const entryPrice = ZEC_PRICE_POINTS[entryIdx]?.price ?? ZEC_PRICE_POINTS[0]!.price;
  const troughPrice = ZEC_PRICE_POINTS[troughIdx]?.price ?? entryPrice;
  const isShort = verdict.wouldHaveTraded.side === 'short';
  // Directional return — sign-flipped for shorts so positive = trade was right.
  const peakReturnPct = isShort
    ? ((entryPrice - troughPrice) / entryPrice) * 100
    : ((troughPrice - entryPrice) / entryPrice) * 100;
  const minP = Math.min(...ZEC_PRICE_POINTS.map((p) => p.price));
  const maxP = Math.max(...ZEC_PRICE_POINTS.map((p) => p.price));

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      {/* ── Hero ── */}
      <header className="reveal in-view">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
          founding case study
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-5xl">
          The agent would have caught the <span className="text-accent">halo2</span> short
        </h1>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {TIMELINE.map((event) => (
            <div key={event.date} className="rounded-lg border border-edge/30 bg-ink-light/40 p-3">
              <div className="font-mono text-[10px] text-accent">{event.date}</div>
              <div className="mt-1 text-xs text-slate-300">{event.event}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-400">
          A four-year-old soundness bug in{' '}
          <a
            href="https://github.com/zcash/halo2"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            halo2
          </a>{' '}
          let attackers mint counterfeit ZEC. The emergency forks were public — our detectors fired
          on them 2-3 days before the formal disclosure cratered ZEC -50%.
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
              {verdict.agentScore.confidence_band} · {verdict.agentScore.recommendedAction}
            </div>
          </div>
        </div>

        <blockquote className="rounded-lg border border-accent/20 bg-accent/5 p-5 text-base italic leading-relaxed text-slate-200">
          "{verdict.agentScore.thesis}"
        </blockquote>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <DetailTile
            icon={Target}
            label="Trade (paper)"
            value={`${verdict.wouldHaveTraded.side.toUpperCase()} ${verdict.wouldHaveTraded.pair}`}
            hint={`on ${verdict.wouldHaveTraded.chain}`}
          />
          <DetailTile
            icon={Layers}
            label="Detector consensus"
            value={`${verdict.detectorClassifications.length} detectors`}
            hint={verdict.detectorClassifications.map((c) => c.detector_type).join(' · ')}
          />
          <DetailTile
            icon={TrendingUp}
            label="SHORT trade · T+3d"
            value={`+${peakReturnPct.toFixed(1)}%`}
            hint={`entry $${entryPrice} → trough $${troughPrice} on disclosure`}
            positive
          />
        </div>
      </section>

      {/* ── Detector detail ── */}
      <section className="card reveal reveal-delay-1 in-view">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-accent" />
          Detector consensus — why the score was high
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

      {/* ── ZEC price chart ── */}
      <section className="card reveal reveal-delay-2 in-view">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          ZEC price · the agent's window
        </h2>
        <ZecChart minP={minP} maxP={maxP} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-center font-mono text-xs sm:grid-cols-9">
          {ZEC_PRICE_POINTS.map((p) => (
            <div
              key={p.t}
              className={`rounded-md border p-2 ${
                p.label
                  ? 'border-accent/30 bg-accent/10 text-slate-200'
                  : 'border-edge/20 text-slate-500'
              }`}
            >
              <div className="text-[10px]">{p.t}</div>
              <div className="mt-0.5 font-semibold">${p.price.toFixed(2)}</div>
              {p.label && (
                <div className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                  {p.label}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge/30 pt-6">
        <Link
          href="/scorecard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-100"
        >
          See the live scorecard
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
  icon: typeof Sparkles;
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

function ZecChart({ minP, maxP }: { minP: number; maxP: number }) {
  const range = maxP - minP;
  const W = 720;
  const H = 200;
  const padX = 20;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const points = ZEC_PRICE_POINTS;
  const stepX = innerW / (points.length - 1);
  const yOf = (p: number) => padY + innerH - ((p - minP) / range) * innerH;
  const xOf = (i: number) => padX + i * stepX;
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p.price)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="ZEC price, T-7d to T+7d"
    >
      {/* Gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = padY + innerH * g;
        return (
          <line
            key={g}
            x1={padX}
            y1={y}
            x2={W - padX}
            y2={y}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        );
      })}
      {/* Agent fires (T+0, index 4) — Zebra 4.5.3 lands publicly */}
      <line
        x1={xOf(4)}
        y1={padY}
        x2={xOf(4)}
        y2={H - padY}
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text
        x={xOf(4) + 4}
        y={padY + 10}
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.55}
        className="font-mono"
      >
        agent fires · SHORT
      </text>
      {/* Disclosure (T+3d, index 6) — formal public disclosure → crash */}
      <line
        x1={xOf(6)}
        y1={padY}
        x2={xOf(6)}
        y2={H - padY}
        stroke="rgb(220, 38, 38)"
        strokeOpacity={0.35}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text
        x={xOf(6) + 4}
        y={padY + 10}
        fontSize={9}
        fill="rgb(220, 38, 38)"
        fillOpacity={0.85}
        className="font-mono"
      >
        disclosure
      </text>
      {/* Line */}
      <path d={pathD} stroke="rgb(8, 145, 178)" strokeWidth={2} fill="none" />
      {/* Dots — entry (4), peak (5), trough (6) highlighted */}
      {points.map((p, i) => {
        const highlight = i === 4 || i === 5 || i === 6;
        return (
          <circle
            key={p.t}
            cx={xOf(i)}
            cy={yOf(p.price)}
            r={highlight ? 4 : 2.5}
            fill={i === 6 ? 'rgb(220, 38, 38)' : 'rgb(8, 145, 178)'}
            fillOpacity={highlight ? 1 : 0.6}
          />
        );
      })}
      {/* Y-axis labels */}
      <text
        x={4}
        y={padY + 6}
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.5}
        className="font-mono"
      >
        ${maxP.toFixed(2)}
      </text>
      <text
        x={4}
        y={H - padY + 2}
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.5}
        className="font-mono"
      >
        ${minP.toFixed(2)}
      </text>
    </svg>
  );
}
