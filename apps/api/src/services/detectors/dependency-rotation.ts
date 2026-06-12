import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { commitScore } from './types.js';

const KEYWORDS = [
  'bump',
  'upgrade',
  'update',
  'dependency',
  'version',
  'deps',
  'lockfile',
  'package-lock',
  'yarn.lock',
  'go.sum',
  'cargo.lock',
  'gemfile',
];

const MANIFEST_FILES = [
  'package.json',
  'cargo.toml',
  'go.mod',
  'gemfile',
  'requirements.txt',
  'pyproject.toml',
  'composer.json',
];

export const dependencyRotationDetector: SignalDetector = {
  type: 'dependency_rotation',
  label: 'Dependency Rotation',
  description: 'Critical dependency version changes or supply chain modifications',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const { matchedCommits, matchedKeywords, score } = commitScore(commits, KEYWORDS, {
      message: 10,
      size: 0.02,
    });

    const hasManifestMention =
      result.evidence && MANIFEST_FILES.some((f) => result.evidence.toLowerCase().includes(f));

    if (matchedCommits.length === 0 && !hasManifestMention) return null;

    let finalScore = score;
    if (hasManifestMention) finalScore = Math.min(100, finalScore + 15);
    if (matchedCommits.length > 2) finalScore = Math.min(100, finalScore + 10);

    if (finalScore < 20) return null;

    const confidence = Math.min(
      100,
      Math.round((matchedKeywords.length / KEYWORDS.length) * 60 + (hasManifestMention ? 25 : 0)),
    );

    return {
      type: 'dependency_rotation',
      score: finalScore,
      confidence,
      label: `Dependency change: ${matchedKeywords.slice(0, 3).join(', ')}`,
      metadata: {
        matchedCommits: matchedCommits.length,
        matchedKeywords,
        hasManifestMention: !!hasManifestMention,
      },
    };
  },
};
