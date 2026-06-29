import type { SignalClassification } from '@lenitnes/types';
import type { DetectorInput, SignalDetector } from './types.js';
import { containsKeyword } from './types.js';

const POSITIVE_KEYWORDS = [
  'bullish',
  'breakthrough',
  'partnership',
  'adoption',
  'upgrade',
  'launch',
  'approval',
  'positive',
  'surge',
  'growth',
  'institutional',
  'all-time high',
  'record',
  'integration',
  'mainnet',
];

const NEGATIVE_KEYWORDS = [
  'hack',
  'exploit',
  'vulnerability',
  'breach',
  'fraud',
  'scam',
  'crash',
  'dump',
  'liquidation',
  'bankruptcy',
  'regulatory',
  'ban',
  'crackdown',
  'sanction',
  'investigation',
  'withdrawal halt',
  'depeg',
  'insolvent',
  'freeze',
];

const PROTOCOL_KEYWORDS = [
  'upgrade',
  'fork',
  'proposal',
  'governance',
  'v2',
  'v3',
  'migration',
  'deprecation',
  'roadmap',
  'EIP',
];

export const newsSignalDetector: SignalDetector = {
  type: 'news_signal',
  label: 'News Signal',
  description:
    'Signals from SoSoValue news feeds — sentiment, protocol changes, market-moving events',

  detect(input: DetectorInput): SignalClassification | null {
    const newsItems = input.news;
    if (!newsItems || newsItems.length === 0) return null;

    let positiveScore = 0;
    let negativeScore = 0;
    let protocolScore = 0;
    let totalItems = 0;

    for (const item of newsItems) {
      const text = `${item.title} ${item.content}`.toLowerCase();
      const tagsText = (item.tags ?? []).join(' ').toLowerCase();

      const hasPositive = POSITIVE_KEYWORDS.some(
        (k) => containsKeyword(text, k) || containsKeyword(tagsText, k),
      );
      const hasNegative = NEGATIVE_KEYWORDS.some(
        (k) => containsKeyword(text, k) || containsKeyword(tagsText, k),
      );
      const hasProtocol = PROTOCOL_KEYWORDS.some(
        (k) => containsKeyword(text, k) || containsKeyword(tagsText, k),
      );

      if (hasPositive) positiveScore += 1;
      if (hasNegative) negativeScore += 2; // negative news weighted double
      if (hasProtocol) protocolScore += 1;
      totalItems += 1;
    }

    if (totalItems === 0) return null;

    // Dominant sentiment determines classification
    const netSentiment = positiveScore - negativeScore;
    const hasProtocolActivity = protocolScore > 0;

    // Threshold: at least 2 matching articles or one strong negative
    const totalSignal = positiveScore + negativeScore;
    if (totalSignal < 1) return null;
    if (totalSignal < 2 && negativeScore === 0) return null;

    // Compute a confidence score from the news volume + signal strength
    const rawConfidence = Math.min(
      100,
      Math.round(
        (Math.abs(netSentiment) / Math.max(totalItems, 1)) * 60 +
          (totalItems / 10) * 20 +
          (hasProtocolActivity ? 20 : 0),
      ),
    );
    const confidence = Math.max(10, rawConfidence);

    // Score is absolute signal strength (0-100)
    const score = Math.min(100, Math.round((totalSignal / 5) * 100));

    let label: string;
    if (netSentiment > 0 && hasProtocolActivity) {
      label = `Bullish protocol activity: ${positiveScore} positive signals`;
    } else if (netSentiment > 0) {
      label = `Positive sentiment: ${positiveScore} bullish articles`;
    } else if (netSentiment < 0) {
      label = `Negative sentiment: ${negativeScore} bearish signals`;
    } else if (hasProtocolActivity) {
      label = `Protocol activity: ${protocolScore} upgrade/governance mentions`;
    } else {
      label = `Mixed signal: ${totalItems} relevant news articles`;
    }

    return {
      type: 'news_signal',
      score,
      confidence,
      label,
      metadata: {
        totalItems,
        positiveScore,
        negativeScore,
        protocolScore,
        netSentiment,
        newsTitles: newsItems.map((n) => n.title).slice(0, 5),
      },
    };
  },
};
