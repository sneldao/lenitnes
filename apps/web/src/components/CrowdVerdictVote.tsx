'use client';

import { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, VolumeX, Flame, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrowdVerdictVoteProps {
  signalKey: string;
  agentConviction: number;
  agentAction: 'long' | 'short' | 'none' | 'alert' | 'investigate';
}

export function CrowdVerdictVote({
  signalKey,
  agentConviction,
  agentAction,
}: CrowdVerdictVoteProps) {
  const [userVote, setUserVote] = useState<'bullish' | 'bearish' | 'noise' | null>(null);
  const [counts, setCounts] = useState({ bullish: 42, bearish: 12, noise: 8 });

  useEffect(() => {
    const saved = localStorage.getItem(`vote_${signalKey}`);
    if (saved) setUserVote(saved as 'bullish' | 'bearish' | 'noise');
  }, [signalKey]);

  const castVote = (type: 'bullish' | 'bearish' | 'noise') => {
    if (userVote) return;
    setUserVote(type);
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    localStorage.setItem(`vote_${signalKey}`, type);
  };

  const totalVotes = counts.bullish + counts.bearish + counts.noise;
  const bullishPct = Math.round((counts.bullish / totalVotes) * 100);
  const bearishPct = Math.round((counts.bearish / totalVotes) * 100);

  return (
    <div className="rounded-lg border border-edge/30 bg-ink-light/30 p-2.5 space-y-2 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase text-slate-400 font-semibold flex items-center gap-1">
          <Users className="h-3 w-3 text-accent" /> Crowd Consensus vs Agent
        </span>
        <span className="text-[9px] text-slate-500">{totalVotes} community votes</span>
      </div>

      {!userVote ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-slate-400">Predict:</span>
          <button
            onClick={() => castVote('bullish')}
            className="flex-1 py-1 px-2 rounded bg-signal/10 hover:bg-signal/20 text-signal border border-signal/30 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            🐂 Bullish
          </button>
          <button
            onClick={() => castVote('bearish')}
            className="flex-1 py-1 px-2 rounded bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            🐻 Bearish
          </button>
          <button
            onClick={() => castVote('noise')}
            className="py-1 px-2 rounded bg-ink-light hover:bg-edge/40 text-slate-400 border border-edge/30 text-[10px] transition-colors cursor-pointer"
          >
            🔇 Noise
          </button>
        </div>
      ) : (
        <div className="space-y-1.5 pt-0.5 animate-fade-in">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-300">
              Your Vote: <strong className="text-accent uppercase">{userVote}</strong>
            </span>
            <span className="text-slate-400">
              Agent:{' '}
              <strong className="text-accent font-bold">
                {agentConviction}/100 {agentAction.toUpperCase()}
              </strong>
            </span>
          </div>

          <div className="w-full bg-ink flex h-2 rounded-full overflow-hidden border border-edge/30">
            <div
              className="bg-signal transition-all duration-300"
              style={{ width: `${bullishPct}%` }}
              title={`Bullish: ${bullishPct}%`}
            />
            <div
              className="bg-danger transition-all duration-300"
              style={{ width: `${bearishPct}%` }}
              title={`Bearish: ${bearishPct}%`}
            />
            <div className="bg-slate-500 flex-1 transition-all duration-300" title="Noise" />
          </div>

          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
            <span>{bullishPct}% Bullish</span>
            <span>{bearishPct}% Bearish</span>
          </div>
        </div>
      )}
    </div>
  );
}
