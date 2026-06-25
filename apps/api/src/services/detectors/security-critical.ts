import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore, containsKeyword } from './types.js';

const KEYWORDS = [
  'crypto',
  'hash',
  'sign',
  'verify',
  'encrypt',
  'decrypt',
  'consensus',
  'validate',
  'proof',
  'circuit',
  'zk',
  'halo2',
  'elliptic',
  'secp256k1',
  'ed25519',
  'bls',
  'schnorr',
  'merkle',
  'commitment',
  'scalar',
  'curve',
];

export const securityCriticalDetector: SignalDetector = {
  type: 'security_critical_patch',
  label: 'Security-Critical Code Change',
  description: 'Changes to cryptographic, consensus, or validation code',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, KEYWORDS, {
      message: 12,
      size: 0.03,
    });

    const evidenceMatch = KEYWORDS.filter((k) => containsKeyword(result.evidence, k));

    if (matchedCommits.length === 0 && evidenceMatch.length === 0) return null;

    let finalScore = score;
    if (evidenceMatch.length > 0) finalScore = Math.min(100, finalScore + 20);
    if (result.confidence >= 60) finalScore = Math.min(100, finalScore + 10);

    if (finalScore < 25) return null;

    const confidence = Math.min(
      100,
      Math.round(
        ((matchedKeywords.length + evidenceMatch.length) / KEYWORDS.length) * 70 +
          (matchedCommits.length > 0 ? 20 : 0),
      ),
    );

    return {
      type: 'security_critical_patch',
      score: finalScore,
      confidence,
      label: `Security-critical change: ${[...new Set([...matchedKeywords, ...evidenceMatch])].slice(0, 4).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords: [...new Set([...matchedKeywords, ...evidenceMatch])],
        totalChanges: matchedCommits.reduce((s, c) => s + c.total, 0),
      },
    };
  },
};
