import { config } from "../config.js";
import type { TinyFishResult } from "../types.js";

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
    : "";
  return [
    `Visit ${p.url} and determine if the following condition is true: "${p.condition}".`,
    sinceClause,
    `Extract any relevant text, code, or content that is evidence of this condition.`,
    `Return STRICT JSON with keys: condition_met (boolean), evidence (string),`,
    `summary (string), latest_commit_hash (string, if the page is a commit list).`,
  ].join(" ");
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
    throw new Error("TINYFISH_API_KEY not configured");
  }

  const goal = buildGoalPrompt(p);

  // TODO: replace with the real TinyFish SDK call, e.g.:
  //   const run = await tinyfish.agents.run({ goal, screenshots: true });
  //   const parsed = JSON.parse(run.output);
  //   return { runId: run.id, conditionMet: parsed.condition_met, ... };

  throw new Error(`TinyFish SDK not yet wired. Goal prompt was: ${goal}`);
}
