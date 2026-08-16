'use client';

import { Fragment, useEffect, useState } from 'react';
import { GitCommit, Zap, Brain, Link2, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// ProofFlow — the agent's autonomous loop, animated.
//
// Commit → Detect → Score → HCS → Outcome. Nodes and connectors
// are flex siblings in ONE coordinate system (connector margin-top
// = half the icon height), so the pipeline stays perfectly aligned
// at every width — no SVG/HTML overlay drift.
//
// One "token" advances every beat; completed segments turn green,
// dashes march, particles drift, and the HCS node ripples while it
// notarizes. The caption underneath narrates the current phase.
// All motion is CSS; the global prefers-reduced-motion kill-switch
// in globals.css disables it uniformly.
// ─────────────────────────────────────────────────────────────

const STEPS: { label: string; icon: LucideIcon; color: string; phase: string }[] = [
  { label: 'Commit', icon: GitCommit, color: '#06b6d4', phase: 'watching public commits…' },
  { label: 'Detect', icon: Zap, color: '#22d3ee', phase: 'a commit tripped a detector…' },
  { label: 'Score', icon: Brain, color: '#8b5cf6', phase: 'LLM scoring against rubric v5…' },
  { label: 'HCS', icon: Link2, color: '#10b981', phase: 'notarizing the call to Hedera HCS…' },
  { label: 'Track', icon: TrendingUp, color: '#34d399', phase: 'tracking the T+1d outcome…' },
];

const BEAT_MS = 1100;

export function ProofFlow({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), BEAT_MS);
    return () => clearInterval(t);
  }, []);

  const active = STEPS[step];

  return (
    <div className={cn('w-full', className)}>
      {/* ── Pipeline: node · connector · node · … ── */}
      <div
        className="flex items-start"
        role="img"
        aria-label="The agent loop: commit, detect, score, notarize to HCS, track the outcome — no human input"
      >
        {STEPS.map((s, i) => {
          const isActive = step === i;
          const isDone = step > i;
          return (
            <Fragment key={s.label}>
              {/* Node */}
              <div className="flex w-12 shrink-0 flex-col items-center sm:w-16">
                <div className="relative">
                  {/* HCS ripple while notarizing */}
                  {isActive && (
                    <span
                      className="absolute inset-0 animate-ring-expand rounded-full border"
                      style={{ borderColor: `${s.color}66` }}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center rounded-full border-2 bg-panel transition-all duration-fast sm:h-12 sm:w-12',
                      isActive && 'scale-110',
                    )}
                    style={{
                      borderColor: isActive ? s.color : isDone ? '#10b98155' : '#243044',
                      boxShadow: isActive ? `0 0 18px ${s.color}45` : undefined,
                    }}
                  >
                    <s.icon
                      className="h-4 w-4 transition-colors duration-fast sm:h-5 sm:w-5"
                      style={{ color: isActive ? s.color : isDone ? '#10b981' : '#475569' }}
                    />
                  </div>
                </div>
                <span
                  className="mt-1.5 font-mono text-[9px] uppercase tracking-wider transition-colors duration-fast sm:text-[10px]"
                  style={{ color: isActive ? s.color : isDone ? '#10b98199' : '#475569' }}
                >
                  {s.label}
                </span>
              </div>

              {/* Connector — mt aligns the line to the icon centre */}
              {i < STEPS.length - 1 && (
                <div
                  className="relative mt-[19px] h-0.5 min-w-3 flex-1 sm:mt-[23px]"
                  aria-hidden="true"
                >
                  {/* marching dashes */}
                  <div
                    className="pf-dashes absolute inset-0"
                    style={{ color: isDone ? '#10b981' : '#243044' }}
                  />
                  {/* drifting particle */}
                  <span
                    className="pf-particle absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
                    style={{
                      background: isDone ? '#34d399' : '#06b6d4',
                      boxShadow: `0 0 6px ${isDone ? '#34d399' : '#06b6d4'}`,
                      animationDelay: `${i * 0.45}s`,
                    }}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* ── Phase caption — narrates the loop ── */}
      <p
        key={step}
        className="mt-4 animate-fade-in text-center font-mono text-[10px] tracking-wide text-slate-500 sm:text-[11px]"
      >
        <span style={{ color: active.color }}>●</span> {active.phase}
      </p>
    </div>
  );
}
