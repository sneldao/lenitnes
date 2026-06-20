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
const RUBRIC_PATH = path.resolve(__dirname, 'agent/rubric-v1.md');

const RUBRIC_VERSION = 'v1';
const EXPECTED_OUTPUT_TOKENS = 500;

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

function parseAgentResponse(raw: string): {
  conviction: number;
  thesis: string;
  recommended_action: 'long' | 'short' | 'none';
  confidence_band: 'low' | 'mid' | 'high';
} {
  // Strip code fences if the model wraps the JSON.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new AgentScoreError(`Failed to parse agent JSON response: ${(err as Error).message}`);
  }

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
  if (obj.recommended_action === 'none' && obj.conviction > 50) {
    throw new AgentScoreError('recommended_action=none requires conviction <= 50');
  }

  return {
    conviction: Math.round(obj.conviction),
    thesis: obj.thesis,
    recommended_action: obj.recommended_action,
    confidence_band: obj.confidence_band,
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
  return {
    id: '',
    signal_id: input.signal_id,
    rubric_version: RUBRIC_VERSION,
    conviction: topScore,
    thesis: `MOCK: top detector ${topScore} on ${input.asset_mapping.coingeckoId ?? 'unknown'}.`,
    recommended_action,
    confidence_band,
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
  const response = await client.chat.completions.create({
    model: env.model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  });

  const message = response.choices[0]?.message?.content;
  if (!message || typeof message !== 'string') {
    throw new AgentScoreError('Empty response from agent');
  }

  const parsed = parseAgentResponse(message);

  if (response.usage) {
    recordCost(env, response.usage.prompt_tokens ?? 0, response.usage.completion_tokens ?? 0);
    logger.debug({ signalId: input.signal_id, dailySpendUsd, estimatedUsd }, 'agent scored signal');
  }

  return {
    id: '',
    signal_id: input.signal_id,
    rubric_version: RUBRIC_VERSION,
    conviction: parsed.conviction,
    thesis: parsed.thesis,
    recommended_action: parsed.recommended_action,
    confidence_band: parsed.confidence_band,
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
        recommended_action, confidence_band, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      signalId,
      score.rubric_version,
      score.conviction,
      score.thesis,
      score.recommended_action,
      score.confidence_band,
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
    raw_response: Record<string, unknown>;
    created_at: string;
  }>(
    `SELECT id, signal_id, rubric_version, conviction, thesis,
            recommended_action, confidence_band, raw_response, created_at
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
    raw_response: row.raw_response,
    created_at: row.created_at,
  };
}
