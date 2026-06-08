'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, type Signal } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { Eye, Clock, Shield, Activity, ChevronRight, Zap } from 'lucide-react';

export default function SignalsPage() {
  const { isAuthenticated } = useAuth();
  const {
    data: signals = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['signals'],
    queryFn: () => api.listSignals(),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Signals</h1>
        <p className="mt-1 text-sm text-slate-500">Detection timeline with proof chain records</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card animate-pulse py-4">
              <div className="flex gap-4">
                <div className="h-4 w-1/3 rounded bg-edge" />
                <div className="h-4 w-1/4 rounded bg-edge/60" />
                <div className="h-4 w-1/6 rounded bg-edge/40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card border-danger/30 bg-danger/5">
          <p className="text-sm text-danger">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && !error && signals.length === 0 && (
        <div className="card space-y-3 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Activity className="h-7 w-7 text-accent" />
          </div>
          <p className="text-lg font-semibold text-white">No signals yet</p>
          <p className="text-sm text-slate-400">
            Signals appear when a monitor detects a condition match.
          </p>
        </div>
      )}

      {signals.length > 0 && (
        <div className="space-y-2">
          {signals.map((s: Signal) => (
            <Link
              key={s.id}
              href={`/signals/${s.id}`}
              className="card group flex items-center justify-between py-4 transition-all hover:border-accent/30"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    s.is_heartbeat ? 'bg-slate-500/10' : 'bg-signal/15'
                  }`}
                >
                  {s.is_heartbeat ? (
                    <Activity className="h-4 w-4 text-slate-500" />
                  ) : (
                    <Zap className="h-4 w-4 text-signal" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200 group-hover:text-white">
                    {s.condition_summary ?? 'Signal detected'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(s.detected_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {s.hedera_tx_id && (
                      <span className="flex items-center gap-1 text-signal">
                        <Shield className="h-3 w-3" />
                        Timestamped
                      </span>
                    )}
                    {s.ipfs_cid && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <Eye className="h-3 w-3" />
                        Proof stored
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
