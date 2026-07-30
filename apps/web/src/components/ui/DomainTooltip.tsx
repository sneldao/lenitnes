'use client';

import type { ReactNode } from 'react';
import { Tooltip } from './tooltip';

const DICTIONARY: Record<string, { label: string; detail: string }> = {
  'rubric-v4': {
    label: 'LLM Rubric v4',
    detail:
      'Versioned evaluation rubric requiring commit SHA citations, hard-capping news-only signals, and scoring conviction from 0–100.',
  },
  'paper-first': {
    label: 'Paper First Strategy',
    detail:
      'Default trading mode where trades execute synthetically on paper until calibration proves n ≥ 30 closed positions with positive yield.',
  },
  propr: {
    label: 'Propr Perp Venue',
    detail:
      'Perpetuals execution venue routing short positions & L1 assets with clamped leverage and mandatory SL/TP.',
  },
  hcs: {
    label: 'Hedera HCS Notarization',
    detail:
      'Hedera Consensus Service providing microsecond tamper-evident consensus timestamps for every published signal.',
  },
  chainparams: {
    label: 'Consensus Chainparams',
    detail:
      'Code paths defining network params, block size limits, signature validation, or hard-fork heights.',
  },
  'replay-tier': {
    label: 'Historical Replay Tier',
    detail:
      'A/B/C tiering based on a 90-day backtest sweep evaluating commit signal co-movement with asset market price.',
  },
  'liquidity-floor': {
    label: 'Liquidity Floor Gate',
    detail: 'Safety check requiring minimum $5M pool TVL before live DEX swaps execute.',
  },
  'sector-graph': {
    label: 'Sector Causal Graph',
    detail:
      'Upstream dependency relationship graph tracking related repos (e.g. halo2 → zebra → zcash) within a 7-day window.',
  },
};

export function DomainTooltip({
  term,
  children,
  className,
}: {
  term: keyof typeof DICTIONARY | string;
  children?: ReactNode;
  className?: string;
}) {
  const item = DICTIONARY[term];
  if (!item) return <>{children}</>;

  return (
    <Tooltip label={item.detail} wide className={className}>
      {children || item.label}
    </Tooltip>
  );
}
