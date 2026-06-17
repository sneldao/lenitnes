// ─────────────────────────────────────────────────────────────
// Agent — frontier-model conviction scorer for the autonomous
// signal pipeline. Day 3 of the pivot. Modular boundary per
// AGENT_ARCHITECTURE.md: this module knows about detectors and
// conviction; it does NOT know about Telegram, trading, or the DB
// beyond the AgentScore return type.
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { AgentInput, AgentScore } from '@lenitnes/types';
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
  // Budget check fires regardless of MOCK vs live — the daily cap is a
  // hard ceiling on agent activity, not just API spend.
  const rubric = readRubric();
  const userContent = JSON.stringify(input);
  const prompt = `${rubric}\n\n## Input\n\n${userContent}`;

  resetIfNewDay();
  const estimatedUsd = estimateCost(env, prompt);
  if (dailySpendUsd + estimatedUsd > env.dailyBudgetUsd) {
    throw new AgentBudgetExceededError(dailySpendUsd, env.dailyBudgetUsd, estimatedUsd);
  }

  if (env.mock) {
    const result = mockScore(input);
    dailySpendUsd += estimatedUsd; // record the would-be cost
    return result;
  }

  const client = new OpenAI({ apiKey: env.apiKey, baseURL: env.baseUrl });
  const response = await client.chat.completions.create({
    model: env.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
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
