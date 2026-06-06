import { config } from '../config.js';
import type { TinyFishResult } from '../types.js';
import { withRetry } from './retry.js';

// ─────────────────────────────────────────────────────────────
// TinyFish integration — natural-language web intelligence.
//
// We use TinyFish as an *agent*, not just a scraper: it visits the target
// and evaluates whether the user's plain-English condition is true, returning
// structured JSON plus screenshots for the proof package.
// ─────────────────────────────────────────────────────────────

export interface RunMonitorCheckParams {
  url: string;
  condition: string;
  /** Last commit hash we already evaluated (GitHub repos only). */
  lastSeenCommitHash?: string | null;
}

function buildGoalPrompt(p: RunMonitorCheckParams): string {
  const sinceClause = p.lastSeenCommitHash
    ? `Only consider commits added since commit hash ${p.lastSeenCommitHash}. `
    : '';
  return [
    `Visit ${p.url} and determine if the following condition is true: "${p.condition}".`,
    sinceClause,
    `Extract any relevant text, code, or content that is evidence of this condition.`,
    `Return STRICT JSON with keys: condition_met (boolean), evidence (string),`,
    `summary (string), latest_commit_hash (string, if the page is a commit list).`,
  ].join(' ');
}

/**
 * Run a single monitor check via TinyFish.
 *
 * NOTE: wire this to the real TinyFish SDK. The shape below documents the
 * contract the rest of the system depends on. Until configured, it throws so
 * the execution loop records a failed check rather than a false negative.
 */
export async function runMonitorCheck(p: RunMonitorCheckParams): Promise<TinyFishResult> {
  if (!config.tinyfish.apiKey) {
    throw new Error('TINYFISH_API_KEY not configured');
  }

  const goal = buildGoalPrompt(p);

  const baseUrl = process.env.TINYFISH_API_URL ?? 'https://api.tinyfish.ai/v1';
  const res = await withRetry(
    () =>
      fetch(`${baseUrl}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.tinyfish.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: p.url,
          goal,
          format: 'json',
          screenshots: true,
        }),
        signal: AbortSignal.timeout(30_000), // 30s timeout to prevent worker hangs
      }),
    { retries: 2, baseDelayMs: 1_000 },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TinyFish API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const runId = (json.id ?? json.run_id ?? 'unknown') as string;
  const parsed = (json.output ?? json.result ?? json) as Record<string, unknown>;

  return {
    runId,
    conditionMet: Boolean(parsed.condition_met ?? parsed.conditionMet),
    evidence: String(parsed.evidence ?? ''),
    summary: String(parsed.summary ?? ''),
    screenshots: Array.isArray(parsed.screenshots) ? parsed.screenshots : [],
    latestCommitHash: (parsed.latest_commit_hash ?? parsed.latestCommitHash ?? undefined) as
      | string
      | undefined,
  };
}
