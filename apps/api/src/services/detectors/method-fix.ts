import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore, containsKeyword } from './types.js';

// ── method_fix — LENITNES[science] ─────────────────────────────────
// A commit that fixes, corrects, or revises a statistical method,
// analysis pipeline, or numerical procedure in scientific software.
// These are the quiet patches that historically precede retractions
// and corrections of published results (the 3dClustSim/AFNI pattern).
// Keywords avoid bare "fix" (dominant false-positive driver per
// emergency-patch.ts) in favor of method-scoped phrases.
const KEYWORDS = [
  'fix statistic',
  'correct statistic',
  'correct the p-value',
  'p-value',
  'pvalue',
  'false positive',
  'cluster size',
  'threshold correction',
  'edge effect',
  'fix bug in analysis',
  'correct bug in analysis',
  'recompute',
  'recalculate',
  'numerical error',
  'calculation error',
  'off-by-one',
  'fix estimator',
  'correct estimator',
  'fix variance',
  'correct variance',
  'multiple comparisons',
  'multiple testing',
  'bonferroni',
  'fwhm',
  'smoothness',
  'randomize',
  'permutation test',
];

// Paths that make a numeric/method fix validity-relevant rather than
// cosmetic. A p-value fix in a plotting helper is noise; the same fix
// in a statistical kernel is a signal.
const METHOD_PATHS = [
  'stat',
  'analysis',
  'analyze',
  'cluster',
  'infer',
  'model',
  'estimat',
  'regress',
  'variance',
  'significance',
  'test',
  'pipeline',
  'workflow',
  'simulat',
  'fit',
  'sample',
];

export const methodFixDetector: SignalDetector = {
  type: 'method_fix',
  label: 'Method Fix',
  description:
    'Commit correcting a statistical method or numerical procedure — a known precursor to retractions/corrections of published results',
  domains: ['science'],

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, KEYWORDS, {
      message: 40,
      size: 0.04,
    });

    if (matchedCommits.length === 0) return null;

    const touchesMethodPath = METHOD_PATHS.some(
      (p) =>
        (!!result.evidence && containsKeyword(result.evidence, p)) ||
        matchedCommits.some((c) => containsKeyword(c.message, p)),
    );
    const largeChange = matchedCommits.some((c) => c.total > 150);

    let finalScore = score;
    if (touchesMethodPath) finalScore = Math.min(100, finalScore + 20);
    if (largeChange) finalScore = Math.min(100, finalScore + 10);

    // A single hit on a specific method keyword ("edge effect",
    // "false positive", "p-value"…) is already signal-worthy — the
    // keyword list is narrow enough that bare matches are rare. The
    // agent (rubric v6) is the real gatekeeper above the threshold.
    if (finalScore < 30) finalScore = 30;

    const confidence = Math.min(
      100,
      35 + matchedKeywords.length * 15 + (touchesMethodPath ? 20 : 0) + (largeChange ? 10 : 0),
    );

    return {
      type: 'method_fix',
      score: finalScore,
      confidence,
      label: `Method fix: ${matchedKeywords.slice(0, 3).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords,
        touchesMethodPath,
        largeChange,
        totalChanges: matchedCommits.reduce((s, c) => s + c.total, 0),
      },
    };
  },
};
