import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { getSectorForRepo } from './sector-graph.js';
import { monitorRepoFromUrl } from './repo-tier-policy.js';
import type { MonitorDomain } from '@lenitnes/types';

// ─────────────────────────────────────────────────────────────
// Evidence-path layer — P0 of the chained-analysis evolution.
// Makes the chain a first-class object: typed nodes, typed edges
// with provenance, the ordered path a call was scored against,
// and the HCS path commitment.
//
// buildPathFromContext is the PURE derivation core (no DB) — the
// unit-testable heart. assembleSignalPath is the DB orchestration:
// load self + candidate peers, derive, persist.
//
// Honesty invariant (AGENT_ARCHITECTURE addendum 6): P0 only ever
// creates provenance='auto' edges from pre-outcome data. Post-outcome
// links are a later curated/retrospective concern and must never feed
// calibration.
// ─────────────────────────────────────────────────────────────

export type EvidenceNodeType =
  | 'commit'
  | 'advisory'
  | 'pr'
  | 'release'
  | 'paper'
  | 'macro'
  | 'signal';

export type EvidenceEdgeKind =
  | 'same_sha'
  | 'backport'
  | 'releases_fix'
  | 'corroborates'
  | 'contradicts'
  | 'same_root'
  | 'supersedes'
  | 'paper_depends_on'
  | 'mechanism_shared'
  | 'sector_upstream';

export type EdgeProvenance = 'auto' | 'curated' | 'retrospective';

export interface EvidenceNodeInput {
  nodeType: EvidenceNodeType;
  sourceRepo?: string | null;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  detectedAt: string;
  payload?: Record<string, unknown>;
}

export interface EvidenceEdgeInput {
  kind: EvidenceEdgeKind;
  from: EvidenceNodeInput;
  to: EvidenceNodeInput;
  provenance: EdgeProvenance;
  payload?: Record<string, unknown>;
}

export interface SignalContextInput {
  signalId: string;
  repo: string;
  domain: MonitorDomain;
  detectorTypes: string[];
  detectedAt: string;
  commitShas: string[];
}

export interface PathContextInput {
  self: SignalContextInput;
  /** Candidate peers — the derivation rules decide which become edges. */
  peers: SignalContextInput[];
  /** Same-repo temporal window in hours (default 48). */
  lookbackHours?: number;
  /** Upstream sector window in days (default 7). */
  sectorLookbackDays?: number;
}

/** Detectors that mark an upstream sector signal as security-relevant. */
const SECTOR_SECURITY_DETECTORS = ['emergency_patch', 'security_critical_patch'];

/** 7-char abbreviated SHAs as stored by formatCommitEvidence. */
const SHA_PATTERN = /[0-9a-f]{7}/g;

export function extractCommitShas(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set(text.match(SHA_PATTERN) ?? [])];
}

/** Stable identity key for dedupe + hashing (order-independent). */
function nodeKey(n: EvidenceNodeInput): string {
  return `${n.nodeType}|${n.sourceRepo ?? ''}|${n.sourceRef ?? ''}`;
}

function signalNode(
  sig: Pick<SignalContextInput, 'signalId' | 'repo' | 'detectedAt'>,
): EvidenceNodeInput {
  return {
    nodeType: 'signal',
    sourceRepo: sig.repo,
    sourceRef: sig.signalId,
    detectedAt: sig.detectedAt,
    payload: { signalId: sig.signalId },
  };
}

function commitNode(repo: string, sha: string, detectedAt: string): EvidenceNodeInput {
  return {
    nodeType: 'commit',
    sourceRepo: repo,
    sourceRef: sha,
    sourceUrl: `https://github.com/${repo}/commit/${sha}`,
    detectedAt,
  };
}

/**
 * Canonical path hash: sha256 over the sorted node identities and
 * sorted edge tuples. Deterministic by construction — the same path
 * always hashes the same, and node/edge insertion order never matters.
 */
export function computePathHash(nodes: EvidenceNodeInput[], edges: EvidenceEdgeInput[]): string {
  const nodeList = nodes.map(nodeKey).sort();
  const edgeList = edges
    .map((e) => `${e.kind}|${nodeKey(e.from)}|${nodeKey(e.to)}|${e.provenance}`)
    .sort();
  const canonical = JSON.stringify({ nodes: nodeList, edges: edgeList });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export interface DerivedPath {
  nodes: EvidenceNodeInput[];
  edges: EvidenceEdgeInput[];
  pathHash: string;
}

/**
 * Pure derivation core — given a signal and its candidate peers,
 * produce the ordered nodes + edges and the path hash. No I/O.
 *
 * P0 auto-edge rules (all provenance='auto', all pre-outcome):
 *  1. corroborates   — same repo, within `lookbackHours` (one event
 *                       surfacing as several signals)
 *  2. sector_upstream — peer is upstream of self in the same sector
 *                       sequence AND fired a security detector before
 *                       self (the halo2 → zebra shape)
 *  3. same_sha       — shared commit SHA (best-effort 7-char prefixes
 *                       as stored in evidence_text)
 */
export function buildPathFromContext(ctx: PathContextInput): DerivedPath {
  const lookbackMs = (ctx.lookbackHours ?? 48) * 3_600_000;
  const sectorLookbackMs = (ctx.sectorLookbackDays ?? 7) * 86_400_000;
  const selfTs = new Date(ctx.self.detectedAt).getTime();
  const selfRepoLower = ctx.self.repo.toLowerCase();
  const selfShas = new Set(ctx.self.commitShas);

  const nodes: EvidenceNodeInput[] = [];
  const edges: EvidenceEdgeInput[] = [];
  const seen = new Set<string>();
  const addNode = (n: EvidenceNodeInput) => {
    const k = nodeKey(n);
    if (!seen.has(k)) {
      seen.add(k);
      nodes.push(n);
    }
  };

  const selfNode = signalNode(ctx.self);
  addNode(selfNode);

  const sector = getSectorForRepo(ctx.self.repo);
  const selfSectorIdx = sector
    ? sector.sequence.findIndex((r) => r.toLowerCase() === selfRepoLower)
    : -1;

  for (const peer of ctx.peers) {
    const peerTs = new Date(peer.detectedAt).getTime();
    const peerRepoLower = peer.repo.toLowerCase();
    const peerNode = signalNode(peer);

    // 1. Same-repo temporal corroboration (deterministic window).
    if (peerRepoLower === selfRepoLower && Math.abs(peerTs - selfTs) <= lookbackMs) {
      addNode(peerNode);
      edges.push({
        kind: 'corroborates',
        from: peerNode,
        to: selfNode,
        provenance: 'auto',
        payload: { reason: 'same-repo temporal cluster' },
      });
    }

    // 2. Sector upstream — peer upstream of self AND fired a security
    // detector AND fired before self AND within the sector window.
    if (sector && selfSectorIdx > 0) {
      const peerSectorIdx = sector.sequence.findIndex((r) => r.toLowerCase() === peerRepoLower);
      const peerFiredSecurity = peer.detectorTypes.some((d) =>
        SECTOR_SECURITY_DETECTORS.includes(d),
      );
      const withinSectorWindow = peerTs >= selfTs - sectorLookbackMs && peerTs <= selfTs;
      if (
        peerSectorIdx >= 0 &&
        peerSectorIdx < selfSectorIdx &&
        peerFiredSecurity &&
        withinSectorWindow
      ) {
        addNode(peerNode);
        edges.push({
          kind: 'sector_upstream',
          from: peerNode,
          to: selfNode,
          provenance: 'auto',
          payload: {
            sectorId: sector.id,
            upstreamRepo: peer.repo,
            upstreamSignalId: peer.signalId,
          },
        });
      }
    }

    // 3. Same source commit across repos (best-effort).
    const shared = peer.commitShas.filter((sha) => selfShas.has(sha));
    for (const sha of shared) {
      const selfCommit = commitNode(ctx.self.repo, sha, ctx.self.detectedAt);
      const peerCommit = commitNode(peer.repo, sha, peer.detectedAt);
      addNode(selfCommit);
      addNode(peerCommit);
      edges.push({ kind: 'same_sha', from: peerCommit, to: selfCommit, provenance: 'auto' });
    }
  }

  return { nodes, edges, pathHash: computePathHash(nodes, edges) };
}

// ── DB orchestration ─────────────────────────────────────────

export interface AssembledPath {
  signalId: string;
  pathHash: string;
  nodeCount: number;
  edgeCount: number;
}

interface SelfRow {
  url: string;
  domain: MonitorDomain;
  detected_at: string;
  evidence_text: string | null;
}

interface PeerRow {
  id: string;
  url: string;
  domain: MonitorDomain;
  detected_at: string;
  evidence_text: string | null;
  detector_types: string[];
}

/**
 * Assemble + persist the evidence path for a committed signal.
 * Best-effort by design: the caller treats failures as non-fatal.
 */
export async function assembleSignalPath(signalId: string): Promise<AssembledPath> {
  const { rows: selfRows } = await query<SelfRow>(
    `SELECT m.url, m.domain, s.detected_at::text AS detected_at, s.evidence_text
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
      WHERE s.id = $1 AND s.is_heartbeat = false`,
    [signalId],
  );
  const self = selfRows[0];
  if (!self) return { signalId, pathHash: '', nodeCount: 0, edgeCount: 0 };

  const { rows: clsRows } = await query<{ detector_type: string }>(
    `SELECT detector_type FROM signal_classifications WHERE signal_id = $1`,
    [signalId],
  );

  const selfCtx: SignalContextInput = {
    signalId,
    repo: monitorRepoFromUrl(self.url),
    domain: self.domain,
    detectorTypes: clsRows.map((r) => r.detector_type),
    detectedAt: self.detected_at,
    commitShas: extractCommitShas(self.evidence_text),
  };

  const peers = await loadPeers(signalId);
  const { nodes, edges, pathHash } = buildPathFromContext({
    self: selfCtx,
    peers,
  });

  await persistPath(signalId, nodes, edges, pathHash);
  return { signalId, pathHash, nodeCount: nodes.length, edgeCount: edges.length };
}

/** Candidate peers: non-heartbeat signals from the last 7 days. */
async function loadPeers(selfSignalId: string): Promise<SignalContextInput[]> {
  const { rows } = await query<PeerRow>(
    `SELECT
       s.id::text,
       m.url,
       m.domain,
       s.detected_at::text AS detected_at,
       s.evidence_text,
       COALESCE(array_agg(sc.detector_type) FILTER (WHERE sc.detector_type IS NOT NULL), '{}') AS detector_types
     FROM signals s
     JOIN monitors m ON m.id = s.monitor_id
     LEFT JOIN signal_classifications sc ON sc.signal_id = s.id
    WHERE s.is_heartbeat = false
      AND s.id <> $1
      AND s.detected_at > now() - interval '7 days'
    GROUP BY s.id, m.url, m.domain, s.detected_at, s.evidence_text
    ORDER BY s.detected_at DESC
    LIMIT 300`,
    [selfSignalId],
  );
  return rows.map((r) => ({
    signalId: r.id,
    repo: monitorRepoFromUrl(r.url),
    domain: r.domain,
    detectorTypes: r.detector_types,
    detectedAt: r.detected_at,
    commitShas: extractCommitShas(r.evidence_text),
  }));
}

async function persistPath(
  signalId: string,
  nodes: EvidenceNodeInput[],
  edges: EvidenceEdgeInput[],
  pathHash: string,
): Promise<void> {
  // Upsert nodes by identity, collecting DB ids in path order.
  const nodeIds: number[] = [];
  for (const n of nodes) {
    await query(
      `INSERT INTO evidence_nodes (node_type, source_repo, source_ref, source_url, detected_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        n.nodeType,
        n.sourceRepo ?? null,
        n.sourceRef ?? null,
        n.sourceUrl ?? null,
        n.detectedAt,
        JSON.stringify(n.payload ?? {}),
      ],
    );
    const { rows } = await query<{ id: number }>(
      `SELECT id FROM evidence_nodes
        WHERE node_type = $1 AND source_repo IS NOT DISTINCT FROM $2 AND source_ref IS NOT DISTINCT FROM $3`,
      [n.nodeType, n.sourceRepo ?? null, n.sourceRef ?? null],
    );
    nodeIds.push(rows[0]!.id);
  }

  const idByKey = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) idByKey.set(nodeKey(nodes[i]!), nodeIds[i]!);

  const edgeIds: number[] = [];
  for (const e of edges) {
    const fromId = idByKey.get(nodeKey(e.from));
    const toId = idByKey.get(nodeKey(e.to));
    if (fromId == null || toId == null) {
      logger.warn({ signalId, kind: e.kind }, 'evidence edge references unknown node — skipped');
      continue;
    }
    await query(
      `INSERT INTO evidence_links (kind, from_node_id, to_node_id, provenance, payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [e.kind, fromId, toId, e.provenance, JSON.stringify(e.payload ?? {})],
    );
    const { rows } = await query<{ id: number }>(
      `SELECT id FROM evidence_links WHERE kind = $1 AND from_node_id = $2 AND to_node_id = $3`,
      [e.kind, fromId, toId],
    );
    edgeIds.push(rows[0]!.id);
  }

  await query(
    `INSERT INTO signal_paths (signal_id, path_hash, node_ids, edge_ids, assembled_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (signal_id) DO UPDATE SET
       path_hash = EXCLUDED.path_hash,
       node_ids = EXCLUDED.node_ids,
       edge_ids = EXCLUDED.edge_ids,
       assembled_at = now()`,
    [signalId, pathHash, nodeIds, edgeIds],
  );

  await query(
    `INSERT INTO path_commitments (signal_id, path_hash)
     VALUES ($1, $2)
     ON CONFLICT (signal_id) DO UPDATE SET path_hash = EXCLUDED.path_hash`,
    [signalId, pathHash],
  );
}

/**
 * Record the HCS anchor for a path once its hash has ridden the agent
 * dispatch write. Called best-effort after the dispatch HCS write.
 */
export async function recordPathHcsAnchor(
  signalId: string,
  hederaTxId: string | null,
): Promise<void> {
  if (!hederaTxId) return;
  await query(
    `UPDATE path_commitments SET hedera_tx_id = COALESCE($2, hedera_tx_id) WHERE signal_id = $1`,
    [signalId, hederaTxId],
  );
}

/** Read a signal's assembled path (P1 UI + diagnostics). */
export async function getSignalPath(signalId: string): Promise<{
  pathHash: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
} | null> {
  const { rows } = await query<{ path_hash: string; node_ids: number[]; edge_ids: number[] }>(
    `SELECT path_hash, node_ids, edge_ids FROM signal_paths WHERE signal_id = $1`,
    [signalId],
  );
  const row = rows[0];
  if (!row) return null;
  const nodeIds = row.node_ids ?? [];
  const edgeIds = row.edge_ids ?? [];
  const [nodesRes, edgesRes] = await Promise.all([
    query(`SELECT * FROM evidence_nodes WHERE id = ANY($1) ORDER BY array_position($1, id)`, [
      nodeIds,
    ]),
    query(`SELECT * FROM evidence_links WHERE id = ANY($1) ORDER BY array_position($1, id)`, [
      edgeIds,
    ]),
  ]);
  return { pathHash: row.path_hash, nodes: nodesRes.rows, edges: edgesRes.rows };
}
