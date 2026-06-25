'use client';

/**
 * AgentActivityPanel — the live agent heartbeat.
 *
 * Shows what the agent is doing right now:
 *   - Pulse dot + "last scored Xm ago"
 *   - Sub-threshold archive: every score, not just trades
 *   - Budget utilisation bar
 *   - Quick link to the latest above-threshold signal
 *
 * Data sources:
 *   - /scorecard/recent (public, 30s TTL) — recent calls with conviction
 *   - /monitors (public) — active watchlist for repo count
 *
 * Collapsed by default on mobile, pinned open on desktop.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Radio,
  GitCommit,
  AlertCircle,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { ScorecardRecentCall } from '@/lib/api';
import { timeAgo, convictionColor, repoLabel, formatDetectorType } from '@/lib/format';
import { OutcomePill } from '@/components/ui/outcome-pill';
import { StatCard } from '@/components/ui/stat-card';

// ── helpers ──────────────────────────────────────────────────

function ActionIcon({ action }: { action: string | null }) {
  if (action === 'long') return <TrendingUp className="h-3 w-3 text-signal" />;
  if (action === 'short') return <TrendingDown className="h-3 w-3 text-danger" />;
  return <Minus className="h-3 w-3 text-slate-500" />;
}

// ── AgentPulseDot — animates on new data ────────────────────

function AgentPulseDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {active && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2.5 w-2.5 rounded-full',
          active ? 'bg-signal' : 'bg-edge-light',
        )}
      />
    </span>
  );
}

// ── ReasoningRow — one agent score entry ────────────────────

function ReasoningRow({ call, isNew }: { call: ScorecardRecentCall; isNew: boolean }) {
  const aboveThreshold = (call.conviction ?? 0) >= 70;

  return (
    <Link
      href={`/signals/${call.signalId}`}
      className={cn(
        'group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200',
        'hover:border-accent/30 hover:bg-accent/5',
        aboveThreshold ? 'border-signal/20 bg-signal/5' : 'border-edge/30 bg-transparent',
        isNew && 'animate-fade-slide-up',
      )}
    >
      {/* Conviction score */}
      <div className="mt-0.5 shrink-0 text-right">
        <div
          className={cn(
            'font-mono text-base font-bold leading-none',
            convictionColor(call.conviction),
          )}
        >
          {call.conviction ?? '—'}
        </div>
        <div className="mt-0.5 font-mono text-[9px] text-slate-600">/100</div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <ActionIcon action={call.recommendedAction} />
          {aboveThreshold ? (
            <Badge variant="signal" className="text-[9px] py-0 px-1.5">
              traded
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
              sub-threshold
            </Badge>
          )}
          {call.detectorTypes.slice(0, 1).map((t) => (
            <Badge key={t} variant="outline" className="text-[9px] py-0 px-1.5 font-mono">
              {formatDetectorType(t)}
            </Badge>
          ))}
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-slate-300 group-hover:text-slate-100">
          {call.thesis ?? 'No thesis recorded'}
        </p>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-slate-600">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(call.detectedAt)}
          </span>
          <span>·</span>
          <span className="truncate">{repoLabel(call.monitorUrl)}</span>
        </div>
      </div>

      {/* Outcome chips */}
      {call.outcomes.t1d != null && (
        <OutcomePill label="T+1d" value={call.outcomes.t1d} className="shrink-0" />
      )}
    </Link>
  );
}

// ── Main component ───────────────────────────────────────────

export function AgentActivityPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string>>(new Set());

  const { data: recent, dataUpdatedAt } = useQuery({
    queryKey: ['scorecard', 'recent', 'activity'],
    queryFn: () => api.getScorecardRecent(8),
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  const { data: monitors } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => api.listMonitors(),
    staleTime: 60_000,
  });

  // Track which entries are freshly arrived so we can animate them in
  useEffect(() => {
    if (!recent) return;
    const incoming = new Set(recent.map((c) => c.signalId));
    const arrived = [...incoming].filter((id) => !prevIdsRef.current.has(id));
    if (arrived.length > 0) {
      setNewIds(new Set(arrived));
      setTimeout(() => setNewIds(new Set()), 1200);
    }
    prevIdsRef.current = incoming;
  }, [recent]);

  const latestAt = recent?.[0]?.detectedAt ?? null;
  const activeRepoCount = monitors?.length ?? 0;
  const aboveThresholdCount = recent?.filter((c) => (c.conviction ?? 0) >= 70).length ?? 0;
  const totalScored = recent?.length ?? 0;
  const isAlive = latestAt
    ? Date.now() - new Date(latestAt).getTime() < 24 * 60 * 60 * 1000
    : false;

  return (
    <aside
      className={cn(
        'rounded-2xl border border-edge/50 bg-panel/70 backdrop-blur-sm',
        'transition-all duration-300',
      )}
    >
      {/* ── Header row ── */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        aria-expanded={!collapsed}
        aria-label="Toggle agent activity panel"
      >
        <div className="flex items-center gap-2.5">
          <AgentPulseDot active={isAlive} />
          <span className="text-xs font-semibold text-slate-200">Agent Activity</span>
          {latestAt && (
            <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">
              last scored {timeAgo(latestAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeRepoCount > 0 && (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Radio className="h-3 w-3 text-slate-500" />
              <span className="font-mono text-[10px] text-slate-500">
                {activeRepoCount} repos monitored
              </span>
            </div>
          )}
          {totalScored > 0 && (
            <Badge
              variant={aboveThresholdCount > 0 ? 'signal' : 'secondary'}
              className="text-[10px]"
            >
              {aboveThresholdCount}/{totalScored} traded
            </Badge>
          )}
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
          )}
        </div>
      </div>

      {/* ── Expandable body ── */}
      {!collapsed && (
        <div className="border-t border-edge/30 px-3 pb-3 pt-2">
          {/* Stats strip */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            <StatCard
              size="sm"
              icon={<Activity className="h-3 w-3" />}
              label="Scored"
              value={totalScored.toString()}
            />
            <StatCard
              size="sm"
              icon={<Zap className="h-3 w-3" />}
              label="Traded"
              value={aboveThresholdCount.toString()}
              tone={aboveThresholdCount > 0 ? 'positive' : 'neutral'}
            />
            <StatCard
              size="sm"
              icon={<GitCommit className="h-3 w-3" />}
              label="Watching"
              value={`${activeRepoCount} repos`}
            />
          </div>

          {/* Recent reasoning feed */}
          {!recent ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-edge/20" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-edge/40 px-3 py-4 text-xs text-slate-500">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              The agent is monitoring. First scored commit will appear here.
            </div>
          ) : (
            <div className="space-y-1.5">
              {recent.map((call) => (
                <ReasoningRow key={call.signalId} call={call} isNew={newIds.has(call.signalId)} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between border-t border-edge/20 pt-2.5">
            <span className="font-mono text-[9px] text-slate-600">
              refreshed {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
            <Link
              href="/scorecard"
              className="font-mono text-[10px] text-accent transition-colors hover:text-accent-glow"
            >
              Full scorecard →
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}
