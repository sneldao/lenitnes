import type { SignalClassification, SignalType } from '@lenitnes/types';
import type { GitHubCommit } from '../github.js';

export type { GitHubCommit };

export interface DetectorInput {
  result: {
    conditionMet: boolean;
    confidence: number;
    evidence: string;
    summary: string;
  };
  commits: GitHubCommit[];
  monitorUrl: string;
  monitorCondition: string;
}

export interface SignalDetector {
  readonly type: SignalType;
  readonly label: string;
  readonly description: string;
  detect(input: DetectorInput): SignalClassification | null;
}

export function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k));
}

export function commitScore(
  commits: GitHubCommit[],
  keywords: string[],
  weight: { message?: number; size?: number },
): { matchedCommits: GitHubCommit[]; matchedKeywords: string[]; score: number } {
  const msgWeight = weight.message ?? 1;
  const sizeWeight = weight.size ?? 0;
  const allMatchedKeywords = new Set<string>();
  const matched: GitHubCommit[] = [];

  for (const c of commits) {
    const hits = matchKeywords(c.message, keywords);
    if (hits.length > 0) {
      matched.push(c);
      hits.forEach((h) => allMatchedKeywords.add(h));
    }
  }

  const msgScore = matched.length * msgWeight;
  const sizeScore = matched.reduce((sum, c) => sum + c.total, 0) * sizeWeight;
  const score = Math.min(100, Math.round(msgScore + sizeScore));

  return {
    matchedCommits: matched,
    matchedKeywords: [...allMatchedKeywords],
    score,
  };
}
