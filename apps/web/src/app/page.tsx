'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api, type ScorecardRecentCall } from '@/lib/api';
import { qk, REFETCH } from '@/lib/queryKeys';
import { timeAgo } from '@/lib/format';

import { ProofFlow } from '@/components/ProofFlow';
import { TimelineFeed } from '@/components/TimelineFeed';

export default function LandingPage() {
  return (
    <div className="space-y-8 sm:space-y-12">
      <Hero />
      <Portals />
      <HowItWorksStrip />
      <TimelineFeed limit={20} />
    </div>
  );
}

// ── Hero: the instrument, not a vertical. The cards below do the choosing. ──

function Hero() {
  const { data: recent } = useQuery<ScorecardRecentCall[]>({
    queryKey: qk.scorecardRecent(5),
    queryFn: () => api.getScorecardRecent(5),
    refetchInterval: REFETCH.fast,
  });

  const latest = recent?.[0];

  return (
    <header className="pt-4 text-center sm:pt-8">
      {/* Pulse — the autonomy signal */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
          {latest ? `last judged ${timeAgo(latest.detectedAt)}` : 'monitoring live'}
        </span>
      </div>

      <h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight text-slate-100 sm:text-5xl">
        Every judgment <em className="not-italic text-accent">committed</em> — before the outcome is
        knowable.
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
        LENITNES watches software change, commits what it appears to mean while the verdict is still
        open, and grades itself in public against the oracle that matters for each field — price, or
        the published record.
      </p>
    </header>
  );
}

// ── The chooser: two products, one engine ─────────────────────

function Portals() {
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Two verticals">
      {/* ── Markets ── */}
      <div className="card flex flex-col gap-4 border-accent/20 p-5 transition-colors hover:border-accent/40 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            [markets]
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            price oracle
          </span>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-100">LENITNES Markets</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Consensus-critical software → market risk. Theses are committed on-chain before the move
            and graded against what price actually did — Season 1 is closed, and the losses are in
            the record.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-500">
          <Link href="/scorecard?domain=markets" className="hover:text-accent">
            scorecard ↗
          </Link>
          <Link href="/portfolio" className="hover:text-accent">
            portfolio ↗
          </Link>
          <Link href="/calibration" className="hover:text-accent">
            calibration ↗
          </Link>
        </div>
        <Link
          href="/markets"
          className="btn group mt-2 inline-flex items-center gap-2 self-start px-5 py-2.5 text-xs uppercase tracking-wider"
        >
          Open Markets
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* ── Research ── */}
      <div className="card flex flex-col gap-4 border-signal/40 p-6 transition-colors hover:border-signal/60 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="rounded border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-signal">
            [research]
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            record oracle
          </span>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-100">LENITNES Research</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Scientific software → integrity of the published record. Alerts are committed to HCS
            before the record moves and graded only against explicitly adjudicated events.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-500">
          <Link href="/scorecard?domain=research" className="hover:text-signal">
            scorecard ↗
          </Link>
          <Link href="/scan?domain=research" className="hover:text-signal">
            scan ↗
          </Link>
          <Link href="/case-study/clustsim" className="hover:text-signal">
            clustsim replay ↗
          </Link>
        </div>
        <Link
          href="/research"
          className="btn mt-auto inline-flex items-center gap-2 self-start bg-signal/15 px-5 py-2.5 text-xs uppercase tracking-wider text-signal hover:bg-signal/25"
        >
          Open Research
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-600 lg:col-span-2">
        same engine · same proof chain · separate oracles, separate scorecards —{' '}
        <span className="text-slate-500">replays never count as live results</span>
      </p>
    </section>
  );
}

function HowItWorksStrip() {
  return (
    <section className="text-center">
      <h2 className="mb-4 font-display text-xl font-semibold text-slate-100 sm:text-2xl">
        One loop. <span className="italic text-accent">Separate oracles.</span>
      </h2>
      <div className="rounded-xl border border-edge/40 bg-panel/30 p-4 sm:p-6">
        <ProofFlow />
      </div>
      <p className="mt-3 text-[11px] text-slate-600">
        Public commitments are timestamped on <span className="text-signal">Hedera HCS</span>; proof
        coverage is shown live.
      </p>
    </section>
  );
}
