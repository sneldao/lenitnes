// ─────────────────────────────────────────────────────────────
// PR activity detector — scores open pull requests for impact.
//
// A PR titled "BREAKING: change consensus rules" with 50 comments
// is more significant than the merge commit alone. This detector
// monitors open PRs and flags high-impact ones before they merge.
//
// Impact score = f(title keywords, comment count, size, review activity).
// Threshold: score ≥ 60 → signal.
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { logger } from '../../logger.js';
import { fetchOpenPullRequests, parseRepo } from '../github.js';
import type { GitHubPullRequest } from '../github.js';
import type { SignalClassification } from '@lenitnes/types';
import { containsKeyword } from './types.js';

// High-impact keywords (weighted).
const BREAKING_KEYWORDS = [
  'breaking',
  'consensus',
  'protocol change',
  'hard fork',
  'soft fork',
  'security',
  'vulnerability',
  'exploit',
  'cve',
  'emergency',
  'critical',
];

const GOVERNANCE_KEYWORDS = [
  'governance',
  'vote',
  'proposal',
  'rfc',
  'bip',
  'eip',
  'zip',
  'upgrade',
  'migration',
];

const IMPACT_KEYWORDS = [
  'refactor',
  'rewrite',
  'deprecate',
  'remove',
  'add',
  'implement',
  'fix',
  'patch',
  'update',
];

interface PRScore {
  monitorId: string;
  url: string;
  asset: string | null;
  pr: GitHubPullRequest;
  score: number;
  confidence: number;
  reasons: string[];
}

function scorePullRequest(pr: GitHubPullRequest): {
  score: number;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  let confidence = 30; // Base confidence for any open PR.

  const titleLower = pr.title.toLowerCase();

  // Breaking/consensus keywords: +40 each (max 2).
  const breakingHits = BREAKING_KEYWORDS.filter((k) => containsKeyword(titleLower, k));
  if (breakingHits.length > 0) {
    score += Math.min(80, breakingHits.length * 40);
    reasons.push(`breaking keywords: ${breakingHits.join(', ')}`);
    confidence += 30;
  }

  // Governance keywords: +20 each (max 2).
  const govHits = GOVERNANCE_KEYWORDS.filter((k) => containsKeyword(titleLower, k));
  if (govHits.length > 0) {
    score += Math.min(40, govHits.length * 20);
    reasons.push(`governance keywords: ${govHits.join(', ')}`);
    confidence += 15;
  }

  // Impact keywords: +5 each (max 3).
  const impactHits = IMPACT_KEYWORDS.filter((k) => containsKeyword(titleLower, k));
  if (impactHits.length > 0) {
    score += Math.min(15, impactHits.length * 5);
    reasons.push(`impact keywords: ${impactHits.join(', ')}`);
    confidence += 5;
  }

  // Comment count: +1 per 5 comments (max +20).
  const commentScore = Math.min(20, Math.floor(pr.comments / 5) * 5);
  if (commentScore > 0) {
    score += commentScore;
    reasons.push(`${pr.comments} comments`);
    confidence += Math.min(15, Math.floor(pr.comments / 10) * 5);
  }

  // Review comments: +1 per 3 (max +15).
  const reviewScore = Math.min(15, Math.floor(pr.reviewComments / 3) * 3);
  if (reviewScore > 0) {
    score += reviewScore;
    reasons.push(`${pr.reviewComments} review comments`);
    confidence += 10;
  }

  // Size: large PRs (>500 lines changed) are more impactful.
  const totalChanges = pr.additions + pr.deletions;
  if (totalChanges > 500) {
    score += 15;
    reasons.push(`large PR: ${totalChanges} lines changed`);
    confidence += 5;
  } else if (totalChanges > 200) {
    score += 8;
    reasons.push(`medium PR: ${totalChanges} lines changed`);
  }

  // Age: older open PRs (>7 days) with activity are significant.
  const ageDays = (Date.now() - new Date(pr.createdAt).getTime()) / (24 * 3_600_000);
  if (ageDays > 7 && pr.comments > 0) {
    score += 10;
    reasons.push(`open for ${Math.floor(ageDays)} days with discussion`);
    confidence += 5;
  }

  // Labels: security/breaking labels are high-signal.
  const labelHits = pr.labels.filter((l) =>
    ['security', 'breaking', 'critical', 'priority', 'consensus'].some((k) =>
      l.toLowerCase().includes(k),
    ),
  );
  if (labelHits.length > 0) {
    score += 25;
    reasons.push(`labels: ${labelHits.join(', ')}`);
    confidence += 20;
  }

  return {
    score: Math.min(100, score),
    confidence: Math.min(100, confidence),
    reasons,
  };
}

/** Detect high-impact open PRs across all active monitors. */
export async function detectHighImpactPRs(): Promise<
  Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }>
> {
  const { rows: monitors } = await query<{ id: string; url: string; asset: string | null }>(
    `SELECT id, url, asset_mapping->>'coingeckoId' AS asset
       FROM monitors
      WHERE status = 'active'
        AND url LIKE 'https://github.com/%'
        AND url NOT LIKE 'narrative:%'
        AND url NOT LIKE 'synthesis:%'`,
  );

  const results: Array<{
    monitorId: string;
    url: string;
    asset: string | null;
    classification: SignalClassification;
  }> = [];

  for (const m of monitors) {
    try {
      const prs = await fetchOpenPullRequests(m.url, 20);
      if (!prs || prs.length === 0) continue;

      // Score each PR, keep those above threshold.
      for (const pr of prs) {
        const { score, confidence, reasons } = scorePullRequest(pr);
        if (score < 60) continue; // Threshold.

        const repoSlug = parseRepo(m.url)
          ? `${parseRepo(m.url)!.owner}/${parseRepo(m.url)!.repo}`
          : m.url;

        results.push({
          monitorId: m.id,
          url: m.url,
          asset: m.asset,
          classification: {
            type: 'pr_activity',
            score,
            confidence,
            label: `${repoSlug}#${pr.number}: ${pr.title.slice(0, 60)}`,
            metadata: {
              prNumber: pr.number,
              prUrl: pr.url,
              author: pr.author,
              additions: pr.additions,
              deletions: pr.deletions,
              changedFiles: pr.changedFiles,
              comments: pr.comments,
              reviewComments: pr.reviewComments,
              labels: pr.labels,
              reasons,
            },
          },
        });
      }
    } catch (err) {
      logger.warn({ err, url: m.url }, 'pr-activity: check failed for monitor');
    }
  }

  return results;
}
