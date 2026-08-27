// Unified-timeline stage derivation — the machine-readable form of the
// state-copy taxonomy in lenitnes-consolidation-spec.md §4.
//
// One lifecycle for both oracles: Detect → Commit → Track → Score.
// Every feed item gets exactly one stage + one honest headline; "No thesis
// recorded" never appears — an absence always says *why* it's absent.
//
// Proof-state convention (see apps/api proofCoverageQuery):
//   hcsMessageId starts with '0.0.'  → notarized
//   hcsMessageId is other text       → notarization FAILED (error JSON kept)
//   hcsMessageId is null             → notarization in flight

import type { ScorecardRecentCall } from './api';

export type Stage = 'detect' | 'commit' | 'track' | 'score' | 'failed';

export interface StageInfo {
  stage: Stage;
  /** Badge label, e.g. "Commit — pending". */
  badge: string;
  /** Headline copy — says what happened and what's next, never a shrug. */
  headline: string;
}

/** HCS success convention: a committed proof stores a 0.0.xxx account id. */
export function hcsCommitted(hcsMessageId: string | null): boolean {
  return hcsMessageId != null && hcsMessageId.startsWith('0.0.');
}

export function hcsFailed(hcsMessageId: string | null): boolean {
  return hcsMessageId != null && !hcsMessageId.startsWith('0.0.');
}

export function stageOf(call: ScorecardRecentCall): StageInfo {
  const noun = call.domain === 'science' ? 'alert' : 'thesis';
  const isScience = call.domain === 'science';

  // Score — the oracle has spoken.
  if (isScience && call.event?.matchStatus === 'confirmed') {
    return {
      stage: 'score',
      badge: 'Score — graded',
      headline: `Graded against the record · alert sustained${
        call.event.leadDays != null ? ` (+${Math.round(call.event.leadDays)}d lead)` : ''
      }`,
    };
  }
  if (isScience && call.event?.matchStatus === 'rejected') {
    return {
      stage: 'score',
      badge: 'Score — graded',
      headline: 'Graded against the record · alert overturned',
    };
  }
  if (!isScience && call.outcomes.t1d != null) {
    const hit = call.outcomes.t1d > 0;
    return {
      stage: 'score',
      badge: 'Score — graded',
      headline: `Graded against price · ${hit ? 'call confirmed' : 'call missed'} (${
        hit ? '+' : ''
      }${call.outcomes.t1d.toFixed(2)}% T+1d)`,
    };
  }

  // Commit — proof-chain failure is its own visible, honest state.
  if (hcsFailed(call.hcsMessageId)) {
    return {
      stage: 'failed',
      badge: 'Commit — failed',
      headline: `Notarization failed — ${noun} held for automatic retry`,
    };
  }

  // Track — committed on-chain, awaiting the oracle.
  if (hcsCommitted(call.hcsMessageId)) {
    if (isScience && call.event) {
      return {
        stage: 'track',
        badge: 'Track — adjudicating',
        headline: `Record moving (${call.event.kind}) — awaiting adjudication`,
      };
    }
    return {
      stage: 'track',
      badge: isScience ? 'Track — record open' : 'Track — window open',
      headline: isScience
        ? 'Alert committed · record not yet moved'
        : 'Thesis committed · verdict pending',
    };
  }

  // Commit — notarization in flight.
  if (call.thesis != null || call.conviction != null) {
    return {
      stage: 'commit',
      badge: 'Commit — pending',
      headline: `Notarizing ${noun} to Hedera HCS…`,
    };
  }

  // Detect — change spotted, nothing committed. An absence, with a reason.
  return {
    stage: 'detect',
    badge: isScience ? 'Detect — scanning' : 'Detect — watching',
    headline: isScience
      ? 'Change flagged — alert not yet committed'
      : 'Change detected — no call committed',
  };
}

export const STAGE_ORDER: Stage[] = ['detect', 'commit', 'failed', 'track', 'score'];

export const STAGE_COLORS: Record<Stage, { text: string; bg: string; dot: string }> = {
  detect: { text: 'text-slate-400', bg: 'bg-slate-400/10', dot: 'bg-slate-400' },
  commit: { text: 'text-violet', bg: 'bg-violet/10', dot: 'bg-violet' },
  failed: { text: 'text-danger', bg: 'bg-danger/10', dot: 'bg-danger' },
  track: { text: 'text-warn', bg: 'bg-warn/10', dot: 'bg-warn' },
  score: { text: 'text-signal', bg: 'bg-signal/10', dot: 'bg-signal' },
};
