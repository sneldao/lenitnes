// ─────────────────────────────────────────────────────────────
// Protocol release detector — flags repos that published a tagged
// release carrying security / breaking / consensus-change language.
//
// A tagged release is the moment a commit-driven thesis becomes
// shipped software. "v2.1.0 — emergency consensus hotfix" is a far
// stronger event than the underlying merge commit alone, and it is
// independently verifiable (the tag exists, the notes are public).
//
// Recency window (published within the last 7 days) gives the signal
// a natural shelf life. Threshold: score ≥ 55 → signal (a plain
// "bugfixes" release should not fire; it needs a security or
// breaking hook).
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { fetchReleases, parseRepo } from '../github.js';
import type { GitHubRelease } from '../github.js';
import type { SignalClassification } from '@lenitnes/types';
import { containsKeyword } from './types.js';

/** Score threshold at which a release fires a signal. */
export const RELEASE_SIGNAL_THRESHOLD = 55;
/** Releases older than this are no longer fresh signals. */
export const RELEASE_RECENCY_DAYS = 7;

const SECURITY_KEYWORDS = [
  'security',
  'vulnerability',
  'cve',
  'exploit',
  'critical',
  'emergency',
  'soundness',
  'hotfix',
];

const BREAKING_KEYWORDS = [
  'breaking',
  'hard fork',
  'hardfork',
  'soft fork',
  'softfork',
  'consensus',
  'protocol change',
  'migration',
  'deprecate',
];

export interface ReleaseReading {
  monitorId: string;
  url: string;
  repo: string;
  asset: string | null;
  tagName: string;
  name: string;
  author: string;
  releaseUrl: string;
  prerelease: boolean;
  publishedAt: string;
  score: number;
  confidence: number;
  reasons: string[];
  /** True when score ≥ RELEASE_SIGNAL_THRESHOLD. */
  triggered: boolean;
}

function scoreRelease(r: GitHubRelease): {
  score: number;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  // Any published, tagged release is at least mildly interesting —
  // it means the commit thesis shipped. The hooks below decide
  // whether it crosses the tradeable bar.
  let score = 10;
  let confidence = 30;

  const text = `${r.name}\n${r.body}`.toLowerCase();

  const securityHits = SECURITY_KEYWORDS.filter((k) => containsKeyword(text, k));
  if (securityHits.length > 0) {
    score += 50;
    reasons.push(`security language: ${securityHits.slice(0, 3).join(', ')}`);
    confidence += 35;
  }

  const breakingHits = BREAKING_KEYWORDS.filter((k) => containsKeyword(text, k));
  if (breakingHits.length > 0) {
    score += 30;
    reasons.push(`breaking/consensus language: ${breakingHits.slice(0, 3).join(', ')}`);
    confidence += 20;
  }

  // An explicit CVE reference in the notes is a strong corroborator.
  if (/\bcve-\d{4}-\d{3,7}\b/i.test(text)) {
    score += 20;
    reasons.push('references a CVE id');
    confidence += 10;
  }

  // Pre-releases (release candidates) are less authoritative than a
  // stable tag — discount both score and confidence.
  if (r.prerelease) {
    score = Math.round(score * 0.6);
    confidence = Math.max(20, confidence - 10);
    reasons.push('pre-release (discounted)');
  }

  return {
    score: Math.min(100, score),
    confidence: Math.min(100, confidence),
    reasons,
  };
}

function isRecent(iso: string, days: number): boolean {
  if (!iso) return false;
  const ageMs = Date.now() - new Date(iso).getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 3_600_000;
}

/**
 * Scan every active GitHub monitor's recent published releases and
 * score them all (including sub-threshold / near-miss) so the
 * intelligence dashboard can surface them alongside the other
 * proactive signals.
 */
export async function scanReleases(): Promise<ReleaseReading[]> {
  const { rows: monitors } = await query<{ id: string; url: string; asset: string | null }>(
    `SELECT id, url, asset_mapping->>'coingeckoId' AS asset
       FROM monitors
      WHERE status = 'active'
        AND url LIKE 'https://github.com/%'
        AND url NOT LIKE 'narrative:%'
        AND url NOT LIKE 'synthesis:%'
        AND url NOT LIKE 'proactive:%'`,
  );

  const readings: ReleaseReading[] = [];

  for (const m of monitors) {
    try {
      const releases = await fetchReleases(m.url, 10);
      if (!releases || releases.length === 0) continue;

      const parsed = parseRepo(m.url);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : m.url;

      for (const r of releases) {
        if (r.draft) continue;
        if (!isRecent(r.publishedAt, RELEASE_RECENCY_DAYS)) continue;
        const { score, confidence, reasons } = scoreRelease(r);
        readings.push({
          monitorId: m.id,
          url: m.url,
          repo,
          asset: m.asset,
          tagName: r.tagName,
          name: r.name || r.tagName,
          author: r.author,
          releaseUrl: r.url,
          prerelease: r.prerelease,
          publishedAt: r.publishedAt,
          score,
          confidence,
          reasons,
          triggered: score >= RELEASE_SIGNAL_THRESHOLD,
        });
      }
    } catch (err) {
      logger.warn({ err, url: m.url }, 'protocol-release: scan failed for monitor');
    }
  }

  // Highest impact first.
  readings.sort((a, b) => b.score - a.score);
  return readings;
}

/** Detect high-impact published releases (threshold-gated) for signal generation. */
export async function detectProtocolReleases(): Promise<
  Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }>
> {
  const readings = await scanReleases();
  const results: Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }> = [];

  for (const r of readings) {
    if (!r.triggered) continue;
    results.push({
      monitorId: r.monitorId,
      url: r.url,
      asset: r.asset,
      classification: {
        type: 'protocol_release',
        score: r.score,
        confidence: r.confidence,
        label: `${r.repo}@${r.tagName}: ${r.name.slice(0, 50)}`,
        metadata: {
          tagName: r.tagName,
          name: r.name.slice(0, 120),
          releaseUrl: r.releaseUrl,
          author: r.author,
          prerelease: r.prerelease,
          publishedAt: r.publishedAt,
          reasons: r.reasons,
        },
      },
    });
  }

  return results;
}
