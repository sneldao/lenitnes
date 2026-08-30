/**
 * OSS adoption — G2: agent scoring of adoption events.
 *
 * G2 hypothesis: raw dependency-count aggregation (Phase 0/1) treats every
 * change equally, so routine maintenance (Renovate bumps, security patches,
 * version pins) drowns out the few *strategic* adoption changes that might
 * predict a company's revenue trajectory. An agent that reads *why* a
 * dependency changed and scores its strategic importance should improve
 * selectivity over the raw curve.
 *
 * This module scores a single dependency event as a number in [0, 1]:
 *   0 = routine noise (the bulk of events) — weights a curve down
 *   1 = high-value strategic adoption — weights a curve up
 *
 * Two scorers are provided:
 *   - heuristicScoreEvent() — deterministic keyword/semantics classifier.
 *     Fast, free, reproducible. Baseline for the G2 test.
 *   - llmScoreEvent()       — sends the commit context to an OpenAI-compatible
 *     endpoint (same Qwen3.8 family the production agent uses) and parses a
 *     structured JSON score. Optional upgrade path; gated behind a flag so the
 *     test can run fully offline/deterministically.
 *
 * A `scoredCurveMultiplier` collapses the per-event score into a weekly
 * multiplier used by the weighted curve builder: 1 + K * (score - 0.5), so
 * neutral events (score≈0.5) keep their weight and high-value events get a
 * boost. The K is calibrated small to avoid blowing up a single week.
 */
import type { DependencyEvent } from './types.js';

export type ScoreSource = 'heuristic' | 'llm';

export interface EventScore {
  event: DependencyEvent;
  score: number; // 0..1
  source: ScoreSource;
  rationale: string;
}

// ── Heuristic classifier ─────────────────────────────────────────────────

/**
 * Strongly strategic phrases: a repo explicitly migrating, adopting, or
 * integrating a new vendor/service is the adoption signal we care about.
 */
const STRATEGIC_PATTERNS: Array<RegExp> = [
  /migrat/i,
  /\badopt/i,
  /switch(ed|ing)?\s+to/i,
  /\bmove[d]?\s+to/i,
  /integrat/i,
  /\bupgrade\s+(the\s+)?(sdk|client|library|aws|azure|google)/i,
  /new\s+(sdk|client|library|provider)/i,
  /\buse\s+[a-z-]+-sdk/i,
  /replace.*(aws|azure|google)/i,
  /vendor\s+(consolidation|lock-in|move)/i,
  /platform\s+migration/i,
  /deprecat.*\s+(sdk|client|library)/i,
];

/** Routine-maintenance phrases: version bumps, pins, security, tooling. */
const ROUTINE_PATTERNS: Array<RegExp> = [
  /\b(bump|pin|lock)\b/i,
  /\brenovate\b/i,
  /\bdependabot\b/i,
  /\bsecurity\b/i,
  /\bCVE/i,
  /chore[:\s]/i,
  /\brelease\s+(cut|prep)/i,
  /\bminor\s+(fix|patch|version)/i,
  /\brevert/i,
  /\brollback/i,
  /^\s*[a-f0-9]{7,40}\s*$/i, // bare sha
];

/** Trivial commit messages that carry no intent. */
const EMPTY_PATTERNS: Array<RegExp> = [/^\s*$/, /^update package.json$/i, /^package.json$/i];

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Heuristic score in [0,1]. Higher = more likely a strategic adoption change.
 * Looks at change type, version movement, and commit message signals.
 */
export function heuristicScoreEvent(event: DependencyEvent): EventScore {
  const msg = event.commitMessage ?? '';
  let score = 0.5; // neutral prior

  // Change-type prior: adding a dependency is more likely strategic than a
  // version bump; removing may be migration or cleanup (neutral-ish).
  if (event.change === 'added') score += 0.15;
  else if (event.change === 'removed') score += 0.05;
  else if (event.change === 'downgraded') score -= 0.1;
  else if (event.change === 'changed') score -= 0.05;

  // Version magnitude: a major jump is a bigger commitment than a patch.
  if (event.versionBefore && event.versionAfter) {
    const v = (s: string) => parseInt(s.match(/\d+/)?.[0] ?? '0', 10);
    const majorBefore = v(event.versionBefore);
    const majorAfter = v(event.versionAfter);
    if (majorAfter > majorBefore) score += 0.05;
    else if (majorAfter < majorBefore) score -= 0.05;
  }

  let rationale = 'neutral';
  if (!msg) {
    // No commit message — cannot judge. Keep neutral but note it.
    rationale = 'no commit message (neutral)';
  } else if (EMPTY_PATTERNS.some((p) => p.test(msg))) {
    rationale = 'empty/trivial message (neutral)';
  } else if (STRATEGIC_PATTERNS.some((p) => p.test(msg))) {
    score += 0.3;
    rationale = 'strategic adoption keywords';
  } else if (ROUTINE_PATTERNS.some((p) => p.test(msg))) {
    score -= 0.2;
    rationale = 'routine maintenance keywords';
  }

  // Absence of any strong signal → mild discount (most noise has no strategy).
  if (
    !STRATEGIC_PATTERNS.some((p) => p.test(msg)) &&
    !ROUTINE_PATTERNS.some((p) => p.test(msg)) &&
    msg
  ) {
    score -= 0.05;
    rationale = rationale === 'neutral' ? 'no strong signal (mild discount)' : rationale;
  }

  return { event, score: clamp(score), source: 'heuristic', rationale };
}

/**
 * Weight a weekly curve by the scores of its constituent events. Returns a
 * per-week multiplier around 1.0; neutral events (score≈0.5) keep weight 1.
 * A week where many high-value events landed gets a multiplier > 1.
 */
export function scoredCurveMultiplier(scores: EventScore[], strength = 0.8): number {
  if (scores.length === 0) return 1;
  const mean = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  return 1 + strength * (mean - 0.5);
}

/**
 * LLM scoring (optional, offline-disabled by default). Sends the commit
 * context to an OpenAI-compatible endpoint and asks for a 0..1 strategic
 * score with a one-line rationale. Returns null when the endpoint is
 * unavailable or the response is unparseable, so the pipeline can fall back
 * to the heuristic.
 */
export async function llmScoreEvent(
  event: DependencyEvent,
  options: { baseUrl: string; apiKey: string; model: string },
): Promise<EventScore | null> {
  const msg = event.commitMessage ?? '';
  const prompt = [
    'You score whether a dependency change in a public repository is STRATEGIC ADOPTION',
    '(a repo deliberately migrating to / adopting a vendor SDK — a signal about that',
    'vendor revenue) versus ROUTINE MAINTENANCE (a bot bump, security patch, or version pin',
    '— noise). Respond with ONLY a JSON object: {"score": 0.0-1.0, "rationale": "..."}.',
    '',
    `repository: ${event.repository}`,
    `package: ${event.packageName}`,
    `change: ${event.change}`,
    `version: ${event.versionBefore ?? '?'} → ${event.versionAfter ?? '?'}`,
    `commit message: ${msg.slice(0, 600)}`,
  ].join('\n');

  const res = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 80,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? '';
  const m = content.match(/\{[^}]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as { score?: number; rationale?: string };
    const score = typeof parsed.score === 'number' ? clamp(parsed.score) : 0.5;
    return {
      event,
      score,
      source: 'llm',
      rationale:
        typeof parsed.rationale === 'string'
          ? parsed.rationale.slice(0, 200)
          : 'llm (no rationale)',
    };
  } catch {
    return null;
  }
}

/** Score every mapped event in a run (heuristic by default). */
export function scoreEvents(
  events: DependencyEvent[],
  options: { source?: ScoreSource } = {},
): EventScore[] {
  const source = options.source ?? 'heuristic';
  if (source !== 'heuristic') {
    throw new Error('scoreEvents() only supports source="heuristic"; use llmScoreEvent() for LLM');
  }
  return events.filter((e) => e.companyTicker).map((e) => heuristicScoreEvent(e));
}
