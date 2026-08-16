import Link from 'next/link';
import { ArrowRight, BookOpen, FlaskConical, ShieldCheck } from 'lucide-react';

export const metadata = {
  title: 'LENITNES Research — scientific software integrity',
  description:
    'LENITNES Research watches scientific software changes, preregisters integrity alerts, and grades them against the published record.',
};

// ── LENITNES Research — the record-oracle vertical. ────────────
// Watch scientific-software repositories, commit an integrity
// judgment before the record moves, and grade against explicitly
// adjudicated events in the published literature.

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 py-6 sm:py-10">
      <header className="space-y-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-signal">
          <span className="rounded border border-signal/40 bg-signal/10 px-2 py-0.5">
            [research]
          </span>
          record oracle · graded against the published record
        </div>
        <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-slate-100 sm:text-5xl">
          The sentinel for changes that can alter the scientific record.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-400">
          LENITNES Research watches public scientific-software repositories, detects method and
          results-bearing changes, records what the change appeared to mean before later evidence
          arrives, and grades alerts against explicitly adjudicated events in the published record.
        </p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          alert-only · no trading in this arm · replay and live cohorts kept separate
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/scorecard?domain=research"
            className="btn inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
          >
            Research scorecard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/case-study/clustsim"
            className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
          >
            ClustSim replay
          </Link>
          <Link
            href="/scan?domain=research"
            className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider"
          >
            Run a scan
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card space-y-2">
          <GitCommitIcon />
          <h2 className="text-sm font-semibold text-slate-200">Detect method risk</h2>
          <p className="text-xs leading-relaxed text-slate-500">
            Typed detectors look for statistical-method fixes and silent results rewrites.
          </p>
        </div>
        <div className="card space-y-2">
          <ShieldCheck className="h-4 w-4 text-signal" />
          <h2 className="text-sm font-semibold text-slate-200">Commit the judgment</h2>
          <p className="text-xs leading-relaxed text-slate-500">
            Above-threshold alerts are published only with a timestamped HCS proof state.
          </p>
        </div>
        <div className="card space-y-2">
          <BookOpen className="h-4 w-4 text-signal" />
          <h2 className="text-sm font-semibold text-slate-200">Grade with restraint</h2>
          <p className="text-xs leading-relaxed text-slate-500">
            Only confirmed, adjudicated record events count toward live precision.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-edge/40 bg-panel/40 p-5 sm:p-6">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-accent">
          <FlaskConical className="h-3.5 w-3.5" /> founding replay
        </div>
        <h2 className="mt-3 font-display text-2xl font-semibold text-slate-100">
          3dClustSim: a historical calibration case
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          A 2015 AFNI fix to 3dClustSim preceded the 2016 “Cluster failure” disclosure by 413 days.
          This is a replay through today’s pipeline—not evidence that the system was live in
          2015—and it remains separate from the prospective record.
        </p>
        <Link
          href="/case-study/clustsim"
          className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"
        >
          Read the replay <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  );
}

function GitCommitIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-signal/40 font-mono text-[9px] text-signal">
      Δ
    </span>
  );
}
