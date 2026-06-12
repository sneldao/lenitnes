import { z } from 'zod';
import { config } from '../config.js';
import type { TinyFishResult } from '@lenitnes/types';
import { withRetry } from './retry.js';
import { observeHistogram } from '../middleware/metrics.js';
import { fetchCommitsSince } from './github.js';
import { logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────
// TinyFish integration — natural-language web intelligence.
//
// We use TinyFish as an *agent*, not just a scraper: it visits the target
// and evaluates whether the user's plain-English condition is true, returning
// structured JSON plus screenshots for the proof package.
//
// Guards:
//   • Condition text truncated to MAX_CONDITION_LEN to prevent token bombing.
//   • Response validated with Zod to catch silent coercion bugs (e.g. "false" → true).
//   • Screenshots are optional per-monitor to save tokens on text-only checks.
//   • Latency is observed in a `finally` so timeouts, Zod failures, and HTTP
//     errors are all recorded — not just the happy path.
// ─────────────────────────────────────────────────────────────

const MAX_CONDITION_LEN = 500;

export interface RunMonitorCheckParams {
  url: string;
  condition: string;
  /** Last commit hash we already evaluated (GitHub repos only). */
  lastSeenCommitHash?: string | null;
  /** Whether to request screenshots (default true). Set false for text-only checks. */
  screenshots?: boolean;
}

function truncateCondition(condition: string): string {
  if (condition.length <= MAX_CONDITION_LEN) return condition;
  return condition.slice(0, MAX_CONDITION_LEN) + '…';
}

function buildGoalPrompt(p: RunMonitorCheckParams, commitContext = ''): string {
  const condition = truncateCondition(p.condition);
  const sinceClause = p.lastSeenCommitHash ? `Commits since ${p.lastSeenCommitHash}. ` : '';
  // Compact prompt to minimize token usage while preserving intent.
  // Confidence 0-100 helps users tune sensitivity (strict vs relaxed).
  return [
    `Visit ${p.url}. Is this true: "${condition}"?`,
    sinceClause,
    commitContext,
    `Return strict JSON: condition_met(bool), confidence(int 0-100), evidence(str), summary(str), latest_commit_hash(str, commits only).`,
  ].join(' ');
}

const tinyFishResponseSchema = z.object({
  condition_met: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => v === true || v === 'true'),
  confidence: z.coerce.number().min(0).max(100).default(50),
  evidence: z.string().default(''),
  summary: z.string().default(''),
  latest_commit_hash: z.string().optional(),
  screenshots: z.array(z.string()).default([]),
});

export async function runMonitorCheck(p: RunMonitorCheckParams): Promise<TinyFishResult> {
  if (!config.tinyfish.apiKey) {
    throw new Error('TINYFISH_API_KEY not configured');
  }

  const start = performance.now();

  // Hoisted so the `finally` block can label the histogram with the
  // observed result. Defaults are set in the `try` and remain `null` on
  // any thrown error (timeout, Zod failure, HTTP non-2xx).
  let runId = 'unknown';
  let parsed: z.infer<typeof tinyFishResponseSchema> | null = null;
  let errorLabel: 'timeout' | 'http' | 'parse' | null = null;

  // ── Optional GitHub enrichment: fetch commit data for richer evaluation ──
  let commitContext = '';
  let githubCommitsFetched = 0;
  if (config.github.token && p.url.includes('github.com')) {
    try {
      const commits = await fetchCommitsSince(p.url, p.lastSeenCommitHash ?? null);
      if (commits && commits.length > 0) {
        githubCommitsFetched = commits.length;
        commitContext = `
Recent commits since last check:\n${commits
          .slice(0, 5)
          .map((c) => `- ${c.sha.slice(0, 7)}: ${c.message.split('\n')[0]} (${c.author})`)
          .join('\n')}`;
      }
    } catch (err) {
      logger.warn({ err, url: p.url }, 'GitHub enrichment skipped');
    }
  }

  const goal = buildGoalPrompt(p, commitContext);

  const baseUrl = process.env.TINYFISH_API_URL ?? 'https://api.tinyfish.ai/v1';
  try {
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
            screenshots: p.screenshots ?? true,
          }),
          signal: AbortSignal.timeout(30_000), // 30s timeout to prevent worker hangs
        }),
      { retries: 2, baseDelayMs: 1_000 },
    );

    if (!res.ok) {
      errorLabel = 'http';
      const text = await res.text();
      throw new Error(`TinyFish API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    runId = (json.id ?? json.run_id ?? 'unknown') as string;
    const rawOutput = (json.output ?? json.result ?? json) as Record<string, unknown>;

    // Zod validation prevents silent coercion bugs (e.g. string "false" → Boolean true).
    const parseResult = tinyFishResponseSchema.safeParse(rawOutput);
    if (!parseResult.success) {
      errorLabel = 'parse';
      throw new Error(`TinyFish response validation failed: ${parseResult.error.message}`);
    }
    parsed = parseResult.data;
  } catch (err) {
    // Distinguish timeouts (AbortError) so the histogram gets a useful label.
    if (errorLabel == null) {
      const name = (err as { name?: string })?.name;
      if (name === 'AbortError' || name === 'TimeoutError') errorLabel = 'timeout';
    }
    throw err;
  } finally {
    // Always record latency — including for timeouts, Zod failures, and HTTP errors —
    // so the histogram is a true measure of call duration. The `result` label is
    // `error` for any failure, and `signal` / `heartbeat` for successful parses.
    const duration = performance.now() - start;
    let label: string;
    if (parsed) {
      label = parsed.condition_met ? 'signal' : 'heartbeat';
    } else if (errorLabel) {
      label = `error:${errorLabel}`;
    } else {
      label = 'error';
    }
    observeHistogram('tinyfish_inference_duration_ms', { result: label }, duration);
  }

  // After the try/finally, `parsed` is guaranteed non-null (the only failure
  // paths throw, which exits the function). The `as` here is a no-op assertion.
  const ok = parsed as z.infer<typeof tinyFishResponseSchema>;
  return {
    runId,
    conditionMet: ok.condition_met,
    confidence: ok.confidence,
    evidence: ok.evidence,
    summary: ok.summary,
    screenshots: ok.screenshots,
    latestCommitHash: ok.latest_commit_hash,
    githubCommitsFetched,
  };
}
