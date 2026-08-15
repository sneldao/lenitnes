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

async function searchPaperclip(query: string, k: number): Promise<LiteratureRef[]> {
  const base = process.env.PAPERCLIP_API_URL ?? '';
  const key = process.env.PAPERCLIP_API_KEY ?? '';
  if (!base || !key) return []; // disabled until the hackathon key is set

  try {
    const url = new URL('/search', base);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(k));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'literature: paperclip request failed');
      return [];
    }
    const data = (await res.json()) as {
      results?: Array<{ title?: string; doi?: string; year?: string | number }>;
    };
    return (data.results ?? []).slice(0, k).map<LiteratureRef>((p) => ({
      title: p.title ?? '(untitled)',
      doi: p.doi ?? null,
      primary_id: null,
      year: p.year ?? null,
      source: 'paperclip',
    }));
  } catch (err) {
    logger.warn({ err }, 'literature: paperclip search error');
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
