'use client';

import { useMemo } from 'react';
import type { Signal } from '@lenitnes/types';

interface MonitorSparklineProps {
  monitorId: string;
  signals: Signal[];
}

export function MonitorSparkline({ monitorId, signals }: MonitorSparklineProps) {
  const bars = useMemo(() => {
    const days = 7;
    const buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      d.setHours(0, 0, 0, 0);
      return { date: d, signals: 0, heartbeats: 0 };
    });

    signals
      .filter((s) => s.monitor_id === monitorId)
      .forEach((s) => {
        const t = new Date(s.detected_at);
        const idx = buckets.findIndex((b, i) => {
          const next = buckets[i + 1];
          return t >= b.date && (!next || t < next.date);
        });
        if (idx === -1) return;
        if (s.is_heartbeat) buckets[idx].heartbeats++;
        else buckets[idx].signals++;
      });

    const maxTotal = Math.max(...buckets.map((b) => b.signals + b.heartbeats), 1);
    return buckets.map((b) => ({
      ...b,
      signalPct: (b.signals / maxTotal) * 100,
      heartbeatPct: (b.heartbeats / maxTotal) * 100,
      total: b.signals + b.heartbeats,
    }));
  }, [monitorId, signals]);

  const hasActivity = bars.some((b) => b.total > 0);

  return (
    <div className="flex items-end gap-0.5 h-6" title="7-day activity">
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-px h-full">
          {bar.signals > 0 && (
            <div
              className="w-full rounded-sm bg-accent/70 min-h-[2px]"
              style={{ height: `${Math.max(bar.signalPct, 8)}%` }}
            />
          )}
          {bar.heartbeats > 0 && (
            <div
              className="w-full rounded-sm bg-edge-light min-h-[2px]"
              style={{ height: `${Math.max(bar.heartbeatPct * 0.5, 4)}%` }}
            />
          )}
          {bar.total === 0 && (
            <div className="w-full rounded-sm bg-edge/30" style={{ height: '4px' }} />
          )}
        </div>
      ))}
      {!hasActivity && (
        <span className="absolute font-mono text-[9px] text-slate-700 -mt-1">no data</span>
      )}
    </div>
  );
}
