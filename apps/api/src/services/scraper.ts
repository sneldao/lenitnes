// Lightweight HTML scraper fallback when TinyFish is unavailable.
// Uses Node.js built-in fetch (or global fetch) with AbortSignal timeout.
// WARNING: This is a degraded-mode fallback. It cannot understand natural language.
// It only does a basic text search for keywords from the condition.

import { withRetry } from './retry.js';

export interface ScraperResult {
  runId: 'scraper-fallback';
  conditionMet: boolean;
  evidence: string;
  summary: string;
  screenshots: string[];
  latestCommitHash?: string;
}

export async function runScraperFallback(url: string, condition: string): Promise<ScraperResult> {
  const res = await withRetry(
    () =>
      fetch(url, {
        headers: { 'User-Agent': 'LENITNES-scraper/1.0' },
        signal: AbortSignal.timeout(15_000),
      }),
    { retries: 1, baseDelayMs: 500 },
  );

  if (!res.ok) {
    throw new Error(`Scraper fallback failed: ${res.status}`);
  }

  const html = await res.text();
  const text = stripHtml(html);

  // Extract keywords from condition (naive: words > 3 chars).
  const keywords = condition
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const textLower = text.toLowerCase();
  const found = keywords.filter((k) => textLower.includes(k));
  const matchRatio = keywords.length > 0 ? found.length / keywords.length : 0;

  return {
    runId: 'scraper-fallback',
    conditionMet: matchRatio >= 0.5,
    evidence: text.slice(0, 500),
    summary: `Scraper fallback: ${found.length}/${keywords.length} keywords matched.`,
    screenshots: [],
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'this',
  'that',
  'these',
  'those',
  'with',
  'from',
  'have',
  'been',
  'were',
  'they',
  'will',
  'would',
  'should',
  'could',
  'must',
  'might',
  'about',
  'than',
  'only',
  'also',
  'just',
  'even',
  'what',
  'when',
  'where',
  'which',
  'while',
  'after',
  'before',
  'during',
  'under',
  'above',
  'below',
  'between',
  'through',
  'against',
  'within',
  'without',
  'some',
  'many',
  'more',
  'most',
  'much',
  'such',
  'other',
  'another',
  'each',
  'every',
  'both',
  'either',
  'neither',
  'all',
  'any',
  'some',
  'no',
  'not',
  'and',
  'but',
  'for',
  'are',
  'the',
  'you',
  'can',
  'has',
  'had',
  'does',
  'did',
  'was',
  'is',
  'be',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'it',
  'or',
  'if',
  'as',
]);
