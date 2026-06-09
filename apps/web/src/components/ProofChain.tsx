'use client';

import { useState, useCallback } from 'react';
import { Eye, Shield, Link, Zap, type LucideIcon } from 'lucide-react';

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

export interface ProofChainStep {
  id: number;
  label: string;
  icon: LucideIcon;
  color: string;
  glowColor: string;
  borderColor: string;
  detail: string;
  /** Optional external link (e.g. HashScan, Grove). */
  href?: string;
  /** Whether this step has been completed (shows green). */
  completed?: boolean;
}

interface ProofChainProps {
  steps: ProofChainStep[];
  title?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Reusable interactive proof chain — four-step Detect→Timestamp→Store→Act flow.
 * Used on the landing page (demo data) and on the signal detail page (live tx data).
 */
export default function ProofChain({ steps, title, subtitle, className = '' }: ProofChainProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const toggle = useCallback((id: number) => setExpanded((prev) => (prev === id ? null : id)), []);

  return (
    <section className={`relative mx-auto w-full ${className}`}>
      <style dangerouslySetInnerHTML={{ __html: CHAIN_KEYFRAMES }} />

      {title && (
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
          {title}
          {subtitle && (
            <span className="bg-gradient-to-r from-accent to-signal bg-clip-text text-transparent">
              {' '}
              {subtitle}
            </span>
          )}
        </h2>
      )}

      <div className="relative flex flex-col items-stretch gap-6 sm:flex-row sm:items-start sm:gap-0">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = expanded === step.id;

          return (
            <div key={step.id} className="relative flex flex-1 flex-col items-center">
              {idx < steps.length - 1 && (
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
                    style={{ animation: 'chain-flow 1.5s linear infinite' }}
                  />
                </svg>
              )}
              {idx < steps.length - 1 && (
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
                    style={{ animation: 'chain-flow 1.5s linear infinite' }}
                  />
                </svg>
              )}
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
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ background: step.glowColor, border: `1px solid ${step.borderColor}` }}
                >
                  <Icon className="h-5 w-5" style={{ color: step.color }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: step.color }}>
                  {step.label}
                </span>
                {isActive && (
                  <div
                    className="overflow-hidden"
                    style={{ animation: 'chain-expand 0.35s ease-out both' }}
                  >
                    <p className="mt-3 text-xs leading-relaxed text-slate-400">{step.detail}</p>
                    {step.href && (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-glow"
                      >
                        Verify on-chain ↗
                      </a>
                    )}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Click each step to explore the proof chain
      </p>
    </section>
  );
}
