import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore } from './types.js';

const KEYWORDS = [
  'breaking',
  'migration',
  'upgrade',
  'version',
  'v2',
  'v3',
  'v4',
  'hardfork',
  'softfork',
  'fork',
  'deprecate',
  'deprecated',
  'remove',
  'major',
  'protocol',
  'consensus',
  'network upgrade',
];

export const protocolUpgradeDetector: SignalDetector = {
  type: 'protocol_upgrade',
  label: 'Protocol Upgrade',
  description: 'Breaking changes, version bumps, or migration scripts',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, KEYWORDS, {
      message: 10,
      size: 0.02,
    });

    const evidenceMatch = KEYWORDS.filter((k) => result.evidence.toLowerCase().includes(k));

    if (matchedCommits.length === 0 && evidenceMatch.length === 0) return null;

    const allKeywords = [...new Set([...matchedKeywords, ...evidenceMatch])];
    const hasBreaking = allKeywords.includes('breaking');
    const hasFork = allKeywords.some((k) => k.includes('fork'));
    const hasVersion = allKeywords.some((k) => /^v\d$/.test(k) || k === 'version');

    let finalScore = score;
    if (hasBreaking) finalScore = Math.min(100, finalScore + 25);
    if (hasFork) finalScore = Math.min(100, finalScore + 20);
    if (hasVersion) finalScore = Math.min(100, finalScore + 10);

    if (finalScore < 20) return null;

    const confidence = Math.min(
      100,
      Math.round(
        (allKeywords.length / KEYWORDS.length) * 60 + (hasBreaking ? 20 : 0) + (hasFork ? 15 : 0),
      ),
    );

    return {
      type: 'protocol_upgrade',
      score: finalScore,
      confidence,
      label: `Protocol upgrade: ${allKeywords.slice(0, 3).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords: allKeywords,
        hasBreaking,
        hasFork,
        hasVersion,
      },
    };
  },
};
