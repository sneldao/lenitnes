'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, GitBranch, GitCommitHorizontal, FileText, Link2 } from 'lucide-react';
import type { EvidencePath as EvidencePathData } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

// ─────────────────────────────────────────────────────────────
// Evidence path (P1) — the assembled chain behind a signal.
// Renders the ordered node list + the auto/curated edges that
// link them, the canonical path hash, and the HCS commitment
// status. Single-node paths get the "one decisive event"
// treatment instead of a graph. Rendered on the signal detail
// page AND the public proof page (shared component).
// ─────────────────────────────────────────────────────────────

type PathNode = Record<string, unknown> & {
  id: number;
  node_type?: string;
  source_repo?: string | null;
  source_ref?: string | null;
  source_url?: string | null;
  detected_at?: string | null;
  payload?: Record<string, unknown> | null;
};

type PathEdge = Record<string, unknown> & {
  id: number;
  kind?: string;
  from_node_id?: number | string;
  to_node_id?: number | string;
  provenance?: string;
  detected_at?: string | null;
  payload?: Record<string, unknown> | null;
};

const NODE_LABELS: Record<string, string> = {
  commit: 'commit',
  advisory: 'advisory',
  pr: 'PR',
  release: 'release',
  paper: 'paper',
  macro: 'macro',
  signal: 'signal',
};

const NODE_ICONS: Record<string, typeof GitCommitHorizontal> = {
  commit: GitCommitHorizontal,
  advisory: FileText,
  pr: GitBranch,
  release: GitBranch,
  paper: FileText,
  macro: Link2,
  signal: GitCommitHorizontal,
};

const EDGE_LABELS: Record<string, string> = {
  same_sha: 'same commit sha',
  backport: 'backport',
  releases_fix: 'releases a fix',
  corroborates: 'corroborates',
  contradicts: 'contradicts',
  same_root: 'same root cause',
  supersedes: 'supersedes',
  paper_depends_on: 'paper depends on',
  mechanism_shared: 'shared mechanism',
  sector_upstream: 'sector upstream',
};

function nodeLabel(n: PathNode): string {
  return NODE_LABELS[n.node_type ?? ''] ?? n.node_type ?? 'evidence';
}

function nodeTitle(n: PathNode): string {
  const repo = n.source_repo ?? '';
  const ref = n.source_ref ?? '';
  if (n.node_type === 'signal') return ref ? `signal ${ref.slice(0, 8)}` : 'signal';
  return [repo, ref && ref.length > 7 ? ref.slice(0, 7) : ref].filter(Boolean).join(' · ');
}

export function EvidencePath({ path }: { path: EvidencePathData }) {
  const [copied, setCopied] = useState(false);
  const nodes = (path.nodes ?? []) as PathNode[];
  const edges = (path.edges ?? []) as PathEdge[];
  const single = nodes.length <= 1;

  const nodeById = useMemo(() => {
    const m = new Map<number, PathNode>();
    for (const n of nodes) m.set(Number(n.id), n);
    return m;
  }, [nodes]);

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(path.pathHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — the hash is still visible inline
    }
  };

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-accent" />
          Evidence path
        </h2>
        <div className="flex items-center gap-2">
          {path.commitment && (
            <span
              className={cn(
                'badge text-[10px] uppercase tracking-wider',
                path.commitment.anchored
                  ? 'bg-signal/15 text-signal'
                  : 'bg-slate-500/15 text-slate-400',
              )}
            >
              {path.commitment.anchored ? 'hash anchored' : 'commitment pending'}
            </span>
          )}
          <span className="badge bg-edge/30 text-slate-400 text-[10px] uppercase tracking-wider">
            {single ? '1 node' : `${nodes.length} nodes · ${edges.length} edges`}
          </span>
        </div>
      </div>

      {single ? (
        <div className="rounded-xl border border-edge/30 bg-ink-light/40 p-4">
          <p className="text-sm text-slate-300">
            <span className="font-mono text-accent">one decisive event</span> — no corroborating
            peers, upstream sector signals, or shared commits were within the deterministic window.
            The path is the signal itself.
          </p>
        </div>
      ) : (
        <ol className="space-y-0">
          {nodes.map((node, i) => {
            const Icon = NODE_ICONS[node.node_type ?? ''] ?? GitCommitHorizontal;
            const incoming = edges.filter((e) => Number(e.to_node_id) === Number(node.id));
            const outgoing = edges.filter((e) => Number(e.from_node_id) === Number(node.id));
            return (
              <li key={String(node.id)} className="relative pl-6 pb-4 last:pb-0">
                {/* vertical rail */}
                {i < nodes.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[13px] top-7 bottom-0 w-px bg-edge/40"
                  />
                )}
                <span
                  className={cn(
                    'absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-lg',
                    node.node_type === 'signal'
                      ? 'bg-accent/15 text-accent'
                      : 'bg-panel-hover text-slate-400',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>

                <div className="ml-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-600">{i + 1}</span>
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      {nodeTitle(node)}
                    </span>
                    <span className="badge bg-edge/30 text-slate-400 text-[10px] uppercase tracking-wider">
                      {nodeLabel(node)}
                    </span>
                    {node.detected_at && (
                      <span className="ml-auto font-mono text-[10px] text-slate-500">
                        {formatDate(node.detected_at)}
                      </span>
                    )}
                  </div>

                  {(incoming.length > 0 || outgoing.length > 0) && (
                    <div className="mt-1.5 space-y-1">
                      {[...incoming, ...outgoing].map((edge) => {
                        const isIncoming = incoming.includes(edge);
                        const peer = nodeById.get(
                          Number(isIncoming ? edge.from_node_id : edge.to_node_id),
                        );
                        return (
                          <p
                            key={String(edge.id)}
                            className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-500"
                          >
                            <span
                              className={cn(
                                'rounded px-1 py-px uppercase tracking-wider',
                                edge.provenance === 'curated'
                                  ? 'bg-violet/15 text-violet'
                                  : 'bg-accent/10 text-accent',
                              )}
                            >
                              {EDGE_LABELS[edge.kind ?? ''] ?? edge.kind ?? 'linked'}
                            </span>
                            <span className="text-slate-600">{isIncoming ? '←' : '→'}</span>
                            <span className="text-slate-400">
                              {peer ? nodeTitle(peer) : String(peer ?? '?')}
                            </span>
                            {edge.detected_at && (
                              <span className="text-slate-600">{formatDate(edge.detected_at)}</span>
                            )}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-edge/30 pt-3">
        <button
          onClick={copyHash}
          className="group inline-flex items-center gap-1.5 font-mono text-[10px] text-slate-500 transition-colors hover:text-accent"
          aria-label="Copy path hash"
        >
          {copied ? <Check className="h-3 w-3 text-signal" /> : <Copy className="h-3 w-3" />}
          <span className="max-w-[240px] truncate sm:max-w-none">{path.pathHash}</span>
        </button>
        {path.commitment?.anchored && path.commitment.hederaTxId && (
          <Link
            href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(path.commitment.hederaTxId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] text-accent transition-colors hover:text-accent-glow"
          >
            hashscan <Link2 className="h-3 w-3" />
          </Link>
        )}
        <span className="ml-auto font-mono text-[10px] text-slate-600">
          canonical hash of the assembled chain
        </span>
      </div>
    </div>
  );
}
