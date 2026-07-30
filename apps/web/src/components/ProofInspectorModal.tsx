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
import { cn } from '@/lib/utils';

export interface ProofPayload {
  signalId: string;
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  signalHash: string;
  arbitrumTxHash: string;
  ipfsCid: string;
  repo: string;
  commitSha: string;
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-edge/60 bg-panel shadow-card overflow-hidden flex flex-col space-y-4 p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge/30 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-accent/10 text-accent">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100">
                On-Chain Proof Receipt Inspector
              </h3>
              <p className="font-mono text-[10px] text-slate-400">
                Signal ID: <span className="text-accent">{proof.signalId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-ink-light transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 3 Proof Layers */}
        <div className="space-y-2 text-xs">
          {/* Hedera HCS */}
          <div className="rounded-xl border border-edge/40 bg-ink-light/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-accent" /> Hedera HCS Notarization
              </span>
              <span className="rounded bg-signal/15 text-signal px-1.5 py-0.5 font-mono text-[9px] uppercase font-bold flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" /> Validated
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-400 pt-1">
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
            <a
              href={`https://hashscan.io/mainnet/topic/${proof.topicId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline pt-1"
            >
              Verify on HashScan Explorer <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          {/* Arbitrum Registry */}
          <div className="rounded-xl border border-edge/40 bg-ink-light/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-accent" /> Arbitrum SignalRegistry Contract
              </span>
              <span className="rounded bg-accent/10 text-accent px-1.5 py-0.5 font-mono text-[9px] uppercase">
                Sepolia Testnet
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-400 space-y-0.5 pt-1">
              <div className="truncate">
                Signal Hash: <span className="text-slate-200">{proof.signalHash}</span>
              </div>
              <div className="truncate">
                Tx Hash: <span className="text-slate-200">{proof.arbitrumTxHash}</span>
              </div>
            </div>
          </div>

          {/* IPFS Package */}
          <div className="rounded-xl border border-edge/40 bg-ink-light/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-accent" /> IPFS Evidence Package
              </span>
              <span className="font-mono text-[9px] text-slate-500">Immutable Storage</span>
            </div>
            <div className="font-mono text-[10px] text-slate-400 space-y-0.5 pt-1">
              <div className="truncate">
                CID: <span className="text-slate-200">{proof.ipfsCid}</span>
              </div>
              <div>
                Target Repo: <span className="text-accent">{proof.repo}</span> (
                {proof.commitSha.slice(0, 7)})
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-edge/30 pt-3">
          <button
            onClick={copyJson}
            className="btn-ghost inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-accent font-mono py-1.5 px-3 rounded-lg border border-edge/50 cursor-pointer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-signal" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied JSON Payload' : 'Copy JSON Receipt'}
          </button>
          <button
            onClick={onClose}
            className="btn px-4 py-1.5 text-xs uppercase tracking-wider font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
