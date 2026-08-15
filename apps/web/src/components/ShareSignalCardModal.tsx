'use client';

import { useState } from 'react';
import { Share2, Copy, Check, Twitter, ExternalLink, X, Sparkles, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareSignalCardModalProps {
  repo: string;
  commitHash: string;
  message: string;
  conviction: number;
  action: 'long' | 'short' | 'none' | 'alert' | 'investigate';
  outcomePct?: number | null;
  onClose: () => void;
}

export function ShareSignalCardModal({
  repo,
  commitHash,
  message,
  conviction,
  action,
  outcomePct,
  onClose,
}: ShareSignalCardModalProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/scan?repo=${encodeURIComponent(repo)}`
      : `https://lenitnes.persidian.com/scan?repo=${encodeURIComponent(repo)}`;

  const tweetText =
    `🔍 LENITNES Leak-scan detected commit signal on ${repo}:\n` +
    `SHA: ${commitHash.slice(0, 7)} — "${message.slice(0, 50)}…"\n` +
    `⚡ Conviction: ${conviction}/100 [${action.toUpperCase()}]${outcomePct != null ? ` · Outcome: ${outcomePct > 0 ? '+' : ''}${outcomePct.toFixed(1)}%` : ''}\n` +
    `Proof-chained on Hedera HCS 🛡️\n\n` +
    `Audit replay: ${shareUrl}`;

  const copyShareText = () => {
    navigator.clipboard.writeText(tweetText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-edge/60 bg-panel shadow-card overflow-hidden space-y-4 p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge/30 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-accent/10 text-accent">
              <Share2 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Share Proof-Chained Signal
              </h3>
              <p className="font-mono text-[10px] text-slate-400">Viral Social Card Snippet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-ink-light transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Visual Card Preview */}
        <div className="rounded-xl border border-accent/40 bg-gradient-to-br from-panel via-ink-light to-panel p-4 space-y-3 shadow-glow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-accent to-signal text-[10px] font-black text-ink">
                L
              </div>
              <span className="font-display text-xs font-bold text-slate-100">LENITNES</span>
            </div>
            <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold flex items-center gap-1">
              <ShieldCheck className="h-2.5 w-2.5" /> Hedera Notarized
            </span>
          </div>

          <div className="space-y-1 font-mono">
            <div className="text-xs text-slate-300 font-semibold">{repo}</div>
            <div className="text-[11px] text-slate-400 truncate">
              {commitHash.slice(0, 7)}: {message}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-edge/30 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[10px]">Conviction</span>
              <span className="font-bold text-accent">{conviction}/100</span>
              <span className="text-[10px] uppercase font-bold text-slate-300">({action})</span>
            </div>
            {outcomePct != null && (
              <span className={cn('font-bold', outcomePct >= 0 ? 'text-signal' : 'text-danger')}>
                {outcomePct > 0 ? '+' : ''}
                {outcomePct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <a
            href={tweetUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full btn inline-flex items-center justify-center gap-2 py-2.5 text-xs font-semibold uppercase tracking-wider bg-accent text-ink hover:bg-accent-glow cursor-pointer"
          >
            <Twitter className="h-3.5 w-3.5" />
            Share to X / Twitter
          </a>

          <button
            onClick={copyShareText}
            className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-mono text-slate-300 hover:text-accent rounded-xl border border-edge/50 bg-ink-light/50 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-signal" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied Share Text' : 'Copy Social Card Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
