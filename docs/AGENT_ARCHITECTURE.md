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

Pipeline after BNB pivot:

TinyFish → Gate 1 → detectors → IF any fired:
→ CMC market context fetch (Fear & Greed, global metrics, asset quotes)
→ agent.ts (LLM #2, enriched with market_context)
→ Gate 2: conviction threshold
→ treasury: BSC → TWAK swap | Arbitrum/Robinhood → ethers Wallet
→ notarize + broadcast

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
- market_context: CoinMarketCap market data injected before scoring.
  Includes global metrics (total cap, BTC/ETH dominance, volume),
  Fear & Greed index, and asset-specific price quotes with 1h/24h/7d
  percent changes.

The rubric v1 was extended (not replaced) for the BNB Hack pivot. The
market_context section was added to the prompt, and the rubric now
instructs the agent to weigh Fear & Greed, funding rates, altcoin
season, and volume confirmation alongside detector signals. A final
invariant notes: "Market context is informative, not decisive" —
strong detector signals in adverse conditions still fire.

The rubric is a versioned file at
`apps/api/src/services/agent/rubric-v1.md`, imported as a string.
A v2 swap is infrastructure-free: a new file + bump the import.

## The four strategic gaps

### Cold start

Phase 1 seeds 5 watchlist rows:

| Symbol | URL                                      | Condition                                                  | asset_mapping               |
| ------ | ---------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| ZEC    | github.com/zcash/halo2/releases          | consensus-critical / emergency patch / mainnet-upgrade tag | { coingeckoId: "zcash" }    |
| BTC    | github.com/bitcoin/bitcoin/releases      | consensus-critical / emergency patch                       | { coingeckoId: "bitcoin" }  |
| ETH    | github.com/ethereum/go-ethereum/releases | consensus-critical / emergency patch / hard-fork tag       | { coingeckoId: "ethereum" } |
| SOL    | github.com/solana-labs/solana/releases   | consensus-critical / emergency patch                       | { coingeckoId: "solana" }   |
| ARB    | github.com/OffchainLabs/nitro/releases   | consensus-critical / emergency patch                       | { coingeckoId: "arbitrum" } |

Five rows because: ZEC is the founding-myth asset; BTC/ETH/SOL give
breadth; ARB ties to the on-chain proof chain. The agent's first
week of activity covers most crypto signal types.

### Treasury key custody

`TREASURY_PRIVATE_KEY` env var (32-byte hex). Lives in `.env`, never
committed, never logged, never exposed to web. System wallet is a
single instance per chain (Arbitrum, Robinhood, Hedera, BSC). v1 uses a
single key. v2 moves to a 2-of-3 Gnosis Safe.

**BNB Hack:** BSC live trades use TWAK (Trust Wallet Agent Kit) instead
of the raw `TREASURY_PRIVATE_KEY` when `TWAK_ENABLED=true`. TWAK handles
self-custody signing — keys never leave the user's device. Configured
via `TWAK_ACCESS_ID` + `TWAK_HMAC_SECRET` from portal.trustwallet.com.

### x402 pay-per-request

CMC data can be fetched via the x402 protocol instead of the Pro API
key. When `X402_ENABLED=true`, `cmc.ts` routes through `cmc-x402.ts`
which uses `@x402/axios` + `@x402/evm` + `viem` to pay $0.01 USDC per
request on Base (chain 8453). The wallet is configured via
`X402_PRIVATE_KEY` and must hold USDC + ETH on Base for gas.

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

---

## Day 14: Kraken integration fully removed

The Day 1 zero-headcount pivot removed Kraken from the trading
path (it had been a per-user exchange API). The Day 12 commits
(060a17d) removed the Kraken CLI download from the api
Dockerfile. Day 14 completes the removal:

- `apps/api/src/services/kraken.ts` (211 lines) — Kraken REST
  client (addOrder, getBalance, queryOrders, sign) — deleted.
- `apps/api/src/mcp/kraken-server.ts` (86 lines) — MCP server
  exposing Kraken as MCP tools — deleted.
- `apps/api/src/validation/kraken.schema.ts` — zod schemas
  for Kraken config (krakenConfigSchema, testTradeSchema) — deleted.
- `apps/api/src/services/price.ts` — Kraken OHLC backend
  (getKrakenPriceAt) deleted; PriceSource reduced to coingecko-only.
- `apps/api/src/services/evm/venue.ts` — Venue reduced from
  ('kraken' | 'arbitrum' | 'robinhood') to ('arbitrum' | 'robinhood').
- `apps/api/src/services/treasury.ts` — deriveActionFromAgent
  no longer reads assetMapping.krakenPair.
- `packages/types/src/index.ts` — Order.kraken_order_id and
  Order.kraken_response fields removed; AssetMapping.krakenPair removed.
- `apps/api/src/validation/monitor.schema.ts` —
  assetMapping.krakenPair zod field removed.
- `apps/api/src/routes/orders.ts` — kraken_order_id, kraken_response
  dropped from the GET /orders SELECT.
- `apps/web/src/app/signals/[id]/page.tsx` — order rendering
  switched from `o.kraken_order_id.startsWith('paper-')` to
  `params.mode === 'paper'` (the post-pivot paper-mode flag).
- `apps/web/src/app/layout.tsx` — metadata description
  reworded; footer tech strip changed from
  Hedera / TinyFish / Grove / Kraken to
  Hedera / CMC / TWAK / x402.
- `apps/api/package.json` — `mcp` script (pointed at the deleted
  server) and `@modelcontextprotocol/sdk` dep removed.

What did NOT change:

- `db/schema.sql` still has `kraken_order_id` and `kraken_response`
  columns on the `orders` table. Historical rows reference them.
  The TypeScript layer no longer fetches or writes them; a future
  migration could drop the columns if the historical data isn't
  needed.
- The db seed files (`db/seed/watchlist.sql`,
  `db/seed/treasury_wallets.sql`) — out of scope for this commit.
- `db/migrations/003_pivot.sql` and earlier — historical record,
  intentionally left untouched.

The architectural narrative now matches the code: there is no
Kraken anywhere in the runtime path. Trades are chain-native
(Arbitrum / Robinhood / BSC), self-custody (TWAK on BSC) or
operator-key (ethers on Arbitrum / RH), and the price oracle is
CoinGecko only.

---

## Day 24+: post-audit safety layer + calibration loop

Audit on 2026-06-26 found the trade path was inert in a load-
bearing way — the BSC fallback swap was a `WBNB.deposit()` no-op
(BNB → WBNB wrap, never to the target token), `amountOutMin=0`
allowed infinite slippage, no asset registry meant the agent
would happily try to swap into a placeholder address, and
positions had no TP/SL. The whole live trade path was a single
config flip away from catastrophic loss.

The post-audit work split into three layers: a **safety stack**
that gates every trade, a **complete position lifecycle** that
captures entry prices and realizes PnL on close, and a
**calibration loop** that turns the system from "we ship and
hope" into "we ship and measure".

### Safety stack (services/treasury/)

Three new modules, all under `services/treasury/`:

- **`asset-registry.ts`** — coingeckoId → per-chain verified
  token address + liquidity floors. BSC mainnet only (BTCB, ETH);
  L1s (SOL/SUI/ZEC) deliberately omitted. The registry is the
  single source of truth for what's safe to trade live.
- **`risk.ts`** — `evaluateTradeRisk()` runs every gate in order
  before the swap is signed. The kill switch
  (`TRADING_ENABLED=false` default), asset-registry membership,
  BSC chainId === 56 check, treasury balance preflight (covers
  amountIn + 0.005 BNB gas), position-count caps, on-chain TVL
  floor, and CMC 24h-volume floor. Failure on any gate forces
  paper mode; the signal still ships to Telegram.
- **`quote.ts`** — `getQuote()` reads the PancakeSwap V2 router's
  `getAmountsOut` and computes `amountOutMin = quote × (1 −
slippageBps/10000)`. `getPoolTvlUsd()` reads the pair's
  reserves directly from the LP contract. Both are mainnet-only
  by design.
- **`swap.ts`** — `openSwap()` does
  `router.swapExactETHForTokens` with the quoted `amountOutMin`
  (replacing the old WBNB-wrap no-op). `closeSwap()` does
  `swapExactTokensForETH` for the wallet's full balance with a
  per-trade approval (no max-uint blast radius).

The risk gate runs in `execution/loop.ts` before `signAndSend`.
Every trade goes through it; bypass requires editing the call site.

### Position lifecycle (treasury.ts)

`recordTrade` now writes the full position row at open:

- `entry_price_usd` from CoinGecko historical at swap time
- `take_profit_price` + `stop_loss_price` from
  `computeTpSlLevels(entryPrice, conviction, side)` — TP is
  conviction-scaled (+15% base, +33bps per conviction-point
  above 70, clamped ±10pp), SL is fixed (−7%).

`closePositionById(id, exitPrice, reason)` is the new close
path, called by both the TP/SL scheduler and the
`POST /admin/positions/:id/close` admin endpoint. It:

1. Looks up the position, asset, chain, entry data
2. Decides paper vs live: paper if the open was paper
   (`0xpap` tx hash prefix), live if `TRADING_ENABLED` + registry
   match
3. For live closes, calls `closeSwap()` — real on-chain reverse
   swap with bounded `amountOutMin`
4. Always updates `positions` row with `exit_price_usd`,
   `pnl_usd`, `pnl_pct`, `closed_at`, `exit_tx_hash`

A swap failure is logged but does NOT block the bookkeeping
update — better to record the intent + alert the operator than
leave a position in limbo.

The scheduler's `checkTakeProfitStopLoss()` runs every 5
minutes. It uses CoinGecko per-asset prices (was a broken
WBNB→USDC router query before) and now actually closes
positions on hit instead of just alerting. A
`backfillMissingTpSl()` pass at the top of every tick is the
self-healing path for positions that opened before the at-open
TP/SL writes landed.

### Calibration loop (scorecard.ts + /calibration page)

The original scorecard had `bySignalType` (hit-count per
detector) and `byWatchlist` (hit-count per repo). Neither
answered the "is conviction predictive?" question.

`scorecard.ts` now adds:

- **`byConvictionBand`** — six buckets (0-29 noise → 90-100
  maximum). Per band: total scored, traded, hit ratio, avg
  directional pct change at T+1h/T+1d/T+7d. The pct change is
  sign-flipped for short trades so positive = trade was right
  regardless of long/short.
- **`bySignalType` enriched** — adds the same avg directional
  pct change per outcome window per detector. Lets us see
  which detectors carry predictive weight vs. which are noise.

Both surfaces are public on `/scorecard`. The dedicated
`/calibration` page is the long-form narrative — how to read
the table, what well-calibrated vs poorly-calibrated looks
like, the open questions.

Two strategy adjustments shipped alongside the measurement
surface:

- **`CONVICTION_THRESHOLD` 70 → 80** — cohort 1 ran 0% win
  rate at 70+; raise floor while measuring.
- **`MIN_COMMIT_AGE_MINUTES = 30`** — commits younger than the
  settling window are skipped this tick and re-evaluated next.
  Tests the "already priced in" hypothesis for cohort 1's
  negative T+1h avg.

See [`CALIBRATION.md`](./CALIBRATION.md) for the per-knob
empirical rationale and the change log.

### Storytelling surfaces

Three public pages frame the system for non-technical readers:

- **`/methodology`** — top-to-bottom: what we watch, all 8
  detectors with examples, how the agent scores, every safety
  gate in plain English, position lifecycle, why paper-trade
  first. The "we are here on the maturity arc" reference.
- **`/calibration`** — the live measurement table + an
  honest "early sample" warning when n is small.
- **`/scorecard`** — now leads with a "We are here:
  observation phase" banner that frames the raw numbers in
  context (paper trades, observation phase, conditions for
  going live).
- **`/signals/[id]`** — new VerdictCard between the outcomes
  block and the proof chain. "Agent called LONG at 82/100,
  expected price up. Price moved −0.78% at t+1d. Verdict:
  agent was wrong."

The Telegram editorial pass (hourly heartbeat, signal
broadcasts, sub-threshold, TP/SL hit, daily report) uses the
same verdict-forward voice — every dispatch leads with the
agent's call, not infrastructure status.

### What's open

- **Real on-chain validation of the live path.** The safety
  scaffolding exists; the first-live-trade dry run (documented
  in [`RUNBOOK.md`](./RUNBOOK.md)) hasn't been executed because
  it requires moving real funds + flipping production env.
- **Asset registry expansion.** BTC + ETH only today. Adding
  LINK / UNI / CAKE / etc. is one entry per asset after
  BscScan verification.
- **Rubric v2.** Hypothesis: the agent's 80+ band still won't
  outperform if the rubric weights the wrong inputs. The
  calibration loop will surface this within 2-4 weeks of data;
  the response will be a versioned rubric bump (file swap, no
  code change).
