'use client';

import { useState, useCallback } from 'react';
import { Eye, Shield, Link, Zap } from 'lucide-react';
import { useReveal } from '@/lib/useReveal';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface Step {
  id: number;
  label: string;
  icon: typeof Eye;
  color: string;
  glowColor: string;
  borderColor: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    id: 0,
    label: 'Detect',
    icon: Eye,
    color: '#06b6d4',
    glowColor: 'rgba(6,182,212,0.15)',
    borderColor: 'rgba(6,182,212,0.5)',
    detail: 'Commit d8e48efd lands in zcash/halo2. Keywords: verifying key, anchor, security.',
  },
  {
    id: 1,
    label: 'Timestamp',
    icon: Shield,
    color: '#10b981',
    glowColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.5)',
    detail: 'Hedera HCS records at T+0. Consensus timestamp: microsecond accuracy.',
  },
  {
    id: 2,
    label: 'Store',
    icon: Link,
    color: '#22d3ee',
    glowColor: 'rgba(34,211,238,0.15)',
    borderColor: 'rgba(34,211,238,0.5)',
    detail: 'Grove stores screenshot, diff, SHA. IPFS CID generated.',
  },
  {
    id: 3,
    label: 'Act',
    icon: Zap,
    color: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.5)',
    detail: 'Kraken rule triggers. ZEC hedge executed before news breaks.',
  },
];

/* ------------------------------------------------------------------ */
/*  Keyframes                                                          */
/* ------------------------------------------------------------------ */

const CHAIN_KEYFRAMES = `
@keyframes chain-flow {
  0%   { stroke-dashoffset: 20 }
  100% { stroke-dashoffset: 0 }
}
@keyframes chain-node-glow {
  0%, 100% { box-shadow: 0 0 8px var(--glow) }
  50%      { box-shadow: 0 0 22px var(--glow) }
}
@keyframes chain-expand {
  from { opacity: 0; max-height: 0; margin-top: 0 }
  to   { opacity: 1; max-height: 120px; margin-top: 12px }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes chain-flow      { 0%, 100% { stroke-dashoffset: 0 } }
  @keyframes chain-node-glow { 0%, 100% { box-shadow: none } }
  @keyframes chain-expand    { from { opacity: 1 } to { opacity: 1 } }
}
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProofChainLive() {
  const containerRef = useReveal();
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = useCallback((id: number) => setExpanded((prev) => (prev === id ? null : id)), []);

  return (
    <section ref={containerRef} className="relative mx-auto max-w-4xl px-4 py-24">
      <style dangerouslySetInnerHTML={{ __html: CHAIN_KEYFRAMES }} />

      {/* Section title */}
      <h2 className="reveal mb-14 text-center text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
        Four steps. Fully automated.{' '}
        <span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">
          Cryptographically verifiable.
        </span>
      </h2>

      {/* Steps row */}
      <div className="reveal reveal-delay-1 relative flex flex-col items-stretch gap-6 sm:flex-row sm:items-start sm:gap-0">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = expanded === step.id;

          return (
            <div key={step.id} className="relative flex flex-1 flex-col items-center">
              {/* Connector line (not on last) */}
              {idx < STEPS.length - 1 && (
                <svg
                  className="pointer-events-none absolute left-1/2 top-8 hidden h-[2px] sm:block"
                  style={{ width: '100%', zIndex: 0 }}
                  aria-hidden="true"
                >
                  <line
                    x1="50%"
                    y1="1"
                    x2="100%"
                    y2="1"
                    stroke="#243044"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    style={{
                      animation: 'chain-flow 1.5s linear infinite',
                    }}
                  />
                </svg>
              )}

              {/* Vertical connector for mobile */}
              {idx < STEPS.length - 1 && (
                <svg
                  className="pointer-events-none absolute -bottom-6 left-1/2 -ml-px block h-6 w-[2px] sm:hidden"
                  aria-hidden="true"
                >
                  <line
                    x1="1"
                    y1="0"
                    x2="1"
                    y2="24"
                    stroke="#243044"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    style={{
                      animation: 'chain-flow 1.5s linear infinite',
                    }}
                  />
                </svg>
              )}

              {/* Node */}
              <button
                onClick={() => toggle(step.id)}
                className="card relative z-10 flex w-full cursor-pointer flex-col items-center px-4 py-5 text-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={
                  isActive
                    ? ({
                        '--glow': step.glowColor,
                        borderColor: step.borderColor,
                        animation: 'chain-node-glow 2s ease-in-out infinite',
                      } as React.CSSProperties)
                    : undefined
                }
                aria-expanded={isActive}
              >
                {/* Icon circle */}
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    background: step.glowColor,
                    border: `1px solid ${step.borderColor}`,
                  }}
                >
                  <Icon className="h-5 w-5" style={{ color: step.color }} />
                </div>

                <span className="text-sm font-semibold" style={{ color: step.color }}>
                  {step.label}
                </span>

                {/* Expanded detail */}
                {isActive && (
                  <div
                    className="overflow-hidden"
                    style={{
                      animation: 'chain-expand 0.35s ease-out both',
                    }}
                  >
                    <p className="mt-3 text-xs leading-relaxed text-slate-400">{step.detail}</p>
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <p className="reveal reveal-delay-3 mt-8 text-center text-xs text-slate-600">
        Click each step to explore the proof chain
      </p>
    </section>
  );
}
