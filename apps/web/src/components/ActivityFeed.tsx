'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Shield, Activity, Zap, GitCommit, Clock } from 'lucide-react';
import type { Signal, Monitor } from '@lenitnes/types';

const TYPE_META: Record<string, { label: string; color: string; icon: typeof Zap }> = {
  emergency_patch: { label: 'Emergency patch', color: 'text-danger', icon: Zap },
  security_critical_patch: { label: 'Security critical', color: 'text-warn', icon: Shield },
  governance_shift: { label: 'Governance shift', color: 'text-violet', icon: Activity },
  silent_merge: { label: 'Silent merge', color: 'text-accent', icon: GitCommit },
  protocol_upgrade: { label: 'Protocol upgrade', color: 'text-signal', icon: Activity },
  dependency_rotation: { label: 'Dependency rotation', color: 'text-cyan-400', icon: GitCommit },
  maintainer_departure: { label: 'Maintainer departure', color: 'text-warn', icon: Activity },
  supply_chain_risk: { label: 'Supply chain risk', color: 'text-danger', icon: Shield },
};

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

interface ActivityFeedProps {
  signals: Signal[];
  monitors: Monitor[];
}

export function ActivityFeed({ signals, monitors }: ActivityFeedProps) {
  const monitorMap = useMemo(() => Object.fromEntries(monitors.map((m) => [m.id, m])), [monitors]);

  // Real signals + synthetic heartbeat entries so the feed is never empty
  const events = useMemo(() => {
    const real = signals
      .filter((s) => !s.is_heartbeat)
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        signalId: s.id,
        monitorUrl: monitorMap[s.monitor_id]?.url ?? '',
        summary: s.condition_summary ?? 'Signal detected',
        detectedAt: s.detected_at,
        hedera: Boolean(s.hedera_tx_id),
        isNew: !s.viewed_at,
        type: 'signal' as const,
      }));

    // Fill with heartbeat activity if < 5 real events
    const heartbeats = signals
      .filter((s) => s.is_heartbeat)
      .slice(0, Math.max(0, 5 - real.length))
      .map((s) => ({
        id: `hb-${s.id}`,
        signalId: s.id,
        monitorUrl: monitorMap[s.monitor_id]?.url ?? '',
        summary: 'Heartbeat check — no signal',
        detectedAt: s.detected_at,
        hedera: Boolean(s.hedera_tx_id),
        isNew: false,
        type: 'heartbeat' as const,
      }));

    return [...real, ...heartbeats].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
  }, [signals, monitorMap]);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-edge/40 bg-ink-light/20 px-5 py-8 text-center">
        <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-edge/40">
          <Activity className="h-4 w-4 text-slate-600" />
        </div>
        <p className="font-mono text-xs text-slate-600">
          activity appears here as monitors run checks
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-edge/30 overflow-hidden rounded-xl border border-edge/50 bg-ink-light/30">
      {events.map((ev) => {
        const host = ev.monitorUrl.replace(/^https?:\/\//, '').replace(/\/.*/, '');
        const isSignal = ev.type === 'signal';

        return (
          <Link
            key={ev.id}
            href={isSignal ? `/signals/${ev.signalId}` : '#'}
            className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
              isSignal ? 'hover:bg-panel-hover/50 cursor-pointer' : 'cursor-default'
            }`}
          >
            {/* Status dot */}
            <div className="relative shrink-0">
              <span
                className={`flex h-1.5 w-1.5 rounded-full ${
                  isSignal ? (ev.isNew ? 'bg-accent' : 'bg-signal') : 'bg-slate-700'
                }`}
              />
              {isSignal && ev.isNew && (
                <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className={`truncate font-mono text-[11px] font-medium ${
                    isSignal ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {host}
                </span>
                {ev.hedera && isSignal && (
                  <span className="shrink-0 rounded-full bg-signal/10 px-1.5 py-px font-mono text-[9px] text-signal">
                    HCS
                  </span>
                )}
              </div>
              <p
                className={`mt-0.5 truncate text-[11px] ${
                  isSignal ? 'text-slate-400' : 'text-slate-700'
                }`}
              >
                {ev.summary}
              </p>
            </div>

            {/* Timestamp */}
            <span className="shrink-0 font-mono text-[10px] text-slate-700">
              {timeAgo(ev.detectedAt)}
            </span>
          </Link>
        );
      })}

      <div className="flex items-center justify-between px-4 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-slate-700">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal" />
          </span>
          live
        </span>
        <Link
          href="/signals"
          className="font-mono text-[10px] text-slate-600 transition-colors hover:text-accent"
        >
          all signals →
        </Link>
      </div>
    </div>
  );
}
