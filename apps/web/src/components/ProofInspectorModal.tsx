'use client';

import { useState } from 'react';
import {
  Zap,
  Lock,
  FileText,
  CheckCircle2,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

export interface ProofPayload {
  status: 'verified' | 'unavailable';
  signalId: string;
  repo: string;
  commitSha: string;
  topicId?: string;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  signalHash?: string;
  arbitrumTxHash?: string;
  ipfsCid?: string;
}

interface ProofInspectorModalProps {
  proof: ProofPayload | null;
  onClose: () => void;
}

export function ProofInspectorModal({ proof, onClose }: ProofInspectorModalProps) {
  const [copied, setCopied] = useState(false);

  if (!proof) return null;

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verified = proof.status === 'verified';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col space-y-4 overflow-hidden rounded-2xl border border-edge/60 bg-panel p-5 shadow-card sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge/30 pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-accent/10 p-1.5 text-accent">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Proof receipt inspector
              </h3>
              <p className="font-mono text-[10px] text-slate-400">
                Signal ID: <span className="text-accent">{proof.signalId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-ink-light hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!verified ? (
          <div className="rounded-xl border border-warn/30 bg-warn/[0.06] p-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-warn">
              No on-chain receipt attached
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This is a historical replay/capability scan. It has commit evidence and an agent
              verdict, but it was not a live production signal and has no HCS, Arbitrum, or IPFS
              receipt to verify.
            </p>
            <p className="mt-3 font-mono text-[10px] text-slate-500">
              {proof.repo} · {proof.commitSha.slice(0, 12)}
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="space-y-1.5 rounded-xl border border-edge/40 bg-ink-light/40 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-200">
                  <Zap className="h-3.5 w-3.5 text-accent" /> Hedera HCS notarization
                </span>
                <span className="flex items-center gap-1 rounded bg-signal/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-signal">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px] text-slate-400">
                <div>
                  Topic: <span className="text-slate-200">{proof.topicId}</span>
                </div>
                <div>
                  Seq #: <span className="text-slate-200">{proof.sequenceNumber}</span>
                </div>
                <div className="col-span-2 truncate">
                  Timestamp: <span className="text-accent">{proof.consensusTimestamp}</span>
                </div>
              </div>
              {proof.topicId && (
                <a
                  href={`https://hashscan.io/testnet/topic/${proof.topicId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 pt-1 font-mono text-[10px] text-accent hover:underline"
                >
                  Verify on HashScan <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
            {proof.arbitrumTxHash && (
              <div className="space-y-1.5 rounded-xl border border-edge/40 bg-ink-light/40 p-3">
                <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-200">
                  <Lock className="h-3.5 w-3.5 text-accent" /> Arbitrum SignalRegistry
                </span>
                <div className="truncate font-mono text-[10px] text-slate-400">
                  Tx: <span className="text-slate-200">{proof.arbitrumTxHash}</span>
                </div>
              </div>
            )}
            {proof.ipfsCid && (
              <div className="space-y-1.5 rounded-xl border border-edge/40 bg-ink-light/40 p-3">
                <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-slate-200">
                  <FileText className="h-3.5 w-3.5 text-accent" /> IPFS evidence package
                </span>
                <div className="truncate font-mono text-[10px] text-slate-400">
                  CID: <span className="text-slate-200">{proof.ipfsCid}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-edge/30 pt-3">
          <button
            onClick={copyJson}
            className="btn-ghost inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-edge/50 px-3 py-1.5 font-mono text-xs text-slate-300 hover:text-accent"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-signal" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied JSON' : 'Copy JSON state'}
          </button>
          <button
            onClick={onClose}
            className="btn cursor-pointer px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
