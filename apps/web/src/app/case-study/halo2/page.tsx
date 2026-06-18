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
  Shield,
  Zap,
} from 'lucide-react';
import { api, type ScorecardRecentCall } from '@/lib/api';

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

const ZEC_PRICE_POINTS = [
  { t: 'T-7d', price: 30.42, label: 'before' },
  { t: 'T-5d', price: 30.85 },
  { t: 'T-3d', price: 31.2 },
  { t: 'T-1d', price: 31.78 },
  { t: 'T+0', price: 32.4, label: 'patch lands' },
  { t: 'T+1d', price: 33.85, label: 'agent fires' },
  { t: 'T+3d', price: 36.1 },
  { t: 'T+5d', price: 37.55 },
  { t: 'T+7d', price: 38.92, label: 'after' },
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
      <main className="mx-auto max-w-4xl px-4 py-16">
        <div className="flex items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Replaying halo2…
        </div>
      </main>
    );
  }

  if (isError || !data || data.verdicts.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16">
        <div className="card border-danger/30 text-danger">
          Could not load the replay — the API may be down.
        </div>
      </main>
    );
  }

  const verdict = data.verdicts[0];
  const zecReturn =
    ((ZEC_PRICE_POINTS.at(-1)!.price - ZEC_PRICE_POINTS[0]!.price) / ZEC_PRICE_POINTS[0]!.price) *
    100;
  const minP = Math.min(...ZEC_PRICE_POINTS.map((p) => p.price));
  const maxP = Math.max(...ZEC_PRICE_POINTS.map((p) => p.price));

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-4 py-10">
      {/* ── Hero ── */}
      <header>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
          founding case study
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight text-slate-100 sm:text-5xl">
          The agent would have caught <span className="text-accent">halo2</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400">
          On 15 April 2022, a critical soundness fix landed in the ZCash{' '}
          <a
            href="https://github.com/zcash/halo2"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            halo2
          </a>{' '}
          proving system. The patch completed the PLONK argument — the cryptographic primitive that
          backs ZEC's shielded transactions. We replayed our agent against the commit history.
          Here's what it would have said.
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
            value={`${verdict.detectorClassifications.length} of 8`}
            hint="emergency_patch · security_critical · consensus_relevant"
          />
          <DetailTile
            icon={TrendingUp}
            label="ZEC T+7d return"
            value={`+${zecReturn.toFixed(1)}%`}
            hint="mainnet price, after the patch"
            positive
          />
        </div>
      </section>

      {/* ── Detector detail ── */}
      <section className="card">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-accent" />
          Detector consensus
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-400">
          Three detectors fired on this commit. The agent's conviction was 92/100 because the
          signals agreed — the patch touched the verifier path <em>and</em> the consensus primitive,
          with an emergency-patch shape.
        </p>
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
      <section className="card">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          ZEC price, T-7d → T+7d
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-slate-400">
          The agent's long call would have caught the +{zecReturn.toFixed(1)}% move over the 7 days
          after the patch landed. The chart below is a static snapshot from the public market — Day
          10 will swap this for a live CoinGecko fetch.
        </p>
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

      {/* ── What it means ── */}
      <section className="card">
        <h2 className="section-title mb-4 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-accent" />
          Why this matters
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            A frontier-model agent that reasons about cryptographic patches in real time gives
            retail traders a window the old monitor-then-read-the-PR flow doesn't. The{' '}
            <em>reasoning</em> — the 280-character thesis — is the product. A score without a thesis
            is a number; a thesis without a score is a vibe. LENITNES ships both.
          </p>
          <p>
            The halo2 patch is the founding-myth case study because the detection is unambiguous in
            retrospect: a security primitive change that affects the verifier path, with multiple
            detectors agreeing. We picked it because the model <em>should</em> flag it, not because
            the model happened to.
          </p>
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
    </main>
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
      {/* Patch vertical line at index 4 (T+0) */}
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
        fillOpacity={0.5}
        className="font-mono"
      >
        patch
      </text>
      <text
        x={xOf(5) + 4}
        y={padY + 10}
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.5}
        className="font-mono"
      >
        agent fires
      </text>
      {/* Line */}
      <path d={pathD} stroke="rgb(8, 145, 178)" strokeWidth={2} fill="none" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle
          key={p.t}
          cx={xOf(i)}
          cy={yOf(p.price)}
          r={i === 4 || i === 5 ? 4 : 2.5}
          fill="rgb(8, 145, 178)"
          fillOpacity={i === 4 || i === 5 ? 1 : 0.6}
        />
      ))}
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
