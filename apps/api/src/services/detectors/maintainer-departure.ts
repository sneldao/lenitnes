import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { matchKeywords } from './types.js';

const MAINTAINER_KEYWORDS = [
  'codeowner',
  'maintainer',
  'contributor',
  'team',
  'resign',
  'step down',
  'depart',
  'remove',
  'emeritus',
];

export const maintainerDepartureDetector: SignalDetector = {
  type: 'maintainer_departure',
  label: 'Maintainer Departure',
  description: 'Sudden drop in commit frequency from key contributors or maintainer roster changes',

  detect(input: DetectorInput): SignalClassification | null {
    const { commits, result } = input;
    if (commits.length === 0) return null;

    const authorCounts = new Map<string, number>();
    for (const c of commits) {
      authorCounts.set(c.author, (authorCounts.get(c.author) ?? 0) + 1);
    }

    const maintainerMentions = matchKeywords(
      commits.map((c) => c.message).join(' '),
      MAINTAINER_KEYWORDS,
    );

    const evidenceMatch = MAINTAINER_KEYWORDS.filter((k) =>
      result.evidence.toLowerCase().includes(k),
    );

    const hasRosterChange = maintainerMentions.length > 0 || evidenceMatch.length > 0;
    const uniqueAuthors = authorCounts.size;
    const dominantAuthor = uniqueAuthors === 1 && commits.length > 3;

    if (!hasRosterChange && !dominantAuthor) return null;

    let score = 0;
    if (hasRosterChange) score += 30;
    if (dominantAuthor) score += 25;
    if (uniqueAuthors <= 2 && commits.length > 5) score += 15;
    score = Math.min(100, score);

    if (score < 25) return null;

    const confidence = Math.min(
      100,
      Math.round(
        ((maintainerMentions.length + evidenceMatch.length) / MAINTAINER_KEYWORDS.length) * 50 +
          (dominantAuthor ? 30 : 0),
      ),
    );

    return {
      type: 'maintainer_departure',
      score,
      confidence,
      label: hasRosterChange
        ? `Maintainer change: ${[...new Set([...maintainerMentions, ...evidenceMatch])].join(', ')}`
        : `Single-author dominance: ${commits[0].author}`,
      metadata: {
        uniqueAuthors,
        dominantAuthor,
        authorCounts: Object.fromEntries(authorCounts),
        rosterKeywords: [...new Set([...maintainerMentions, ...evidenceMatch])],
      },
    };
  },
};
