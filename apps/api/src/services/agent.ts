// ─────────────────────────────────────────────────────────────
// Agent — frontier-model conviction scorer for the autonomous
// signal pipeline. Day 3 + Day 4 of the pivot. Modular boundary per
// AGENT_ARCHITECTURE.md: this module knows about detectors and
// conviction; it does NOT know about Telegram, trading, or the DB
// beyond the AgentScore return type + the agent_scores persistence
// helper below.
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { AgentInput, AgentScore } from '@lenitnes/types';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUBRIC_PATH = path.resolve(__dirname, 'agent/rubric-v4.md');

// v4 (2026-07-07): calibration hardening + book awareness. Adds
// `book_context` input (current open positions) with book-discipline
// rules (no pile-on, reversals need named new evidence), a commit-
// citation requirement (thesis must cite the SHA and its code-level
// meaning or conviction ≤ 50), and a hard cap of 65 on news-only
// signals — the operation's edge is commits, not headlines. v3
// prompts still parse (the new field is optional) so the version
// bump is non-breaking for replay.
const RUBRIC_VERSION = 'v4';
const EXPECTED_OUTPUT_TOKENS = 700;

export interface AgentEnv {
  apiKey: string;
  baseUrl: string;
  model: string;
  mock: boolean;
  dailyBudgetUsd: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export class AgentBudgetExceededError extends Error {
  readonly dailySpendUsd: number;
  readonly dailyBudgetUsd: number;
  readonly estimatedUsd: number;
  constructor(dailySpendUsd: number, dailyBudgetUsd: number, estimatedUsd: number) {
    super(
      `Agent daily budget exceeded: $${dailySpendUsd.toFixed(4)} spent + ` +
        `$${estimatedUsd.toFixed(4)} estimated > $${dailyBudgetUsd.toFixed(4)} budget`,
    );
    this.name = 'AgentBudgetExceededError';
    this.dailySpendUsd = dailySpendUsd;
    this.dailyBudgetUsd = dailyBudgetUsd;
    this.estimatedUsd = estimatedUsd;
  }
}

export class AgentScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentScoreError';
  }
}

let dailySpendUsd = 0;
let dailyResetAt = '';

function resetIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyResetAt) {
    dailySpendUsd = 0;
    dailyResetAt = today;
  }
}

function estimateCost(env: AgentEnv, prompt: string): number {
  // ~4 chars per token is a reasonable upper bound for English.
  const inputTokens = Math.ceil(prompt.length / 4);
  return (
    (inputTokens / 1_000_000) * env.inputCostPer1M +
    (EXPECTED_OUTPUT_TOKENS / 1_000_000) * env.outputCostPer1M
  );
}

function recordCost(env: AgentEnv, promptTokens: number, completionTokens: number): number {
  const usd =
    (promptTokens / 1_000_000) * env.inputCostPer1M +
    (completionTokens / 1_000_000) * env.outputCostPer1M;
  dailySpendUsd += usd;
  return usd;
}

function readRubric(): string {
  return fs.readFileSync(RUBRIC_PATH, 'utf8');
}

/**
 * Extract the first parseable JSON object from a model response.
 * Models wrap JSON in markdown fences, prepend headings ("### Output"),
 * emit <think> blocks, or append prose — all observed in production.
 * Strategy: strip reasoning tags, then try (1) the whole string,
 * (2) each fenced code block, (3) the outermost {...} span scanned
 * with brace counting (string-aware).
 */
function extractJsonObject(raw: string): unknown {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const candidates: string[] = [text];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.push(m[1].trim());
  }
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
      } else if (inString) {
        if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {
      // try the next candidate
    }
  }
  throw new AgentScoreError('Failed to parse agent JSON response: no JSON object found');
}

function parseAgentResponse(raw: string): {
  conviction: number;
  thesis: string;
  recommended_action: 'long' | 'short' | 'none';
  confidence_band: 'low' | 'mid' | 'high';
  hcs_dispatch: string;
  proof_action: 'standard' | 'dedicated_topic';
} {
  const parsed = extractJsonObject(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new AgentScoreError('Agent response is not an object');
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.conviction !== 'number' || obj.conviction < 0 || obj.conviction > 100) {
    throw new AgentScoreError(`Invalid conviction: ${obj.conviction}`);
  }
  if (typeof obj.thesis !== 'string' || obj.thesis.length === 0 || obj.thesis.length > 280) {
    throw new AgentScoreError(`Invalid thesis (length ${(obj.thesis as string)?.length})`);
  }
  if (
    obj.recommended_action !== 'long' &&
    obj.recommended_action !== 'short' &&
    obj.recommended_action !== 'none'
  ) {
    throw new AgentScoreError(`Invalid recommended_action: ${obj.recommended_action}`);
  }
  if (
    obj.confidence_band !== 'low' &&
    obj.confidence_band !== 'mid' &&
    obj.confidence_band !== 'high'
  ) {
    throw new AgentScoreError(`Invalid confidence_band: ${obj.confidence_band}`);
  }
  // Allow recommended_action=none at any conviction — the agent may
  // find something significant (conviction 70+) but still recommend
  // against a trade (e.g. market is closed, no liquid pair, etc.).
  // The rubric instructs this, but we don't hard-enforce it.

  // v2 fields. Fall back to templated defaults if the model is on
  // the older rubric (e.g. mid-deploy, or a replay against a
  // historical v1 transcript). The dispatch fallback uses the
  // thesis verbatim — adequate but not the agent's "on-chain voice".
  const conviction = Math.round(obj.conviction);
  const thesis = obj.thesis;
  const recommended_action = obj.recommended_action;
  const confidence_band = obj.confidence_band;

  let hcs_dispatch: string;
  if (typeof obj.hcs_dispatch === 'string' && obj.hcs_dispatch.length > 0) {
    if (obj.hcs_dispatch.length > 600) {
      // Truncate rather than reject — the dispatch fitting in an HCS
      // message is the actual physical constraint, and the agent's
      // 600-char rule from the rubric is advisory.
      hcs_dispatch = obj.hcs_dispatch.slice(0, 600);
    } else {
      hcs_dispatch = obj.hcs_dispatch;
    }
  } else {
    // v1 fallback: synthesize a dispatch from the thesis. Marked
    // with [legacy] so the on-chain record makes the fallback
    // visible — readers shouldn't mistake a synthesized dispatch
    // for the agent's first-person voice.
    hcs_dispatch = `[legacy v1] ${thesis}`;
  }

  let proof_action: 'standard' | 'dedicated_topic';
  if (obj.proof_action === 'dedicated_topic' && conviction >= 90) {
    proof_action = 'dedicated_topic';
  } else {
    // Default to standard. Either the rubric is v1 (no proof_action
    // field), or conviction is below the dedicated-topic floor and
    // we refuse the agent's request as a safety invariant.
    proof_action = 'standard';
  }

  return {
    conviction,
    thesis,
    recommended_action,
    confidence_band,
    hcs_dispatch,
    proof_action,
  };
}

function mockScore(input: AgentInput): AgentScore {
  // Deterministic stub: conviction = max detector score.
  const topScore = input.detector_classifications.reduce(
    (max, c) => (c.score > max ? c.score : max),
    0,
  );
  const direction = input.asset_mapping.direction;
  const recommended_action: 'long' | 'short' | 'none' =
    direction === 'short'
      ? 'short'
      : direction === 'long' || direction === 'both'
        ? 'long'
        : 'none';
  const confidence_band: 'low' | 'mid' | 'high' =
    topScore < 40 ? 'low' : topScore < 70 ? 'mid' : 'high';
  const asset = input.asset_mapping.coingeckoId ?? 'unknown';
  return {
    id: '',
    signal_id: input.signal_id,
    rubric_version: RUBRIC_VERSION,
    conviction: topScore,
    thesis: `MOCK: top detector ${topScore} on ${asset}.`,
    recommended_action,
    confidence_band,
    hcs_dispatch: `[MOCK] I observed detector activity on ${asset} (top score ${topScore}). Recommending ${recommended_action}. This is a deterministic mock for test/replay; no real agent reasoning was performed.`,
    proof_action: 'standard',
    raw_response: { mock: true, input },
    created_at: new Date().toISOString(),
  };
}

export async function score(input: AgentInput, env: AgentEnv): Promise<AgentScore> {
  // Budget check is bypassed in MOCK mode — the deterministic stub
  // costs nothing, and a developer running seed:demo or a local
  // backtest should not need to set DAILY_AGENT_BUDGET_USD just to
  // exercise the pipeline. The circuit-breaker behavior is still
  // exercised by the live path (env.mock === false).
  const rubric = readRubric();
  const userContent = JSON.stringify(input);
  const prompt = `${rubric}\n\n## Input\n\n${userContent}`;

  if (env.mock) {
    const result = mockScore(input);
    return result;
  }

  resetIfNewDay();
  const estimatedUsd = estimateCost(env, prompt);
  if (dailySpendUsd + estimatedUsd > env.dailyBudgetUsd) {
    throw new AgentBudgetExceededError(dailySpendUsd, env.dailyBudgetUsd, estimatedUsd);
  }

  const client = new OpenAI({ apiKey: env.apiKey, baseURL: env.baseUrl });
  const temperature = Number(process.env.AGENT_TEMPERATURE ?? 0);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: prompt },
  ];

  // One corrective retry on malformed output: feed the bad response
  // back and demand bare JSON. Weak instruction-followers (observed:
  // "### Output" preambles) usually comply on the second attempt;
  // a second failure is a real error and propagates.
  let parsed: ReturnType<typeof parseAgentResponse> | null = null;
  let message = '';
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const response = await client.chat.completions.create({
      model: env.model,
      messages,
      temperature,
    });

    const content = response.choices[0]?.message?.content;
    if (response.usage) {
      recordCost(env, response.usage.prompt_tokens ?? 0, response.usage.completion_tokens ?? 0);
    }
    if (!content || typeof content !== 'string') {
      throw new AgentScoreError('Empty response from agent');
    }
    message = content;

    try {
      parsed = parseAgentResponse(content);
    } catch (err) {
      if (attempt === 1) throw err;
      logger.warn(
        { signalId: input.signal_id, err },
        'agent response unparseable — retrying with corrective instruction',
      );
      messages.push({ role: 'assistant', content });
      messages.push({
        role: 'user',
        content:
          'Your previous response was not valid JSON. Respond again with ONLY the JSON object — no markdown fences, no headings, no prose.',
      });
    }
  }
  if (!parsed) throw new AgentScoreError('Agent response unparseable after retry');
  logger.debug({ signalId: input.signal_id, dailySpendUsd, estimatedUsd }, 'agent scored signal');

  return {
    id: '',
    signal_id: input.signal_id,
    rubric_version: RUBRIC_VERSION,
    conviction: parsed.conviction,
    thesis: parsed.thesis,
    recommended_action: parsed.recommended_action,
    confidence_band: parsed.confidence_band,
    hcs_dispatch: parsed.hcs_dispatch,
    proof_action: parsed.proof_action,
    raw_response: { model: env.model, response: parsed, content: message },
    created_at: new Date().toISOString(),
  };
}

// Test helper — expose the daily spend for assertion in tests.
export function _internalDailySpendUsd(): number {
  return dailySpendUsd;
}

// Test helper — reset state between tests.
export function _internalResetForTests(): void {
  dailySpendUsd = 0;
  dailyResetAt = '';
}

// ── Persistence + env helper (Day 4) ────────────────────────────────

/**
 * Persist an AgentScore to the agent_scores table. Every score is
 * persisted regardless of conviction — sub-threshold scores form
 * the "agent reasoning archive" (public surface, future).
 */
export async function saveAgentScore(signalId: string, score: AgentScore): Promise<void> {
  await query(
    `INSERT INTO agent_scores
       (signal_id, rubric_version, conviction, thesis,
        recommended_action, confidence_band, hcs_dispatch,
        proof_action, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      signalId,
      score.rubric_version,
      score.conviction,
      score.thesis,
      score.recommended_action,
      score.confidence_band,
      score.hcs_dispatch,
      score.proof_action,
      JSON.stringify(score.raw_response),
    ],
  );
}

/**
 * Score + persist. The Day 4 entry point for loop.ts.
 */
export async function scoreAndPersist(input: AgentInput, env: AgentEnv): Promise<AgentScore> {
  const result = await score(input, env);
  await saveAgentScore(input.signal_id, result);
  return result;
}

/**
 * Build the `book_context` input (rubric v4): the current open
 * positions with direction, conviction at open, age, and the thesis
 * that opened each. Lets the agent apply book discipline — no
 * pile-ons, no evidence-free reversals. Returns '' on a flat book.
 */
export async function buildBookContext(): Promise<string> {
  const { rows } = await query<{
    asset: string;
    direction: string;
    conviction_at_open: number | null;
    age_hours: string;
    thesis: string | null;
  }>(
    `SELECT p.asset, p.direction, p.conviction_at_open,
            ROUND(EXTRACT(EPOCH FROM (now() - p.opened_at)) / 3600)::text AS age_hours,
            LEFT(a.thesis, 140) AS thesis
       FROM positions p
       LEFT JOIN agent_scores a ON a.signal_id = p.signal_id
      WHERE p.status = 'open'
      ORDER BY p.opened_at`,
  );
  if (rows.length === 0) return '';

  const lines = ['--- Open book ---'];
  for (const r of rows) {
    const conv = r.conviction_at_open != null ? ` · opened at ${r.conviction_at_open}/100` : '';
    const thesis = r.thesis ? ` · entry thesis: "${r.thesis}"` : '';
    lines.push(
      `  ${r.asset.toUpperCase()} ${r.direction.toUpperCase()} · ${r.age_hours}h old${conv}${thesis}`,
    );
  }
  return lines.join('\n');
}

/**
 * Count similar past signals in the last 90 days. Used as a
 * precedent signal in the agent's rubric. Cheap query, no caching.
 */
export async function precedentCount(monitorId: string, detectorTypes: string[]): Promise<number> {
  if (detectorTypes.length === 0) return 0;
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM signals s
       JOIN signal_classifications sc ON sc.signal_id = s.id
      WHERE s.monitor_id = $1
        AND sc.detector_type = ANY($2)
        AND s.detected_at > now() - interval '90 days'`,
    [monitorId, detectorTypes],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

/**
 * Fetch outcome context for the same monitor+detector combo — avg 1d/7d
 * returns and win rate. Injected into the LLM prompt so the agent learns
 * from past hits and misses.
 */
export async function fetchOutcomeContext(
  monitorId: string,
  detectorTypes: string[],
): Promise<string | null> {
  if (detectorTypes.length === 0) return null;
  const { rows } = await query<{
    total_signals: string;
    total_outcomes: string;
    correct_count: string;
    avg_1d_return: string;
    avg_7d_return: string;
    avg_conviction: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_signals,
       COUNT(so.id)::text AS total_outcomes,
       COUNT(so.id) FILTER (WHERE so.window_seconds = 86400 AND so.direction = 'up')::text AS correct_count,
       COALESCE(AVG(so.pct_change) FILTER (WHERE so.window_seconds = 86400), 0)::text AS avg_1d_return,
       COALESCE(AVG(so.pct_change) FILTER (WHERE so.window_seconds = 604800), 0)::text AS avg_7d_return,
       COALESCE(AVG(as2.conviction) FILTER (WHERE so.window_seconds = 86400), 0)::text AS avg_conviction
      FROM signals s
      JOIN signal_classifications sc ON sc.signal_id = s.id
      LEFT JOIN signal_outcomes so ON so.signal_id = s.id
      LEFT JOIN agent_scores as2 ON as2.signal_id = s.id
      WHERE s.monitor_id = $1
        AND sc.detector_type = ANY($2)
        AND s.detected_at > now() - interval '90 days'`,
    [monitorId, detectorTypes],
  );
  const row = rows[0];
  if (!row || parseInt(row.total_outcomes, 10) === 0) return null;

  const total = parseInt(row.total_outcomes, 10);
  const correct = parseInt(row.correct_count, 10);
  const winRate = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';
  const avg1d = parseFloat(row.avg_1d_return).toFixed(2);
  const avg7d = parseFloat(row.avg_7d_return).toFixed(2);
  const avgConv = parseFloat(row.avg_conviction).toFixed(0);

  return (
    `Past signals: ${row.total_signals} total, ${total} with outcomes. ` +
    `${winRate}% win rate (T+1d). Avg T+1d return: ${avg1d}%. ` +
    `Avg T+7d return: ${avg7d}%. Avg conviction of scored signals: ${avgConv}.`
  );
}

/**
 * Build AgentEnv from process.env. Single place that reads the env
 * vars; called by loop.ts at request time (not at module load).
 */
export function buildAgentEnvFromConfig(): AgentEnv {
  // Prefer NVIDIA API if key is set, fall back to Virtuals.
  const nvidiaKey = process.env.NVIDIA_API_KEY ?? '';
  if (nvidiaKey) {
    return {
      apiKey: nvidiaKey,
      baseUrl: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
      model: process.env.AGENT_MODEL ?? 'minimaxai/minimax-m3',
      mock: process.env.MOCK_AGENT === '1',
      dailyBudgetUsd: Number(process.env.DAILY_AGENT_BUDGET_USD ?? 20),
      inputCostPer1M: Number(process.env.AGENT_INPUT_COST_PER_1M_USD ?? 0.15),
      outputCostPer1M: Number(process.env.AGENT_OUTPUT_COST_PER_1M_USD ?? 0.6),
    };
  }
  return {
    apiKey: process.env.VIRTUALS_API_KEY ?? '',
    baseUrl: process.env.VIRTUALS_BASE_URL ?? 'https://compute.virtuals.io/v1',
    model: process.env.AGENT_MODEL ?? 'moonshotai/kimi-k2-0905',
    mock: process.env.MOCK_AGENT === '1',
    dailyBudgetUsd: Number(process.env.DAILY_AGENT_BUDGET_USD ?? 20),
    inputCostPer1M: Number(process.env.AGENT_INPUT_COST_PER_1M_USD ?? 0.6),
    outputCostPer1M: Number(process.env.AGENT_OUTPUT_COST_PER_1M_USD ?? 2.5),
  };
}

/**
 * Fetch the persisted agent_score for a signal. Used by the
 * /signals/:id route to surface the agent's verdict on the public
 * signal detail page.
 */
export async function fetchAgentScore(signalId: string): Promise<AgentScore | null> {
  const { rows } = await query<{
    id: string;
    signal_id: string;
    rubric_version: string;
    conviction: number;
    thesis: string;
    recommended_action: 'long' | 'short' | 'none';
    confidence_band: 'low' | 'mid' | 'high';
    hcs_dispatch: string | null;
    proof_action: string | null;
    raw_response: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id, signal_id, rubric_version, conviction, thesis,
            recommended_action, confidence_band,
            hcs_dispatch, proof_action,
            raw_response, created_at
       FROM agent_scores
      WHERE signal_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [signalId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    signal_id: row.signal_id,
    rubric_version: row.rubric_version,
    conviction: row.conviction,
    thesis: row.thesis,
    recommended_action: row.recommended_action,
    confidence_band: row.confidence_band,
    // Legacy rows (pre-v2) lack these columns — synthesize stable
    // defaults so downstream consumers don't need to null-check.
    hcs_dispatch: row.hcs_dispatch ?? `[legacy v1] ${row.thesis}`,
    proof_action: row.proof_action === 'dedicated_topic' ? 'dedicated_topic' : 'standard',
    raw_response: row.raw_response,
    created_at: row.created_at,
  };
}
