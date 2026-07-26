// ─────────────────────────────────────────────────────────────
// Security advisory detector — flags repos that have published a
// GitHub Security Advisory (GHSA).
//
// Advisories are the canonical "a real vulnerability was disclosed
// and fixed" event — among the strongest commit-adjacent short
// signals we can observe, and far higher signal than keyword-matching
// commit messages. Scored by severity + CVSS + CVE presence.
//
// A recency window (published within the last 7 days) provides
// natural decay: an advisory stops being a fresh signal a week after
// disclosure, which is roughly when the market has fully priced it.
// Threshold: score ≥ 50 → signal.
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { fetchSecurityAdvisories, parseRepo } from '../github.js';
import type { GitHubSecurityAdvisory } from '../github.js';
import type { SignalClassification } from '@lenitnes/types';

/** Score threshold at which an advisory fires a signal. */
export const ADVISORY_SIGNAL_THRESHOLD = 50;
/** Advisories older than this are no longer fresh signals. */
export const ADVISORY_RECENCY_DAYS = 7;

export interface AdvisoryReading {
  monitorId: string;
  url: string;
  repo: string;
  asset: string | null;
  ghsaId: string;
  cveId: string | null;
  summary: string;
  severity: string;
  cvssScore: number | null;
  publishedAt: string;
  score: number;
  confidence: number;
  reasons: string[];
  /** True when score ≥ ADVISORY_SIGNAL_THRESHOLD. */
  triggered: boolean;
}

function scoreAdvisory(a: GitHubSecurityAdvisory): {
  score: number;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  let confidence = 40;

  const severity = a.severity.toLowerCase();
  if (severity === 'critical') {
    score += 60;
    reasons.push('critical severity');
    confidence += 40;
  } else if (severity === 'high') {
    score += 45;
    reasons.push('high severity');
    confidence += 30;
  } else if (severity === 'medium') {
    score += 25;
    reasons.push('medium severity');
    confidence += 15;
  } else if (severity === 'low') {
    score += 10;
    reasons.push('low severity');
    confidence += 5;
  }

  if (a.cvssScore != null) {
    if (a.cvssScore >= 9) {
      score += 20;
      reasons.push(`CVSS ${a.cvssScore.toFixed(1)}`);
      confidence += 10;
    } else if (a.cvssScore >= 7) {
      score += 10;
      reasons.push(`CVSS ${a.cvssScore.toFixed(1)}`);
      confidence += 5;
    }
  }

  if (a.cveId) {
    score += 15;
    reasons.push(`CVE ${a.cveId}`);
    confidence += 10;
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
 * Scan every active GitHub monitor's published security advisories
 * (published within the recency window) and score them all, including
 * sub-threshold / near-miss, so the intelligence dashboard can surface
 * them alongside velocity + PR signals.
 */
export async function scanSecurityAdvisories(): Promise<AdvisoryReading[]> {
  const { rows: monitors } = await query<{ id: string; url: string; asset: string | null }>(
    `SELECT id, url, asset_mapping->>'coingeckoId' AS asset
       FROM monitors
      WHERE status = 'active'
        AND url LIKE 'https://github.com/%'
        AND url NOT LIKE 'narrative:%'
        AND url NOT LIKE 'synthesis:%'
        AND url NOT LIKE 'proactive:%'`,
  );

  const readings: AdvisoryReading[] = [];

  for (const m of monitors) {
    try {
      const advisories = await fetchSecurityAdvisories(m.url, 10);
      if (!advisories || advisories.length === 0) continue;

      const parsed = parseRepo(m.url);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : m.url;

      for (const a of advisories) {
        if (!isRecent(a.publishedAt, ADVISORY_RECENCY_DAYS)) continue;
        const { score, confidence, reasons } = scoreAdvisory(a);
        readings.push({
          monitorId: m.id,
          url: m.url,
          repo,
          asset: m.asset,
          ghsaId: a.ghsaId,
          cveId: a.cveId,
          summary: a.summary,
          severity: a.severity,
          cvssScore: a.cvssScore,
          publishedAt: a.publishedAt,
          score,
          confidence,
          reasons,
          triggered: score >= ADVISORY_SIGNAL_THRESHOLD,
        });
      }
    } catch (err) {
      logger.warn({ err, url: m.url }, 'security-advisory: scan failed for monitor');
    }
  }

  // Most severe first.
  readings.sort((a, b) => b.score - a.score);
  return readings;
}

/** Detect published security advisories (threshold-gated) for signal generation. */
export async function detectSecurityAdvisories(): Promise<
  Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }>
> {
  const readings = await scanSecurityAdvisories();
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
        type: 'security_advisory',
        score: r.score,
        confidence: r.confidence,
        label: `${r.repo}: ${r.severity} advisory ${r.ghsaId}${r.cveId ? ` (${r.cveId})` : ''}`,
        metadata: {
          ghsaId: r.ghsaId,
          cveId: r.cveId,
          summary: r.summary.slice(0, 280),
          severity: r.severity,
          cvssScore: r.cvssScore,
          publishedAt: r.publishedAt,
          reasons: r.reasons,
        },
      },
    });
  }

  return results;
}
