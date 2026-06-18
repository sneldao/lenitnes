# Calibration

> Why the magic numbers are what they are. Day 13.

This doc tracks the empirical basis (or lack thereof) for the
tunable knobs in the agent + treasury pipeline. Every entry
should answer three questions:

1. What's the default?
2. Why that number specifically?
3. What evidence do we have to back it up?

If a row's "Evidence" column is "MVP default", the number was
picked because we needed to ship something, not because the
backtest data supported it. A future calibration pass should
fill those rows in.

## Knobs in scope

| Env var                        | Default    | Used in                            | Status        |
| ------------------------------ | ---------- | ---------------------------------- | ------------- |
| `CONVICTION_THRESHOLD`         | `70`       | execution/loop.ts · seed/demo.ts   | MVP default   |
| `DAILY_AGENT_BUDGET_USD`       | `100`      | services/agent.ts (live path only) | MVP default   |
| `AGENT_INPUT_COST_PER_1M_USD`  | `0.60`     | services/agent.ts                  | Vendor-listed |
| `AGENT_OUTPUT_COST_PER_1M_USD` | `2.50`     | services/agent.ts                  | Vendor-listed |
| `TREASURY_DEFAULT_AMOUNT`      | `0.01`     | execution/loop.ts · seed/demo.ts   | MVP default   |
| `TREASURY_SLIPPAGE_BPS`        | `50`       | execution/loop.ts · seed/demo.ts   | Industry std  |
| `TREASURY_DEFAULT_CHAIN`       | `arbitrum` | execution/loop.ts                  | MVP default   |
| `MOCK_AGENT`                   | unset      | services/agent.ts                  | N/A           |

---

## `CONVICTION_THRESHOLD` — default `70`

**Used by**: `apps/api/src/execution/loop.ts:280`,
`apps/api/src/seed/demo.ts:255`

**Behavior**: A signal's agent verdict is a conviction score
0-100. Above this threshold, the signal commits a paper or live
trade; below it, the verdict is still persisted (in
`agent_scores`) but produces no trade.

**Why 70**: It felt right at the time of the Day 5 pivot. The
top end (100) is "I'm certain"; the bottom (0) is "I have no
opinion". 70 is "I'm fairly confident". That intuition matches
what a Bayesian would do — set the threshold at the point where
the expected value of acting exceeds the expected value of
ignoring, weighted by the score distribution.

**Why not 50 / 60 / 80**: Lower thresholds trade more often
(more data, more fees, more signal-to-noise to filter). Higher
thresholds trade rarely (fewer trades, less data). 70 is a
middle-of-the-road choice that biases toward precision over
recall — better to miss a few signals than to false-positive
on noise.

**Evidence we don't have yet**: The current
`/backtest/stats` endpoint computes hit ratio per detector and
per asset, but only against the 3 demo signals. There's no
calibration data for "what threshold maximizes hit ratio over
the actual signal distribution". The full backtest engine
exists; it just needs more data to feed.

**When to change**: After we have ~30 days of live (or paper)
trades, run `/backtest/process` and plot hit ratio vs
threshold. The optimal will likely be in the 65-80 range; if
the data clearly favors a different value, change the default.

**How to change**: `CONVICTION_THRESHOLD=75` in `.env`. No
restart of the worker needed if the env is read per-process;
otherwise `docker compose restart api worker`.

---

## `DAILY_AGENT_BUDGET_USD` — default `100`

**Used by**: `apps/api/src/services/agent.ts:182` (live path only;
MOCK bypasses per Day 13)

**Behavior**: Hard circuit-breaker on the daily LLM spend. If
the cumulative `estimatedUsd` of all live calls in the current
UTC day exceeds this number, the next call throws
`AgentBudgetExceededError` and the signal is recorded but no
trade fires.

**Why 100**: An upper bound that's high enough to not be the
bottleneck on a normal day, low enough that a runaway loop
can't drain the wallet overnight. With Kimi K2 at $0.60/M input
and $2.50/M output (the defaults), 100 USD ≈ 150K output tokens
or 30-40 average agent calls. Above 5 calls/minute sustained,
the cap would trip.

**Why not 50 / 200**: 50 is too tight for a backtest day (we
saw 12 calls during a 60-second seed:demo in testing). 200 is
plenty for normal ops but masks runaway loops for too long.

**Evidence**: Kimi K2 pricing from the Virtuals dashboard.
Actual cost data from a 7-day window is in `/admin/status`
(`agent.dailySpendUsd` field).

**When to change**: After we have actual cost telemetry, set
this to 2x the 95th-percentile daily spend. Anything tighter
risks tripping on legitimate bursts.

---

## `TREASURY_DEFAULT_AMOUNT` — default `0.01`

**Used by**: `apps/api/src/execution/loop.ts` (per-trade size
in the tokenIn currency), `seed/demo.ts`

**Behavior**: The amount of tokenIn (USDC on Arbitrum/RH, BEP-20
USDC on BSC) used per paper or live trade.

**Why 0.01**: $0.01 per trade is small enough that a bad model
with a $100 treasury can survive 10,000 bad trades before going
broke. That's enough margin to debug without panicking. It's
also small enough that 100 bad trades only cost $1 — feedback
loop is short, mistakes are cheap.

**Why not 1.00 / 0.10**: 1.00 means a single bad day could
wipe a $100 treasury, which is too aggressive for a system
without a calibration loop yet. 0.10 is closer to a "real"
trade size but still burns through treasury 10x faster than
0.01, and we don't yet have the data to justify the size.

**Evidence we don't have yet**: There's no per-trade Sharpe /
win-rate data with a fixed `defaultTradeAmount`. The demo seed
records the `tx_hash` but doesn't include position sizing. A
future calibration pass would paper-trade at multiple sizes
and pick the one with the best risk-adjusted return.

**When to change**: Once the model has a real hit rate (i.e.,
after the backtest process has run against ≥30 signals), use
Kelly-criterion position sizing instead of a flat amount.
Until then, 0.01 is the safe number.

**Caveat**: On testnets, USDC has no real value, so this
number is purely about _behavior_ (does the trade path work)
not _risk_ (will we lose money). On mainnet, this is the
single most important knob and should be re-evaluated with
real P&L data.

---

## `TREASURY_SLIPPAGE_BPS` — default `50` (0.5%)

**Used by**: treasury swap routing on every chain

**Behavior**: Maximum slippage tolerance (in basis points) for
the on-chain swap. If the actual execution price moves more
than 0.5% from the quoted price, the transaction reverts.

**Why 50 bps**: Industry-standard default for low-cap / mid-cap
tokens on testnet AMMs. PancakeSwap V2 on BSC testnet and
Uniswap V3 on Arbitrum Sepolia both consistently fill at ≤0.3%
slippage on $0.01 trades; 50 bps gives comfortable headroom
without giving up too much on volatile pairs.

**Why not 30 / 100**: 30 bps is the floor of typical retail
trader tolerance; tighter than this and you'll see reverts on
any volume above dust. 100 bps (1%) is what you'd use for low-
liquidity long-tail tokens; for our testnet pairs (USDC ↔
WBNB, USDC ↔ WETH) it's over-conservative and signals we don't
understand the market we're trading in.

---

## `TREASURY_DEFAULT_CHAIN` — default `arbitrum`

**Used by**: every signal-derived trade selects this chain when
the agent's `recommended_action` doesn't specify otherwise.

**Why Arbitrum**: Arbitrum Sepolia is where the original
`SignalRegistry` was deployed. The BSC + Robinhood tracks were
added later (Day 5, BNB pivot). Defaulting to Arbitrum keeps
the demo seed's signal+trade+proof linkage deterministic.

**For the BNB Hack (June 22-28)**: Override with
`TREASURY_DEFAULT_CHAIN=bnb`. The treasury routes BSC trades
through TWAK (self-custody signing).

---

## What we're NOT tracking here (intentionally)

- **Model selection** (`AGENT_MODEL`) — vendor decision, not a
  calibration knob
- **Per-detector weights** — none currently exposed; the
  detector pipeline is keyword-based, not weighted
- **Treasury wallet selection** — single system wallet per chain
  in this build; multi-wallet logic is a post-pivot feature
- **Time-of-day / day-of-week effects** — not modeled; the
  signal pipeline runs on every check's `frequency_seconds`
  regardless of clock time

---

## Calibration process (proposed, not yet implemented)

When we have ≥30 days of live data:

1. `npm run backtest:process` to recompute outcomes
2. Plot `hit_ratio(threshold)` for thresholds 50-90 in steps
   of 5
3. Plot `sharpe(amount)` for trade sizes 0.01, 0.05, 0.1, 0.5,
   1.0 (using Kelly criterion on the per-asset win rate)
4. Update the defaults above from the empirical optimum
5. Re-run the demo seed; verify the new defaults don't
   regress the scorecard (the integration test in
   `tests/scorecard-integration.test.ts` is the regression
   net)

Until then, every row marked "MVP default" is a placeholder.
