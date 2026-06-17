# Agent Architecture

> Decision document. Frozen before Phase 2 begins.
> Changes after Day 3 cost a re-plan.

## Three questions, three answers

### Q1: Where in the loop does the agent sit?

**Decision:** AFTER detectors, BEFORE commitment. One call per signal
that fires a detector. Never per-commit, never per-detector.

Current pipeline (apps/api/src/execution/loop.ts):

TinyFish (LLM #1, page eval) → Gate 1: confidence threshold
→ detector pipeline (8 rule-based classifiers, loop.ts:281-317)
→ post-commit (IPFS + HCS + Arbitrum) → rule execution

New pipeline:

TinyFish → Gate 1 → detectors → IF any fired: agent.ts (LLM #2)
→ Gate 2: conviction threshold → trade + notarize + broadcast

Most monitor checks never fire a detector. Those never invoke the
agent. That's the cost discipline. The agent is not in the hot path
of "check the page"; it is in the cold path of "interpret the page
when it looks interesting."

### Q2: What does the agent add beyond detectors?

Detectors give: a binary hit + per-classifier score 0-100 + a label.
They are rule-based, deterministic, and cheap (no LLM cost).

The agent gives: a SYNTHESIS. One conviction 0-100 across the entire
signal context. A 280-char thesis. A recommended_action
(long|short|none). A confidence_band (low|mid|high).

The thesis is the credibility product. Detector labels are
machine-readable metadata. The agent's thesis is the human-readable
narrative that goes to Telegram and the public scorecard.

### Q3: How do the two threshold gates interact?

Two gates, in order. Both persist; both surface in the scorecard.

**Gate 1: confidence_threshold (per-monitor, default 50)**
TinyFish confidence must clear this. Below = heartbeat row.
Already implemented at loop.ts:416. KEEP as-is.
Lives in `monitors.confidence_threshold`.

**Gate 2: conviction_threshold (global, default 70, env CONVICTION_THRESHOLD)**
After detectors fire, the agent returns conviction.
Below = signal row stored WITH agent_scores row, no trade,
no Telegram, no outcome tracker.
Above = full pipeline: trade + notarize + broadcast.
Lives in env: `CONVICTION_THRESHOLD=70`.

Sub-threshold agent_scores rows are the "agent reasoning archive."
Every score is persisted regardless of threshold. This becomes a
public surface later ("here's what the agent saw and passed on").

## Rubric v1 inputs (what's actually in the codebase)

The original 18-day plan listed `consensus_critical`,
`holder_concentration`, `precedent_count` as rubric inputs. None of
these exist yet. v1 uses only what is real:

- detector classifications (`signal_classifications` table)
- watchlist entry's asset_mapping (`monitors.asset_mapping` JSONB)
- commit metadata (`signals.evidence_text`, `condition_summary`)
- precedent_count: NEW, a single SQL aggregate:
  `SELECT COUNT(*) FROM signals s
 JOIN signal_classifications sc ON sc.signal_id = s.id
 WHERE s.monitor_id = $1
   AND sc.detector_type = ANY($2)
   AND s.detected_at > now() - interval '90 days'`

That's the v1 rubric. v2 adds `consensus_critical` and
`holder_concentration` once the detector that produces them is built.
The rubric is a versioned file at
`apps/api/src/services/agent/rubric-v1.md`, imported as a string.
A v2 swap is infrastructure-free: a new file + bump the import.

## The four strategic gaps

### Cold start

Phase 1 seeds 5 watchlist rows:

| Symbol | URL                                      | Condition                                                  | asset_mapping                                     |
| ------ | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| ZEC    | github.com/zcash/halo2/releases          | consensus-critical / emergency patch / mainnet-upgrade tag | { coingeckoId: "zcash", krakenPair: "ZECUSD" }    |
| BTC    | github.com/bitcoin/bitcoin/releases      | consensus-critical / emergency patch                       | { coingeckoId: "bitcoin", krakenPair: "XBTUSD" }  |
| ETH    | github.com/ethereum/go-ethereum/releases | consensus-critical / emergency patch / hard-fork tag       | { coingeckoId: "ethereum", krakenPair: "ETHUSD" } |
| SOL    | github.com/solana-labs/solana/releases   | consensus-critical / emergency patch                       | { coingeckoId: "solana", krakenPair: "SOLUSD" }   |
| ARB    | github.com/OffchainLabs/nitro/releases   | consensus-critical / emergency patch                       | { coingeckoId: "arbitrum" }                       |

Five rows because: ZEC is the founding-myth asset; BTC/ETH/SOL give
breadth; ARB ties to the on-chain proof chain. The agent's first
week of activity covers most crypto signal types.

### Treasury key custody

`TREASURY_PRIVATE_KEY` env var (32-byte hex). Lives in `.env`, never
committed, never logged, never exposed to web. System wallet is a
single instance per chain (Arbitrum, Robinhood, Hedera). v1 uses a
single key. v2 moves to a 2-of-3 Gnosis Safe. Documented in
`docs/OPERATIONS.md` (separate doc, post-hackathon).

### LLM cost model

`DAILY_AGENT_BUDGET_USD` env (default 20). agent.ts checks estimated
cost BEFORE the API call (rough heuristic: input tokens × $15/1M +
output tokens × $75/1M for Opus 4.7). If daily spend exceeds budget,
circuit breaker opens and agent calls fail-fast with a structured
error. The scorecard's "cost per signal" stat makes the burn visible.
Phase 1 env var; Phase 3 wiring.

### Telegram channel setup

Manual setup, cannot be automated through API:

- Channel: @lenitnes (public, created manually)
- Bot: @lenitnes_bot (created via @BotFather, token in
  `TELEGRAM_BOT_TOKEN` env, chat id in `TELEGRAM_PUBLIC_CHANNEL_ID`)
- Bot is admin of the channel
- Bot identity is SEPARATE from the treasury Hedera operator
  identity — rotation of either is independent

Plan doc has a "before launch" checklist that includes this.

## What agent.ts knows about

INPUT: detector output + watchlist context + commit metadata
OUTPUT: AgentScore { conviction, thesis, recommended_action,
confidence_band, raw_response }
STORAGE: writes to `agent_scores` table (every score persists)
KNOWS NOTHING ABOUT: Telegram, trading, the rest of the loop.

The integration lives in `loop.ts`, between the detector pass and
post-commit, not inside `agent.ts`. The module boundary is enforced
by the type signature, not by lint rules.
