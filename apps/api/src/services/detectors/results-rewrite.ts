import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore, containsKeyword } from './types.js';

// ── results_rewrite — LENITNES[science] ─────────────────────────────
// A commit that silently rewrites outputs, figures, tables, or data
// underlying published results — without an accompanying issue, PR
// discussion, or changelog entry explaining the change. Silent
// rewrites of results-bearing artifacts are the strongest single
// integrity red flag in a scientific software repo.
const REWRITE_KEYWORDS = [
  'update results',
  'update figure',
  'update table',
  'regenerate',
  're-run',
  'rerun',
  'regenerate figure',
  'regenerate results',
  'replace figure',
  'replace table',
  'update data',
  'correct figure',
  'correct table',
  'correct results',
  'revise results',
  'revise figure',
];

// Result-bearing artifacts. A change touching these paths is far more
// validity-relevant than one touching docs/ or tests/.
const RESULTS_PATHS = [
  'result',
  'figure',
  'fig',
  'table',
  'plot',
  'output',
  'data',
  'csv',
  'tsv',
  'xlsx',
  'summary',
  'analysis',
];

export const resultsRewriteDetector: SignalDetector = {
  type: 'results_rewrite',
  label: 'Results Rewrite',
  description:
    'Silent rewrite of results-bearing artifacts (figures, tables, data) with no public discussion trail',
  domains: ['science'],

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, REWRITE_KEYWORDS, {
      message: 20,
      size: 0.03,
    });

    if (matchedCommits.length === 0) return null;

    // Silence signals: no issue/PR reference in the commit and no
    // discussion trail recorded in the evidence.
    const noReference = matchedCommits.filter(
      (c) => !/#\d+/.test(c.message) && !/pull\/\d+/.test(c.url),
    );
    const touchesResultsPath =
      !!result.evidence && RESULTS_PATHS.some((p) => containsKeyword(result.evidence, p));

    let finalScore = score;
    if (noReference.length > 0) finalScore = Math.min(100, finalScore + 25);
    if (touchesResultsPath) finalScore = Math.min(100, finalScore + 15);

    if (finalScore < 30) return null;

    const confidence = Math.min(
      100,
      Math.round((matchedKeywords.length / Math.min(3, REWRITE_KEYWORDS.length)) * 50) +
        (noReference.length > 0 ? 30 : 0) +
        (touchesResultsPath ? 20 : 0),
    );

    return {
      type: 'results_rewrite',
      score: finalScore,
      confidence,
      label: `Results rewrite: ${noReference.length} silent, ${matchedKeywords
        .slice(0, 2)
        .join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords,
        noReference: noReference.length,
        touchesResultsPath,
        totalChanges: matchedCommits.reduce((s, c) => s + c.total, 0),
      },
    };
  },
};
