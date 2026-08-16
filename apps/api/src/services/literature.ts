// ─────────────────────────────────────────────────────────────
// Literature corroboration for the LENITNES[bio] vertical.
//
// When a bio detector fires on a scientific-software repo, the agent
// needs to reason about *which published results* the change threatens.
// This module queries a research-paper index and returns structured
// hits that are folded into the agent prompt as `literature_context`.
//
// Primary source: Firecrawl Research Index (~43M abstracts: PubMed,
// bioRxiv, medRxiv, arXiv). Keyless access works out of the box; an
// optional FIRECRAWL_API_KEY raises rate limits.
// Secondary source: Paperclip (hackathon-provided) — enabled when
// PAPERCLIP_API_URL / PAPERCLIP_API_KEY are set.
//
// Design constraint (mirrors the crypto pipeline): literature is
// CORROBORATION only. It never raises conviction on its own; it gives
// the agent the citations it needs to name the affected claims.
// ─────────────────────────────────────────────────────────────

import type { LiteratureRef } from '@lenitnes/types';
import { logger } from '../logger.js';

const FIRECRAWL_RESEARCH = 'https://api.firecrawl.dev/v2/search/research/papers';
const TIMEOUT_MS = 12_000;
const MAX_HITS = 6;
const ABSTRACT_SNIPPET = 240;

interface FirecrawlPaper {
  paperId?: string;
  primaryId?: string;
  ids?: Record<string, string[]>;
  title?: string;
  abstract?: string;
  score?: number;
}

function parseArxivYear(primaryId: string | undefined): string | null {
  // arxiv:2412.03775 -> 2024-12
  const m = primaryId?.match(/arxiv:(\d{2})(\d{2})\./i);
  if (!m) return null;
  return `20${m[1] ?? ''}-${m[2] ?? ''}`;
}

async function searchFirecrawl(query: string, k: number): Promise<LiteratureRef[]> {
  const url = new URL(FIRECRAWL_RESEARCH);
  url.searchParams.set('query', query);
  url.searchParams.set('k', String(k));

  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = process.env.FIRECRAWL_API_KEY ?? '';
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(url.toString(), {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, query }, 'literature: firecrawl research request failed');
    return [];
  }

  const data = (await res.json()) as { success?: boolean; results?: FirecrawlPaper[] };
  if (!data.success || !Array.isArray(data.results)) return [];

  return data.results.slice(0, k).map<LiteratureRef>((p) => ({
    title: p.title ?? '(untitled)',
    doi: p.ids?.doi?.[0] ?? null,
    primary_id: p.primaryId ?? null,
    year: parseArxivYear(p.primaryId),
    source: 'firecrawl',
    abstract: p.abstract ?? null,
  }));
}

/**
 * MCP JSON-RPC helper for the GXL endpoint. Handles optional SSE
 * responses and session-id propagation (Mcp-Session-Id header).
 */
interface McpJsonRpcResponse {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

async function mcpCall(
  base: string,
  key: string,
  method: string,
  params: unknown,
  sessionId: string | null,
  id: number,
): Promise<{ data: McpJsonRpcResponse; sessionId: string | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-API-Key': key,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const res = await fetch(`${base.replace(/\/+$/, '')}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const sidHeader = res.headers.get('mcp-session-id');
  const text = await res.text();
  // MCP servers may answer with SSE; pull the data: lines if so.
  let payload = text;
  if (text.includes('\ndata:') || text.startsWith('data:')) {
    payload = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
  }
  let data: McpJsonRpcResponse;
  try {
    data = JSON.parse(payload) as McpJsonRpcResponse;
  } catch {
    data = { error: { message: `unparseable MCP response: ${payload.slice(0, 120)}` } };
  }
  return { data, sessionId: sidHeader ?? sessionId };
}

/** Pull text out of an MCP tools/call result ({content:[{type:'text',text}]}). */
export function extractMcpText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as { content?: unknown; structuredContent?: unknown };
  const blocks = Array.isArray(r.content) ? r.content : [];
  const texts = blocks
    .filter(
      (b): b is { type: string; text?: string } =>
        typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text',
    )
    .map((b) => b.text ?? '')
    .filter(Boolean);
  if (texts.length) return texts.join('\n');
  if (r.structuredContent) {
    try {
      return JSON.stringify(r.structuredContent);
    } catch {
      return '';
    }
  }
  return '';
}

async function searchPaperclip(query: string, k: number): Promise<LiteratureRef[]> {
  // "Paperclip" = GXL BioMedRxiv research server (hackathon literature tool).
  // Verified 2026-08-16 with the organizer key: auth works ONLY on
  // POST {base}/mcp (JSON-RPC, X-API-Key) — /api/shell and /tools/* reject it.
  // Flow: initialize -> tools/call scholar_search -> DELETE /sessions/{id}.
  // The shared server enforces a session cap ("Maximum number of sessions
  // (100) reached"); while that persists we degrade to Firecrawl. Once GXL
  // clears/raises the cap this goes live with no code change.
  const base = process.env.PAPERCLIP_API_URL ?? '';
  const key = process.env.PAPERCLIP_API_KEY ?? '';
  if (!base || !key) return [];

  let sessionId: string | null = null;
  try {
    const init = await mcpCall(
      base,
      key,
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lenitnes-bio', version: '1.0' },
      },
      null,
      1,
    );
    if (init.data.error) {
      logger.debug({ err: init.data.error }, 'literature: paperclip MCP initialize failed');
      return [];
    }
    const result = init.data.result as Record<string, unknown> | undefined;
    sessionId =
      init.sessionId ??
      (typeof result?.sessionId === 'string' ? (result.sessionId as string) : null) ??
      (typeof result?.session_id === 'string' ? (result.session_id as string) : null);

    const call = await mcpCall(
      base,
      key,
      'tools/call',
      {
        name: 'scholar_search',
        arguments: { query, max_results: k },
      },
      sessionId,
      2,
    );
    if (call.data.error) {
      logger.warn({ err: call.data.error }, 'literature: paperclip tools/call failed');
      return [];
    }
    const text = extractMcpText(call.data.result);
    if (!text) {
      logger.debug('literature: paperclip returned no text content');
      return [];
    }
    return parsePaperclipOutput(text, k);
  } catch (err) {
    logger.warn({ err }, 'literature: paperclip search error');
    return [];
  } finally {
    // Release our slot on the shared server so we don't contribute to the cap.
    if (sessionId) {
      void fetch(`${base.replace(/\/+$/, '')}/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': key },
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    }
  }
}

/**
 * Parse the shell stdout into refs. The corpus output shape isn't
 * publicly documented; accept JSON with a results/papers array when
 * the server returns structured data, otherwise log a sample and
 * return [] (Firecrawl covers the gap until the shape is confirmed).
 */
export function parsePaperclipOutput(stdout: string, k: number): LiteratureRef[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as { results?: unknown[]; papers?: unknown[] } | unknown[];
    const arr = Array.isArray(parsed)
      ? parsed
      : [...(parsed.results ?? []), ...(parsed.papers ?? [])];
    if (!arr.length) return [];
    return arr.slice(0, k).map<LiteratureRef>((raw) => {
      const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const year =
        typeof p.year === 'number' ? String(p.year) : ((p.year as string | undefined) ?? null);
      return {
        title: typeof p.title === 'string' ? p.title : '(untitled)',
        doi: typeof p.doi === 'string' ? p.doi : null,
        primary_id:
          typeof p.id === 'string' ? p.id : typeof p.doc_id === 'string' ? p.doc_id : null,
        year,
        source: 'paperclip',
        abstract: typeof p.abstract === 'string' ? p.abstract : null,
      };
    });
  } catch {
    // Non-JSON stdout: keep a sample in the logs so the real format can
    // be wired once a working key shows what search actually prints.
    logger.debug({ sample: trimmed.slice(0, 240) }, 'literature: paperclip stdout not JSON');
    return [];
  }
}

/** Build a short, keyword-rich query from the repo + detector evidence. */
export function buildLiteratureQuery(
  repo: string,
  evidence: string | null,
  summary: string | null,
): string {
  const repoName = repo.split('/').pop() ?? repo;
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'commit',
    'fix',
    'bug',
    'code',
    'change',
  ]);
  const words = new Set<string>();
  words.add(repoName);
  for (const src of [summary ?? '', evidence ?? '']) {
    for (const w of src.split(/[^a-zA-Z0-9]+/)) {
      const lw = w.toLowerCase();
      if (lw.length >= 4 && !stop.has(lw)) words.add(w);
    }
  }
  // Prefer distinctive tokens; cap length so the search stays focused.
  return [...words].slice(0, 12).join(' ');
}

/**
 * Search the literature for papers related to the repo/commits under
 * review. Firecrawl first (always available); Paperclip merges in when
 * configured. Returns up to MAX_HITS unique refs.
 */
export async function searchLiterature(
  repo: string,
  evidence: string | null,
  summary: string | null,
): Promise<LiteratureRef[]> {
  const query = buildLiteratureQuery(repo, evidence, summary);
  if (!query.trim()) return [];

  const [fc, pc] = await Promise.all([
    searchFirecrawl(query, MAX_HITS).catch((err) => {
      logger.warn({ err }, 'literature: firecrawl search threw');
      return [] as LiteratureRef[];
    }),
    searchPaperclip(query, MAX_HITS),
  ]);

  const seen = new Set<string>();
  const out: LiteratureRef[] = [];
  for (const ref of [...pc, ...fc]) {
    const key = (ref.doi ?? ref.primary_id ?? ref.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= MAX_HITS) break;
  }
  return out;
}

/** Render literature refs into a prompt-friendly context block. */
export function formatLiteratureContext(refs: LiteratureRef[]): string {
  if (refs.length === 0) return '';
  const lines: string[] = [
    'Related published literature (corroboration only — cite what the change affects):',
  ];
  refs.forEach((r, i) => {
    const doi = r.doi ? ` doi:${r.doi}` : '';
    const year = r.year ? ` (${r.year})` : '';
    lines.push(`${i + 1}. ${r.title}${year}${doi}${r.source ? ` [${r.source}]` : ''}`);
    if (r.abstract) lines.push(`   ${r.abstract.slice(0, ABSTRACT_SNIPPET)}…`);
  });
  return lines.join('\n');
}
