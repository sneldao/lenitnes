import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore } from './types.js';

const KEYWORDS = [
  'fix',
  'patch',
  'critical',
  'vulnerability',
  'cve',
  'security',
  'urgent',
  'hotfix',
  'emergency',
  'exploit',
  'disclosure',
  'zero-day',
  'advisory',
];

const SECURITY_PATHS = [
  'crypto',
  'consensus',
  'validation',
  'verify',
  'sign',
  'auth',
  'cipher',
  'encrypt',
  'hash',
  'proof',
  'circuit',
];

export const emergencyPatchDetector: SignalDetector = {
  type: 'emergency_patch',
  label: 'Emergency Patch',
  description: 'Large, urgent commit to security-critical paths with no preceding discussion',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, KEYWORDS, {
      message: 15,
      size: 0.05,
    });

    if (matchedCommits.length === 0) return null;

    const hasLargeDiff = matchedCommits.some((c) => c.total > 200);
    const hasSecurityPath =
      result.evidence && SECURITY_PATHS.some((p) => result.evidence.toLowerCase().includes(p));
    const highConfidence = result.confidence >= 70;

    let finalScore = score;
    if (hasLargeDiff) finalScore = Math.min(100, finalScore + 20);
    if (hasSecurityPath) finalScore = Math.min(100, finalScore + 15);
    if (highConfidence) finalScore = Math.min(100, finalScore + 10);

    if (finalScore < 30) return null;

    const confidence = Math.min(
      100,
      Math.round((matchedKeywords.length / KEYWORDS.length) * 80 + (hasLargeDiff ? 20 : 0)),
    );

    return {
      type: 'emergency_patch',
      score: finalScore,
      confidence,
      label: `Emergency patch: ${matchedKeywords.slice(0, 3).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords,
        hasLargeDiff,
        hasSecurityPath,
        totalChanges: matchedCommits.reduce((s, c) => s + c.total, 0),
      },
    };
  },
};
