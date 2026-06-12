import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore } from './types.js';

const KEYWORDS = [
  'ci',
  'cd',
  'pipeline',
  'workflow',
  'action',
  'build',
  'install',
  'postinstall',
  'preinstall',
  'script',
  'github-action',
  'jenkins',
  'circleci',
  'travis',
  'dockerfile',
  'makefile',
];

export const supplyChainRiskDetector: SignalDetector = {
  type: 'supply_chain_risk',
  label: 'Supply Chain Risk',
  description: 'New dependencies, CI/CD changes, or build system modifications',

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
    const hasInstallHook = allKeywords.some((k) => ['postinstall', 'preinstall'].includes(k));

    let finalScore = score;
    if (hasInstallHook) finalScore = Math.min(100, finalScore + 30);
    if (matchedCommits.length > 2) finalScore = Math.min(100, finalScore + 10);

    if (finalScore < 20) return null;

    const confidence = Math.min(
      100,
      Math.round(
        (allKeywords.length / KEYWORDS.length) * 60 +
          (hasInstallHook ? 25 : 0) +
          (matchedCommits.length > 1 ? 10 : 0),
      ),
    );

    return {
      type: 'supply_chain_risk',
      score: finalScore,
      confidence,
      label: `Supply chain: ${allKeywords.slice(0, 3).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords: allKeywords,
        hasInstallHook,
      },
    };
  },
};
