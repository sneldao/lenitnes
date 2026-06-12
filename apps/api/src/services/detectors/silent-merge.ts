import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';

export const silentMergeDetector: SignalDetector = {
  type: 'silent_merge',
  label: 'Silent Merge',
  description: 'Significant code merged without public review trail',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits } = input;
    if (commits.length === 0) return null;

    const mergeCommits = commits.filter(
      (c) =>
        c.message.toLowerCase().startsWith('merge') ||
        c.message.toLowerCase().includes('merge pull request') ||
        c.message.toLowerCase().includes('merge branch'),
    );

    if (mergeCommits.length === 0) return null;

    const largeMerges = mergeCommits.filter((c) => c.total > 300);
    const noPrReference = mergeCommits.filter(
      (c) => !/#\d+/.test(c.message) && !/pull\/\d+/.test(c.url),
    );

    if (largeMerges.length === 0 && noPrReference.length === 0) return null;

    let score = 0;
    if (largeMerges.length > 0) score += 35;
    if (noPrReference.length > 0) score += 30;
    if (mergeCommits.length > 2) score += 15;
    score = Math.min(100, score);

    if (score < 30) return null;

    const confidence = Math.min(
      100,
      Math.round(
        (noPrReference.length > 0 ? 40 : 0) +
          (largeMerges.length > 0 ? 35 : 0) +
          (mergeCommits.length > 1 ? 15 : 0),
      ),
    );

    return {
      type: 'silent_merge',
      score,
      confidence,
      label: `Silent merge: ${largeMerges.length} large, ${noPrReference.length} without PR ref`,
      metadata: {
        totalMerges: mergeCommits.length,
        largeMerges: largeMerges.length,
        noPrReference: noPrReference.length,
        totalChanges: mergeCommits.reduce((s, c) => s + c.total, 0),
      },
    };
  },
};
