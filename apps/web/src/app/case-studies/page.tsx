'use client';

// Unified case-study hub: one nav entry, toggle between the two verticals.
// The deep-dive pages are loaded lazily so the switch stays instant.

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const Halo2CaseStudy = dynamic(() => import('../case-study/halo2/page'), {
  loading: () => <CaseStudyLoader label="halo2" />,
});
const ClustSimCaseStudy = dynamic(() => import('../case-study/clustsim/page'), {
  loading: () => <CaseStudyLoader label="3dClustSim" />,
});

function CaseStudyLoader({ label }: { label: string }) {
  return (
    <div className="py-16 text-center font-mono text-xs text-slate-500">
      <Loader2 className="mx-auto mb-3 h-4 w-4 animate-spin text-accent" />
      loading {label} case study…
    </div>
  );
}

export default function CaseStudiesPage() {
  const [study, setStudy] = useState<'code' | 'bio'>('code');

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">case studies</p>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          Two verdicts, one instrument
        </h1>
        <div className="flex items-center gap-2" role="tablist" aria-label="Case study">
          {(
            [
              ['code', 'halo2 [code]'],
              ['bio', '3dClustSim [bio]'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={study === key}
              onClick={() => setStudy(key)}
              className={`rounded border px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                study === key
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-edge/40 text-slate-500 hover:border-edge hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {study === 'code' ? <Halo2CaseStudy /> : <ClustSimCaseStudy />}
    </div>
  );
}
