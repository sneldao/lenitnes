'use client';

/**
 * AgentReasoningCard — surfaces the agent's full verdict in a way that feels
 * like the model is showing its work, not just returning a number.
 *
 * Layout:
 *   ┌─ Conviction score (large, animated reveal) ─────────────────────┐
 *   │  confidence band · action · rubric version                       │
 *   │  ─────────────────────────────────────────────────────────────── │
 *   │  [Thesis text — typewriter reveal on first render]               │
 *   │  ─────────────────────────────────────────────────────────────── │
 *   │  ▶ Detector breakdown (collapsible)                              │
 *   └──────────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  convictionColor,
  scoreColor,
  scoreBgColor,
  formatDetectorType,
  formatIsoShort,
} from '@/lib/format';
import { useTypewriter } from '@/lib/hooks/useTypewriter';
import type { AgentScore, DetectorClassification } from '@/lib/api';

interface AgentReasoningCardProps {
  agentScore: AgentScore;
  classifications?: DetectorClassification[];
  className?: string;
}

// ── Conviction bar ─────────────────────────────────────────

function ConvictionBar({ value, max = 100 }: { value: number; max?: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth((value / max) * 100), 100);
    return () => clearTimeout(t);
  }, [value, max]);

  const color = value >= 70 ? 'bg-signal' : value >= 50 ? 'bg-warn' : 'bg-slate-500';

  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-edge/40">
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
          color,
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ── Action badge ────────────────────────────────────────────

function ActionBadge({ action }: { action: 'long' | 'short' | 'none' }) {
  if (action === 'long')
    return (
      <Badge variant="signal" className="gap-1 text-[10px]">
        <TrendingUp className="h-2.5 w-2.5" />
        LONG
      </Badge>
    );
  if (action === 'short')
    return (
      <Badge variant="destructive" className="gap-1 text-[10px]">
        <TrendingDown className="h-2.5 w-2.5" />
        SHORT
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      <Minus className="h-2.5 w-2.5" />
      NO TRADE
    </Badge>
  );
}

// ── Band badge ──────────────────────────────────────────────

function BandBadge({ band }: { band: 'low' | 'mid' | 'high' }) {
  const map = {
    high: { variant: 'signal' as const, label: 'HIGH CONFIDENCE' },
    mid: { variant: 'warn' as const, label: 'MID CONFIDENCE' },
    low: { variant: 'secondary' as const, label: 'LOW CONFIDENCE' },
  };
  const { variant, label } = map[band];
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}
    </Badge>
  );
}

// ── Main ────────────────────────────────────────────────────

export function AgentReasoningCard({
  agentScore,
  classifications = [],
  className,
}: AgentReasoningCardProps) {
  // Thesis renders fully on mount when the user prefers reduced motion
  // or returns to the page; the animation only fires for first-time
  // visitors who have motion enabled, so clicking "open proof" never
  // feels laggy.
  const { displayed, done, skip } = useTypewriter(agentScore.thesis ?? '', 8);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const convColor = convictionColor(agentScore.conviction);

  const thresholdMet = agentScore.conviction >= 70;

  return (
    <div
      className={cn(
        'rounded-2xl border bg-panel/60 backdrop-blur-sm',
        thresholdMet ? 'border-signal/25' : 'border-edge/40',
        className,
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
            <Brain className="h-4.5 w-4.5 text-accent" style={{ height: '18px', width: '18px' }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-100">Agent Reasoning</span>
              {thresholdMet && <Sparkles className="h-3 w-3 text-signal" />}
            </div>
            <p className="text-[10px] text-slate-500">
              rubric {agentScore.rubricVersion} · {formatIsoShort(agentScore.createdAt)}Z
            </p>
          </div>
        </div>

        {/* Conviction number */}
        <div className="shrink-0 text-right">
          <div className={cn('font-mono text-4xl font-bold leading-none', convColor)}>
            {agentScore.conviction}
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500">/100 conviction</div>
        </div>
      </div>

      {/* Conviction bar */}
      <div className="mt-3 px-5">
        <ConvictionBar value={agentScore.conviction} />
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2 px-5">
        <ActionBadge action={agentScore.recommendedAction} />
        <BandBadge band={agentScore.confidenceBand} />
        {!thresholdMet && (
          <Badge variant="secondary" className="text-[10px]">
            sub-threshold · no trade
          </Badge>
        )}
      </div>

      {/* Thesis — typewriter reveal, with click-to-skip */}
      <div className="mx-5 mt-4 rounded-xl border border-accent/10 bg-accent/[0.04] px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Agent thesis
          </p>
          {!done && (
            <button
              type="button"
              onClick={skip}
              className="font-mono text-[10px] uppercase tracking-wider text-slate-500 transition-colors hover:text-accent"
            >
              skip
            </button>
          )}
        </div>
        <blockquote className="text-sm italic leading-relaxed text-slate-200">
          &ldquo;{displayed}
          {!done && (
            <span className="ml-0.5 inline-block h-3.5 w-px animate-typing-cursor bg-accent align-text-bottom" />
          )}
          &rdquo;
        </blockquote>
      </div>

      {/* Detector breakdown — collapsible */}
      {classifications.length > 0 && (
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="px-5 pb-5 mt-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-edge/30 px-3 py-2 text-left transition-colors hover:border-accent/30 hover:bg-accent/5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Detector breakdown · {classifications.length} fired
            </span>
            {detailsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2 overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            {classifications.map((c) => {
              return (
                <div
                  key={c.detectorType}
                  className="rounded-lg border border-edge/25 bg-ink-light/30 p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                        {formatDetectorType(c.detectorType)}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-300">{c.label}</div>
                    </div>
                    <div className="shrink-0 text-right font-mono">
                      <div className={cn('text-base font-bold', scoreColor(c.score))}>
                        {c.score}
                        <span className="text-[10px] text-slate-500">/100</span>
                      </div>
                      <div className="text-[9px] text-slate-600">conf {c.confidence}%</div>
                    </div>
                  </div>
                  <div className="relative h-1 overflow-hidden rounded-full bg-edge/30">
                    <div
                      className={cn('absolute inset-y-0 left-0', scoreBgColor(c.score))}
                      style={{ width: `${c.score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      {classifications.length === 0 && <div className="pb-5" />}
    </div>
  );
}
