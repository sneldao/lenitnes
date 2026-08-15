'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CONSENSUS_WATCHLIST, SECTOR_GRAPHS } from '@lenitnes/types';
import {
  GitCommit,
  Brain,
  Shield,
  TrendingUp,
  Target,
  AlertTriangle,
  Eye,
  Zap,
  ArrowRight,
  Newspaper,
  Lock,
  CheckCircle2,
  FileText,
  Layers,
  Activity,
  ChevronRight,
  Sparkles,
  FlaskConical,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { ProofFlow } from '@/components/ProofFlow';
import { AgentActivityPanel } from '@/components/AgentActivityPanel';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { DomainTooltip } from '@/components/ui/DomainTooltip';
import { cn } from '@/lib/utils';

type PillarTab = 'all' | 'detection' | 'scoring' | 'safety' | 'verification';

export function MethodologyClient() {
  const [activeTab, setActiveTab] = useState<PillarTab>('all');

  return (
    <article className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* ── Header ── */}
      <header className="space-y-3 reveal in-view">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
            methodology
          </span>
          <DomainTooltip term="rubric-v4">
            <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
              Rubric v4
            </span>
          </DomainTooltip>
        </div>
        <h1 className="font-display text-3xl font-semibold text-slate-100 sm:text-4xl">
          How LENITNES turns commits into trades
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
          Autonomous proof-chained trading engine: watching GitHub commits on consensus
          infrastructure, scoring signal strength via LLM rubric, and executing paper/live trades
          gated by 7 safety checks.
        </p>
      </header>

      {/* ── Core Pillars Quick Nav / Progressive Disclosure Controller ── */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <PillarSummaryCard
            number="01"
            icon={Eye}
            title="Data & Detection"
            subtitle="9 detectors · 7d sector graphs"
            active={activeTab === 'detection'}
            onClick={() => setActiveTab(activeTab === 'detection' ? 'all' : 'detection')}
          />
          <PillarSummaryCard
            number="02"
            icon={Brain}
            title="LLM Scoring"
            subtitle="Rubric v4 · Conviction 0–100"
            active={activeTab === 'scoring'}
            onClick={() => setActiveTab(activeTab === 'scoring' ? 'all' : 'scoring')}
          />
          <PillarSummaryCard
            number="03"
            icon={Shield}
            title="Safety & Execution"
            subtitle="7 gates · Paper-first default"
            active={activeTab === 'safety'}
            onClick={() => setActiveTab(activeTab === 'safety' ? 'all' : 'safety')}
          />
          <PillarSummaryCard
            number="04"
            icon={Zap}
            title="Proof Chain"
            subtitle="Hedera HCS · Arbitrum · IPFS"
            active={activeTab === 'verification'}
            onClick={() => setActiveTab(activeTab === 'verification' ? 'all' : 'verification')}
          />
        </div>

        {/* ── View Filter Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge/40 bg-panel/40 p-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                'rounded-lg px-3 py-1.5 font-medium transition-colors',
                activeTab === 'all'
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:bg-ink-light hover:text-slate-200',
              )}
            >
              All Sections
            </button>
            <button
              onClick={() => setActiveTab('detection')}
              className={cn(
                'rounded-lg px-3 py-1.5 font-medium transition-colors',
                activeTab === 'detection'
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:bg-ink-light hover:text-slate-200',
              )}
            >
              01. Detection
            </button>
            <button
              onClick={() => setActiveTab('scoring')}
              className={cn(
                'rounded-lg px-3 py-1.5 font-medium transition-colors',
                activeTab === 'scoring'
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:bg-ink-light hover:text-slate-200',
              )}
            >
              02. Scoring
            </button>
            <button
              onClick={() => setActiveTab('safety')}
              className={cn(
                'rounded-lg px-3 py-1.5 font-medium transition-colors',
                activeTab === 'safety'
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:bg-ink-light hover:text-slate-200',
              )}
            >
              03. Safety
            </button>
            <button
              onClick={() => setActiveTab('verification')}
              className={cn(
                'rounded-lg px-3 py-1.5 font-medium transition-colors',
                activeTab === 'verification'
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:bg-ink-light hover:text-slate-200',
              )}
            >
              04. Verification
            </button>
          </div>
          <span className="hidden px-2 text-[10px] text-slate-500 sm:inline">
            Click any pillar to focus view
          </span>
        </div>
      </div>

      {/* ── Interactive Proof Loop (Always visible highlight) ── */}
      {(activeTab === 'all' || activeTab === 'detection') && (
        <section className="reveal reveal-delay-1 in-view rounded-2xl border border-edge/40 bg-panel/60 p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-accent">
              Execution Loop Blueprint
            </span>
            <span className="text-xs text-slate-500">Step-by-step pipeline</span>
          </div>
          <ProofFlow />
        </section>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* PILLAR 1: DATA & DETECTION */}
      {/* ───────────────────────────────────────────────────────────── */}
      {(activeTab === 'all' || activeTab === 'detection') && (
        <div className="space-y-6 border-t border-edge/30 pt-6">
          <SectionHeader
            badge="Pillar 01"
            title="Data & Detection"
            description="Continuous commit monitoring across consensus code repositories and 9 typed rule-based classifiers."
          />

          {/* Watchlist Section */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <Eye className="h-4 w-4 text-accent" />
                Monitored Consensus Repositories
              </span>
            }
            aside={
              <span className="font-mono text-xs text-slate-400">
                {CONSENSUS_WATCHLIST.length} repos
              </span>
            }
            defaultOpen={activeTab === 'detection'}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CONSENSUS_WATCHLIST.map((repo) => (
                  <a
                    key={repo.repo}
                    href={`https://github.com/${repo.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-xl border border-edge/30 bg-ink-light/40 p-3 transition-all duration-quick hover:border-accent/30 hover:bg-ink-light/60"
                  >
                    <div className="font-mono text-xs text-slate-300 group-hover:text-accent">
                      {repo.repo}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{repo.why}</div>
                  </a>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Admin-curated — the agent cannot expand its own watchlist.{' '}
                <Link href="/monitors" className="link-underline text-accent">
                  Full list & live status →
                </Link>
              </p>
            </div>
          </CollapsibleSection>

          {/* 9 Detectors */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <GitCommit className="h-4 w-4 text-accent" />9 Typed Commit Detectors
              </span>
            }
            aside={<span className="font-mono text-xs text-slate-400">Heuristic pass</span>}
            defaultOpen={true}
          >
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Fast classification pass before the LLM — each detector returns a score (0–100) +
                confidence. News is corroboration only; it never triggers trades on its own.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {DETECTORS.map((d) => (
                  <div
                    key={d.name}
                    className="rounded-lg border border-edge/30 bg-ink-light/40 p-3 transition-colors duration-quick hover:border-edge/50"
                  >
                    <div className="flex items-center gap-1.5">
                      {d.icon === 'newspaper' ? (
                        <Newspaper className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <GitCommit className="h-3.5 w-3.5 text-accent" />
                      )}
                      <span className="font-mono text-[11px] uppercase tracking-wider text-accent">
                        {d.name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{d.what}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Not binary — a commit can trip several detectors. The agent aggregates detector
                scores, diff evidence, 7-day price context, and past outcomes to form a verdict.
              </p>
            </div>
          </CollapsibleSection>

          {/* [bio] Integrity Detectors */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <FlaskConical className="h-4 w-4 text-signal" />
                <span className="font-mono text-signal">[bio]</span> Integrity Detectors
              </span>
            }
            aside={<span className="font-mono text-xs text-slate-400">scientific software</span>}
            defaultOpen={false}
          >
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Same pipeline, different oracle. For scientific-software repos the agent emits{' '}
                <span className="font-mono text-[10px] uppercase text-slate-300">alert</span> /{' '}
                <span className="font-mono text-[10px] uppercase text-slate-300">investigate</span>{' '}
                instead of a trade side, and grades each call against the dated scientific record
                (retraction / correction / disclosure), not a price.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-lg border border-edge/30 bg-ink-light/40 p-3 transition-colors duration-quick hover:border-edge/50">
                  <div className="flex items-center gap-1.5">
                    <GitCommit className="h-3.5 w-3.5 text-signal" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-signal">
                      method_fix
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Corrections to statistical methods, analysis pipelines, or numerical procedures
                    — the quiet patches that historically precede retractions.
                  </p>
                </div>
                <div className="rounded-lg border border-edge/30 bg-ink-light/40 p-3 transition-colors duration-quick hover:border-edge/50">
                  <div className="flex items-center gap-1.5">
                    <GitCommit className="h-3.5 w-3.5 text-signal" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-signal">
                      results_rewrite
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Silent rewrites of results-bearing artifacts (figures, tables, data) with no
                    discussion trail.
                  </p>
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-signal" />
                The agent corroborates against the literature (Firecrawl research index, Paperclip
                when available) and cites DOIs in its dispatch. Each alert is scored by lead-time to
                a ground-truth event.
              </p>
            </div>
          </CollapsibleSection>

          {/* Sector Chains */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <Layers className="h-4 w-4 text-accent" />
                Sector Chains & Upstream Graph Context
              </span>
            }
            aside={
              <span className="font-mono text-xs text-slate-400">
                {SECTOR_GRAPHS.length} sectors
              </span>
            }
            defaultOpen={activeTab === 'detection'}
          >
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Related repos form causal chains — a circuit fix in halo2, an emergency fork in
                zebra, a protocol release in zcash. The agent sees upstream events in the same
                sector (7d window) before scoring each commit batch.
              </p>
              <div className="space-y-3">
                {SECTOR_GRAPHS.map((sector) => (
                  <div
                    key={sector.id}
                    className="rounded-xl border border-edge/30 bg-ink-light/40 p-3"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                      {sector.label}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-400">
                      {sector.sequence.map((repo, i) => (
                        <span key={repo} className="flex items-center gap-1.5">
                          {i > 0 && <ArrowRight className="h-3 w-3 text-slate-600" />}
                          <span className="text-slate-300">{repo}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* PILLAR 2: SCORING & STRATEGY */}
      {/* ───────────────────────────────────────────────────────────── */}
      {(activeTab === 'all' || activeTab === 'scoring') && (
        <div className="space-y-6 border-t border-edge/30 pt-6">
          <SectionHeader
            badge="Pillar 02"
            title="LLM Scoring & Calibration"
            description="Versioned rubric (v4) evaluating commit intent, conviction scoring, and continuous calibration feedback."
          />

          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <Brain className="h-4 w-4 text-accent" />
                LLM Agent & Versioned Rubric (v4)
              </span>
            }
            aside={<span className="font-mono text-xs text-accent">NVIDIA API</span>}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-edge/30 bg-ink-light/40 p-4">
                <Brain className="h-5 w-5 text-accent shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-200">LLM Evaluation Model</div>
                  <div className="text-xs text-slate-500">
                    Versioned rubric (v4) · outputs conviction 0–100 + structured action thesis
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {AGENT_OUTPUTS.map((o) => (
                  <div key={o.label} className="rounded-lg bg-ink-light/40 p-3 text-center">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      {o.label}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-200">{o.value}</div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-500">
                Every score — including sub-threshold — lands in{' '}
                <code className="rounded bg-ink-light px-1 py-0.5 font-mono text-[11px]">
                  agent_scores
                </code>{' '}
                with timestamp + rubric version. The{' '}
                <Link href="/scorecard" className="link-underline text-accent">
                  scorecard
                </Link>{' '}
                reads that table to guarantee public verifiability.
              </p>

              <div className="rounded-xl border-l-2 border-accent/40 bg-accent/[0.04] py-3 pl-4 pr-3 text-xs text-slate-300">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Why a versioned rubric?
                </p>
                <p className="mt-1 leading-relaxed">
                  When prompt or model parameters evolve, the rubric version increments and
                  performance is sliced accordingly. Rubric v4 requires commit SHA citations in
                  theses and hard-caps news-only signals.
                </p>
              </div>

              {/* Interactive Rubric Sandbox */}
              <RubricSandbox />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <TrendingUp className="h-4 w-4 text-accent" />
                Repo Responsiveness & Calibration Loop
              </span>
            }
            aside={<span className="font-mono text-xs text-slate-400">A/B/C Tiering</span>}
            defaultOpen={activeTab === 'scoring'}
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                A 90-day replay sweep tiers every repo A/B/C before earning live agent spend —
                A-tier indicates commit signals historically co-moved with market price.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/calibration"
                  className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.04] px-4 py-2.5 text-xs text-accent transition-colors hover:border-accent/50"
                >
                  View Live Tier Table on Calibration
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/scan"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge/50 bg-panel px-4 py-2.5 text-xs text-slate-300 transition-colors hover:border-accent/40 hover:text-accent"
                >
                  Run Custom Leak-Scan Replay
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="space-y-2 pt-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Active Calibration Questions
                </p>
                <div className="space-y-1.5">
                  {OPEN_QUESTIONS.map((q) => (
                    <div key={q} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent/50" />
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* PILLAR 3: SAFETY & EXECUTION */}
      {/* ───────────────────────────────────────────────────────────── */}
      {(activeTab === 'all' || activeTab === 'safety') && (
        <div className="space-y-6 border-t border-edge/30 pt-6">
          <SectionHeader
            badge="Pillar 03"
            title="Safety Gates & Position Execution"
            description="7 automated safety checks gating every signal, paper-first default, and full position lifecycle management."
          />

          {/* Safety Gates */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <Shield className="h-4 w-4 text-accent" />7 Automated Safety Gates
              </span>
            }
            aside={<span className="font-mono text-xs text-accent">Fail → Paper</span>}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Failing any gate downgrades the signal to paper trading — the signal still records
                and notarizes, but no on-chain funds are committed.
              </p>
              <div className="space-y-3">
                {SAFETY_GATES.map((g, i) => (
                  <div
                    key={g.title}
                    className="flex items-start gap-3 rounded-lg border border-edge/30 bg-ink-light/40 p-3"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-mono text-xs text-accent">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">{g.title}</h4>
                      <p className="mt-0.5 text-xs text-slate-400">{g.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          {/* Position Lifecycle & Paper First */}
          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <Target className="h-4 w-4 text-accent" />
                Position Lifecycle & Paper Strategy
              </span>
            }
            aside={<span className="font-mono text-xs text-slate-400">Open · Settle · Close</span>}
            defaultOpen={activeTab === 'safety'}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {LIFECYCLE.map((phase, i) => (
                  <div
                    key={phase.label}
                    className="rounded-xl border border-edge/30 bg-ink-light/40 p-3"
                  >
                    <phase.icon className="h-4 w-4 text-accent" />
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      Step {i + 1}
                    </div>
                    <div className="text-sm font-semibold text-slate-200">{phase.label}</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      {phase.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-warn/20 bg-warn/[0.04] p-3.5 text-xs text-slate-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
                <p>
                  <strong className="text-warn">Paper First Strategy:</strong> Every trade starts in
                  paper mode. Live execution flips on only after calibration shows conviction
                  correlates with positive outcome yield (target: n ≥ 30 closed positions).
                </p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* PILLAR 4: PROOF CHAIN & VERIFICATION */}
      {/* ───────────────────────────────────────────────────────────── */}
      {(activeTab === 'all' || activeTab === 'verification') && (
        <div className="space-y-6 border-t border-edge/30 pt-6">
          <SectionHeader
            badge="Pillar 04"
            title="Proof Chain & Live Operations"
            description="Cryptographic verifiability across 3 independent layers and real-time agent execution telemetry."
          />

          <CollapsibleSection
            title={
              <span className="flex items-center gap-2 font-display text-base font-semibold text-slate-200">
                <Zap className="h-4 w-4 text-accent" />
                3-Layer Proof Architecture
              </span>
            }
            aside={<span className="font-mono text-xs text-slate-400">HCS · Arbitrum · IPFS</span>}
            defaultOpen={true}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PROOF_LAYERS.map((layer) => (
                  <div
                    key={layer.name}
                    className="rounded-xl border border-edge/30 bg-ink-light/40 p-4 text-center"
                  >
                    <layer.icon className="mx-auto h-5 w-5 text-accent" />
                    <div className="mt-2 text-sm font-semibold text-slate-200">{layer.name}</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      {layer.detail}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Three independent cryptographic authorities — impossible to rewrite historical
                calls. Visible on every signal page, linked from the{' '}
                <Link href="/scorecard" className="link-underline text-accent">
                  public scorecard
                </Link>
                .
              </p>
            </div>
          </CollapsibleSection>

          {/* Live Agent Activity */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" />
                Live Telemetry — <span className="text-accent italic">Agent Active</span>
              </h3>
            </div>
            <AgentActivityPanel />
          </section>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-edge/30 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <Link href="/case-study/halo2" className="link-underline text-accent">
            halo2 Case Study
          </Link>
          <span>·</span>
          <Link href="/scorecard" className="link-underline text-accent">
            Public Scorecard
          </Link>
          <span>·</span>
          <Link href="/calibration" className="link-underline text-accent">
            Calibration Loop
          </Link>
        </div>
        <a
          href="https://github.com/sneldao/lenitnes"
          className="link-underline text-accent flex items-center gap-1"
          target="_blank"
          rel="noreferrer"
        >
          Source on GitHub
          <ChevronRight className="h-3 w-3" />
        </a>
      </footer>
    </article>
  );
}

// ── Components ──────────────────────────────────────────────────

function PillarSummaryCard({
  number,
  icon: Icon,
  title,
  subtitle,
  active,
  onClick,
}: {
  number: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col text-left rounded-xl border p-3 transition-all duration-quick cursor-pointer',
        active
          ? 'border-accent/60 bg-accent/[0.08] shadow-sm'
          : 'border-edge/40 bg-panel/60 hover:border-edge/80 hover:bg-panel',
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            'font-mono text-[10px] font-semibold',
            active ? 'text-accent' : 'text-slate-500',
          )}
        >
          {number}
        </span>
        <Icon
          className={cn(
            'h-3.5 w-3.5 transition-colors',
            active ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300',
          )}
        />
      </div>
      <div className="mt-2 font-display text-xs font-semibold text-slate-200 group-hover:text-slate-100">
        {title}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-slate-500 truncate">{subtitle}</div>
    </button>
  );
}

function SectionHeader({
  badge,
  title,
  description,
}: {
  badge: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{badge}</span>
      <h2 className="font-display text-xl font-semibold text-slate-100">{title}</h2>
      <p className="text-xs text-slate-400 max-w-xl">{description}</p>
    </div>
  );
}

// ── Data ────────────────────────────────────────────────────────

const DETECTORS = [
  {
    name: 'emergency_patch',
    icon: 'commit',
    what: 'Urgency language (HOTFIX, urgent, critical) on release branches.',
  },
  {
    name: 'security_critical',
    icon: 'commit',
    what: 'Security-sensitive paths (validation, consensus, crypto) + vulnerability class.',
  },
  {
    name: 'consensus_relevant',
    icon: 'commit',
    what: 'Diff touches consensus-critical paths — chainparams, block validation, signatures.',
  },
  {
    name: 'protocol_upgrade',
    icon: 'commit',
    what: 'Versioned protocol change — soft-fork, hard-fork, BIP/EIP references.',
  },
  {
    name: 'governance_shift',
    icon: 'commit',
    what: 'Maintainer set changing, governance docs rewritten, signer rotations.',
  },
  {
    name: 'supply_chain_risk',
    icon: 'commit',
    what: 'Dependency downgrades, unknown maintainers — supply-chain incident patterns.',
  },
  {
    name: 'dependency_rotation',
    icon: 'commit',
    what: 'Lockfile churn, deprecation notices, post-incident library swaps.',
  },
  {
    name: 'maintainer_departure',
    icon: 'commit',
    what: 'Contributor inactivity >30d or removal from CODEOWNERS files.',
  },
  {
    name: 'news_signal',
    icon: 'newspaper',
    what: 'News sentiment corroboration only. Hard-capped below trading threshold.',
  },
];

const AGENT_OUTPUTS = [
  { label: 'conviction', value: '0–100' },
  { label: 'thesis', value: '280 chars' },
  { label: 'action', value: 'long/short/none' },
  { label: 'confidence', value: 'low/mid/high' },
];

const SAFETY_GATES = [
  {
    title: 'Kill switch',
    body: 'TRADING_ENABLED defaults false. No swap fires until explicitly enabled.',
  },
  {
    title: 'Asset registry',
    body: 'Only verified tokens with real on-chain addresses. Unlisted assets default to paper.',
  },
  {
    title: 'Perp venue (Propr)',
    body: 'Shorts + L1 assets route to perps with clamped leverage and mandatory SL/TP.',
  },
  {
    title: 'Chain-ID guard',
    body: 'Trades refuse execution unless chainId matches target mainnet.',
  },
  {
    title: 'Balance preflight',
    body: 'Wallet must hold amountIn + gas buffer before any swap.',
  },
  {
    title: 'Liquidity floor',
    body: 'Pool TVL must exceed the registry floor ($5M default).',
  },
  {
    title: 'Position caps',
    body: 'Max open positions + per-asset concentration limits.',
  },
];

const LIFECYCLE = [
  {
    label: 'Open',
    icon: Target,
    detail: 'Position opens in recommended direction. Entry price snapshotted; paper default.',
  },
  {
    label: 'Settle',
    icon: TrendingUp,
    detail:
      'TP/SL written at open — conviction-scaled, direction-aware. 5-min price scheduler checks.',
  },
  {
    label: 'Close',
    icon: CheckCircle2,
    detail: 'TP/SL hit, signal reversal, or manual exit. Realized P&L recorded.',
  },
];

const OPEN_QUESTIONS = [
  'Does conviction 80+ actually outperform 70–79? Data accumulating.',
  'Does the 30-minute settling delay filter already-priced-in noise?',
  'Which repos are A-tier in the 90d replay — and does live scoring agree with mock?',
  'Which detectors carry predictive weight vs decoration?',
];

const PROOF_LAYERS = [
  {
    name: 'Hedera HCS',
    icon: Zap,
    detail: 'Consensus timestamp, microsecond precision, tamper-evident.',
  },
  {
    name: 'Arbitrum',
    icon: Lock,
    detail: 'SignalRegistry contract stores signal hash on-chain.',
  },
  { name: 'IPFS', icon: FileText, detail: 'Evidence, screenshots, metadata — immutable package.' },
];

function RubricSandbox() {
  const [flags, setFlags] = useState<{ [key: string]: boolean }>({
    emergency_patch: true,
    security_critical: true,
    consensus_relevant: false,
    protocol_upgrade: false,
    news_signal: false,
  });
  const [upstreamEvent, setUpstreamEvent] = useState(true);
  const [tier, setTier] = useState<'A' | 'B' | 'C'>('A');

  // Interactive Scoring Logic (matches Rubric v4 spec)
  let score = 30; // base score
  if (flags.emergency_patch) score += 25;
  if (flags.security_critical) score += 20;
  if (flags.consensus_relevant) score += 15;
  if (flags.protocol_upgrade) score += 10;

  // News hard cap rule: if ONLY news is checked, cap at 45
  const hasCodeFlags =
    flags.emergency_patch ||
    flags.security_critical ||
    flags.consensus_relevant ||
    flags.protocol_upgrade;
  if (flags.news_signal) {
    score += hasCodeFlags ? 10 : 15;
    if (!hasCodeFlags) score = Math.min(score, 45);
  }

  if (upstreamEvent && hasCodeFlags) score += 10;
  if (tier === 'A') score += 5;
  if (tier === 'C') score = Math.max(20, score - 15);

  const finalConviction = Math.min(98, Math.max(10, score));
  const action = finalConviction >= 70 ? 'LONG' : finalConviction <= 35 ? 'SHORT' : 'NONE';
  const gatePass = finalConviction >= 70 && tier !== 'C';

  const toggle = (key: string) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="rounded-xl border border-edge/50 bg-ink-light/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Interactive Rubric v4 Simulator
        </span>
        <span className="text-[10px] font-mono text-slate-500">Live Conviction Sandbox</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Input Controls */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-slate-400 uppercase">
            Toggle Detector Triggers:
          </p>
          <div className="space-y-1.5">
            {[
              { id: 'emergency_patch', label: 'emergency_patch (+25)' },
              { id: 'security_critical', label: 'security_critical (+20)' },
              { id: 'consensus_relevant', label: 'consensus_relevant (+15)' },
              { id: 'protocol_upgrade', label: 'protocol_upgrade (+10)' },
              { id: 'news_signal', label: 'news_signal (hard capped)' },
            ].map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 text-slate-300 hover:text-slate-100 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={flags[item.id]}
                  onChange={() => toggle(item.id)}
                  className="rounded border-edge bg-ink accent-accent"
                />
                <span className="font-mono text-[11px]">{item.label}</span>
              </label>
            ))}
          </div>

          <div className="pt-2 border-t border-edge/30 space-y-2">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={upstreamEvent}
                onChange={() => setUpstreamEvent(!upstreamEvent)}
                className="rounded border-edge bg-ink accent-accent"
              />
              <span className="font-mono text-[11px]">7d Upstream Sector Event (+10)</span>
            </label>

            <div className="flex items-center gap-2 pt-1 font-mono text-[11px]">
              <span className="text-slate-400">Replay Tier:</span>
              {(['A', 'B', 'C'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors',
                    tier === t
                      ? 'bg-accent text-ink'
                      : 'bg-ink-light text-slate-400 hover:text-slate-200',
                  )}
                >
                  {t}-Tier
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Output Calculation */}
        <div className="rounded-lg border border-edge/40 bg-panel/80 p-3.5 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[10px] uppercase">
                Calculated Conviction
              </span>
              <span
                className={cn(
                  'font-mono text-xl font-bold',
                  finalConviction >= 70
                    ? 'text-signal'
                    : finalConviction >= 50
                      ? 'text-warn'
                      : 'text-slate-400',
                )}
              >
                {finalConviction} / 100
              </span>
            </div>

            <div className="w-full bg-ink-light rounded-full h-1.5 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  finalConviction >= 70
                    ? 'bg-signal'
                    : finalConviction >= 50
                      ? 'bg-warn'
                      : 'bg-slate-500',
                )}
                style={{ width: `${finalConviction}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t border-edge/30 font-mono text-[11px]">
            <div className="rounded bg-ink-light/50 p-2">
              <div className="text-[9px] uppercase text-slate-500">Recommended Action</div>
              <div
                className={cn(
                  'font-bold mt-0.5',
                  action === 'LONG'
                    ? 'text-signal'
                    : action === 'SHORT'
                      ? 'text-danger'
                      : 'text-slate-400',
                )}
              >
                {action}
              </div>
            </div>

            <div className="rounded bg-ink-light/50 p-2">
              <div className="text-[9px] uppercase text-slate-500">Safety Gate Status</div>
              <div
                className={cn(
                  'font-bold mt-0.5 text-[10px]',
                  gatePass ? 'text-signal' : 'text-warn',
                )}
              >
                {gatePass ? 'PASS (Live)' : 'PAPER DEFAULT'}
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 font-mono italic leading-tight">
            Thesis: &quot;
            {flags.emergency_patch ? 'Urgent release branch commit' : 'Routine updates'} with SHA
            citation. Conviction {finalConviction}.&quot;
          </p>
        </div>
      </div>
    </div>
  );
}
