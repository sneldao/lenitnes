import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore } from './types.js';

const KEYWORDS = [
  'governance',
  'vote',
  'quorum',
  'timelock',
  'proposal',
  'threshold',
  'delegate',
  'voting',
  'dao',
  'multisig',
  'admin',
  'owner',
  'upgrade',
  'proxy',
  'governor',
];

export const governanceShiftDetector: SignalDetector = {
  type: 'governance_shift',
  label: 'Governance Shift',
  description: 'Changes to voting, quorum, timelock, or administrative parameters',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, KEYWORDS, {
      message: 12,
      size: 0.02,
    });

    const evidenceMatch = KEYWORDS.filter((k) => result.evidence.toLowerCase().includes(k));

    if (matchedCommits.length === 0 && evidenceMatch.length === 0) return null;

    let finalScore = score;
    if (evidenceMatch.length > 0) finalScore = Math.min(100, finalScore + 15);

    if (finalScore < 10) return null;

    const confidence = Math.min(
      100,
      Math.round(
        ((matchedKeywords.length + evidenceMatch.length) / KEYWORDS.length) * 70 +
          (matchedCommits.length > 0 ? 15 : 0),
      ),
    );

    return {
      type: 'governance_shift',
      score: finalScore,
      confidence,
      label: `Governance change: ${[...new Set([...matchedKeywords, ...evidenceMatch])].slice(0, 3).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords: [...new Set([...matchedKeywords, ...evidenceMatch])],
      },
    };
  },
};
