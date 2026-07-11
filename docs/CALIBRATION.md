# Calibration

> Why the magic numbers are what they are. Originally Day 13; live
> calibration loop added 2026-06-26.

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

**The live calibration loop is now on the public scorecard.** See
the [`/calibration`](https://lenitnes.persidian.com/calibration)
page — it slices outcomes by conviction band so we can see
whether higher conviction actually predicts better outcomes.
Every change to the defaults below is followed by a measurement
window before the next change.

## Knobs in scope

| Env var                        | Default    | Used in                            | Status                          |
| ------------------------------ | ---------- | ---------------------------------- | ------------------------------- |
| `TRADING_ENABLED`              | `false`    | services/treasury/risk.ts          | Hard gate (kill sw.)            |
| `CONVICTION_THRESHOLD`         | `70`       | execution/loop.ts                  | Empirical (reverted 2026-07-07) |
| `MIN_COMMIT_AGE_MINUTES`       | `30`       | execution/loop.ts                  | Hypothesis-driven               |
| `MAX_CONCURRENT_POSITIONS`     | `5`        | services/treasury/risk.ts          | Risk cap                        |
| `MAX_PER_ASSET_POSITIONS`      | `1`        | services/treasury/risk.ts          | Concentration cap               |
| `POSITION_TAKE_PROFIT_BPS`     | `1500`     | services/treasury/risk.ts          | MVP default                     |
| `POSITION_STOP_LOSS_BPS`       | `700`      | services/treasury/risk.ts          | MVP default                     |
| `DAILY_AGENT_BUDGET_USD`       | `20`       | services/agent.ts (live path only) | MVP default                     |
| `AGENT_INPUT_COST_PER_1M_USD`  | `0.60`     | services/agent.ts                  | Vendor-listed                   |
| `AGENT_OUTPUT_COST_PER_1M_USD` | `2.50`     | services/agent.ts                  | Vendor-listed                   |
| `TREASURY_DEFAULT_AMOUNT`      | `0.01`     | execution/loop.ts                  | MVP default                     |
| `TREASURY_SLIPPAGE_BPS`        | `50`       | execution/loop.ts                  | Industry std                    |
| `TREASURY_DEFAULT_CHAIN`       | `arbitrum` | execution/loop.ts                  | MVP default                     |
| `MOCK_AGENT`                   | unset      | services/agent.ts                  | N/A                             |

---

## `TRADING_ENABLED` — default `false`

**Used by**: `apps/api/src/services/treasury/risk.ts:67`

**Behavior**: Master kill switch. Even with `TREASURY_MODE=live`
configured, no live swap fires unless this is also true. The
risk gate downgrades every trade to paper mode otherwise.

**Why default false**: The system ships safe — flipping a single
flag should never go live by accident. Production operators must
explicitly opt in via env. The [RUNBOOK](./RUNBOOK.md) documents
the dry-run procedure for the first live trade.

**When to enable**: Only after the
[`/calibration`](https://lenitnes.persidian.com/calibration) page
shows higher conviction = better outcomes for a meaningful sample
(target: n ≥ 30 closed trades total, with avg T+1d rising as
conviction rises band-over-band — not just the top band positive
in isolation).

---

## `CONVICTION_THRESHOLD` — default `70`

**Used by**: `apps/api/src/execution/loop.ts:406`

**Behavior**: A signal's agent verdict is a conviction score
0-100. Above this threshold, the signal commits a paper or live
trade; below it, the verdict is still persisted (in
`agent_scores`) but produces no trade.

**History**: 70 → 80 on 2026-06-26 (see below) → **back to 70 on
2026-07-07**. The 80 experiment is inconclusive, not vindicated:
the cohort that motivated it (raised on a 5-trade sample) never
grew past a handful of trades before the pipeline stalled for an
unrelated reason — a scheduler bug excluded any monitor that had
ever fired from being checked again (fixed 2026-07-07), so most
watched repos silently stopped producing signals for over a
week. There was never a real 20+ trade cohort at 80 to judge.

**Why revert instead of re-measure at 80**: rubric v4 (also
shipped 2026-07-07) is a bigger lever than the threshold —
book discipline, a commit-citation requirement, and a hard cap
of 65 on news-only signals change what a given conviction score
_means_. Measuring the old threshold question against the new
rubric would conflate two variables. 70 is the floor the rubric
itself defines as "trade candidate" (see rubric-v4.md
Calibration section); re-running the threshold experiment (if
still warranted) should happen after v4 has its own clean
cohort.

**Original 2026-06-26 rationale** (kept for the record): The
first conviction cohort ran at the 70 floor for 5 trades and
closed at 0% win rate with avg T+1h ≈ −0.5% — 4 of 5 trades in
the 80-82 band, 1 in 70-79, both negative. Raising to 80 was the
conservative move pending more data.

**Live measurement**: The `/calibration` page's conviction-band
table is the source of truth, and it now shows a matured-outcome
denominator (`closed`) instead of counting pending trades as
misses — see the 2026-07-07 change-log entries below. Watch it
accumulate a real v4-era cohort before touching this knob again.

---

## `MIN_COMMIT_AGE_MINUTES` — default `30`

**Used by**: `apps/api/src/execution/loop.ts:171` (github-direct
enrichment path)

**Behavior**: Commits whose author timestamp is younger than
this window are filtered out before the agent sees them. The
monitor's `last_seen_commit_hash` is advanced only to the newest
SETTLED commit, so the unsettled commits get re-evaluated on the
next tick once they age past the cutoff.

**Why 30 minutes**: Hypothesis-driven, no hard data yet. The
observation from cohort 1 was that the agent's high-conviction
calls landed AFTER the market had digested the news — avg T+1h
−0.5% across the 5 trades. Three plausible explanations:

1. **Agent miscalibration** — the rubric overrates commits the
   market doesn't care about (testable by waiting longer).
2. **Already priced in** — the news enters the market via the
   commit itself, gets priced within minutes, and the agent
   fires after the move (testable by waiting).
3. **Genuine random noise** — too small a sample, no signal,
   just bad luck (testable by collecting more data).

The 30-minute settling delay tests explanation #2 directly. If
T+1h avg pct improves visibly after the delay lands, the
"priced in" hypothesis was right; if it stays the same, we move
on to #1 or #3.

**Why not 5 / 60 / 120 minutes**: 5 min is too short to filter
flash moves. 60+ min cuts too many high-velocity signals
(emergency patches that hit in waves). 30 min is the
compromise.

**When to change**: If the calibration loop shows visible
improvement, tighten toward 60+ min. If outcomes don't move,
the delay isn't the issue — return to 0 and focus on the
rubric.

---

## `MAX_CONCURRENT_POSITIONS` — default `5`

**Used by**: `apps/api/src/services/treasury/risk.ts:84`

**Behavior**: Hard ceiling on open positions. The risk gate
refuses any new live trade if the current open-position count
is ≥ this value. Existing open positions are unaffected.

**Why 5**: With `TREASURY_DEFAULT_AMOUNT=0.01` BNB per trade,
5 concurrent open positions = 0.05 BNB at risk. At $500 BNB,
that's $25 — small enough that a worst-case 100% loss is
recoverable, large enough to actually carry useful sample data.

**Why not 3 / 10 / 20**: 3 is too tight; if signals cluster
(e.g., an exchange announces a vuln and multiple chains patch
at once), we'd miss real opportunities. 10+ exposes more
capital than the current calibration justifies.

**When to change**: After the calibration loop matures, scale
with confidence. A proven 80+ band should justify 10. A
mature track record (n ≥ 100, Sharpe > 1) justifies 20+.

---

## `MAX_PER_ASSET_POSITIONS` — default `1`

**Used by**: `apps/api/src/services/treasury/risk.ts:99`

**Behavior**: At most one open position per asset (e.g., BTC).
A second high-conviction BTC signal while the first BTC trade
is open routes to paper mode instead.

**Why 1**: Concentration risk. If the agent fires three BTC
signals in a row, all three would be the same directional bet
on the same underlying. Stop-loss correlation is 100% — they
all win or all lose together. One position per asset is the
structural fix.

**Why not 2 / 3**: 2+ allows dollar-cost-averaging into a
thesis, which can be useful but introduces complexity around
position sizing and TP/SL averaging that we haven't designed
for. 1 is the simplest invariant.

**When to change**: Only after we've designed (a) how multiple
positions in the same asset share TP/SL, and (b) what the close
order is when one TP triggers but others haven't. Not a 2026
problem.

---

## `POSITION_TAKE_PROFIT_BPS` — default `1500` (15%)

**Used by**: `services/treasury/risk.ts:computeTpSlLevels`

**Behavior**: Default take-profit in basis points above the
entry price for long positions (below for shorts). The actual
level written at open is conviction-scaled — see the formula
below.

**Why 15%**: Crypto markets are volatile enough that 5-10% TP
gets hit on noise alone; 25%+ rarely triggers within the holding
window. 15% is in the "real move" band.

**Conviction scaling**: TP = base + tilt where tilt = (conviction
− 70) × 33 bps, clamped to ±10pp. So:

- Conviction 70 → +15.0% TP
- Conviction 80 → +18.3% TP
- Conviction 90 → +21.6% TP
- Conviction 100 → +25.0% TP

Higher conviction = wider TP because the agent is signaling
"this should run further".

**When to change**: After we have realized P&L data, look at
the distribution of t1d/t7d pct changes for actual hits. If the
median winner is +8%, 15% TP is leaving money on the table; if
+25%, we're cutting winners short.

---

## `POSITION_STOP_LOSS_BPS` — default `700` (7%)

**Used by**: `services/treasury/risk.ts:computeTpSlLevels`

**Behavior**: Fixed stop-loss percentage below entry (above for
shorts). Not conviction-scaled — confidence shouldn't widen the
maximum loss.

**Why 7%**: The first cohort's one closed trade (ETH long, June 2026) hit exactly the SL at −7.15%. That's the system working
as designed: a thesis that doesn't pan out should be cut at a
known maximum loss, not held forever hoping for reversal.

**Why not 5 / 10**: 5% gets stopped out on routine volatility.
10% lets losers run too long; if a thesis is wrong, it's wrong
within a few percent of entry. 7% is the typical "this trade
didn't work" boundary in crypto.

**When to change**: If the data shows we're getting SL'd at the
local low (price reverses immediately after stop), widen to 9%.
If SL is consistently late (positions go −15% before triggering),
the price oracle latency is the issue, not the SL level.

---

## `DAILY_AGENT_BUDGET_USD` — default `20`

**Used by**: `apps/api/src/services/agent.ts` (live path only;
MOCK bypasses per Day 13)

**Behavior**: Hard circuit-breaker on the daily LLM spend. If
the cumulative `estimatedUsd` of all live calls in the current
UTC day exceeds this number, the next call throws
`AgentBudgetExceededError` and the signal is recorded but no
trade fires.

**Why 20**: An upper bound that's high enough to not be the
bottleneck on a normal day, low enough that a runaway loop
can't drain the wallet overnight. With Kimi K2 at $0.60/M input
and $2.50/M output (the defaults), $20 ≈ 30K output tokens or
6-8 agent calls. Above 1 call/minute sustained, the cap trips.

**Why not 10 / 50 / 100**: 10 is too tight for a backtest day
(seed:demo can hit it). 50+ is plenty for normal ops but masks
runaway loops for too long.

**Evidence**: Kimi K2 pricing from the Virtuals dashboard.
Actual cost data is in `/admin/status` (`agent.dailySpendUsd`).

**When to change**: After we have actual cost telemetry over a
2-week window, set this to 2× the 95th-percentile daily spend.

---

## `TREASURY_DEFAULT_AMOUNT` — default `0.01`

**Used by**: `apps/api/src/execution/loop.ts` (per-trade size
in native chain units, e.g. BNB on BSC)

**Behavior**: The amount of native gas-token (BNB on BSC) swept
into the target asset per trade. The actual amount received
depends on the slippage-adjusted quote.

**Why 0.01**: 0.01 BNB ≈ $5 at $500 BNB. Small enough that a
$50 wallet survives 10 bad trades before going broke. The
balance preflight in the risk gate refuses any trade where
balance < `amountIn + 0.005 BNB` (gas buffer), so this is the
floor; raising it raises the funding requirement.

**Why not 0.001 / 0.05 / 0.1**: 0.001 (~$0.50) is below
PancakeSwap min-out viability for most pairs. 0.05+ means a
single bad day could meaningfully draw down a $50 wallet, which
is too aggressive for the current calibration stage.

**Evidence we don't have yet**: There's no per-trade Sharpe /
win-rate data with a fixed `defaultTradeAmount`. A future
calibration pass should run paper trades at multiple sizes and
plot risk-adjusted return.

**When to change**: Once the model has a mature hit rate
(n ≥ 30 in the 80+ band), Kelly-criterion sizing replaces this
fixed amount. Until then, 0.01 BNB is the safe number.

---

## `TREASURY_SLIPPAGE_BPS` — default `50` (0.5%)

**Used by**: treasury swap routing (BSC PancakeSwap V2)

**Behavior**: Maximum slippage tolerance (in basis points). The
risk gate's quote step computes `amountOutMin = quote × (1 −
slippageBps/10000)` and refuses any swap that wouldn't meet it.
Previously this defaulted to 0 (infinite slippage); the audit
overhaul fixed that.

**Why 50 bps**: Industry-standard default for low-cap / mid-cap
tokens on AMMs. PancakeSwap V2 mainnet fills BTCB / ETH against
WBNB consistently at ≤0.3% slippage on small trades; 50 bps
gives comfortable headroom without giving up too much on
volatile pairs.

**Why not 30 / 100**: 30 bps is the floor of retail tolerance;
tighter than this and you'll see reverts on any volume above
dust. 100 bps (1%) is for low-liquidity long-tail tokens; for
our registry (BTC, ETH only) it's over-conservative.

---

## `TREASURY_DEFAULT_CHAIN` — default `arbitrum`

**Used by**: every signal-derived trade selects this chain when
the agent's `recommended_action` doesn't specify otherwise.

**Why Arbitrum**: Arbitrum Sepolia is where the original
`SignalRegistry` was deployed. The BSC + Robinhood tracks were
added later (Day 5, BNB pivot). Defaulting to Arbitrum keeps
the demo seed's signal+trade+proof linkage deterministic.

**For BSC live trading**: Override with
`TREASURY_DEFAULT_CHAIN=bnb`. The treasury routes BSC trades
through TWAK (self-custody signing) or falls back to a direct
PancakeSwap V2 swap via the system wallet.

**Note**: The asset registry currently only has BSC mainnet
entries (BTCB, ETH). Trades on Arbitrum / Robinhood will
downgrade to paper because no registry asset matches those
chains.

---

## What we're NOT tracking here (intentionally)

- **Model selection** (`AGENT_MODEL`) — vendor decision, not a
  calibration knob
- **Per-detector weights** — none currently exposed; the
  detector pipeline is keyword-based, not weighted. Predictive
  weight per detector is measured post-hoc on the
  `/calibration` page's "by detector" table.
- **Treasury wallet selection** — single system wallet per chain
  in this build; multi-wallet logic is a post-pivot feature
- **Time-of-day / day-of-week effects** — not modeled; the
  signal pipeline runs on every check's `frequency_seconds`
  regardless of clock time

---

## The calibration loop (live)

When this doc was originally written (Day 13), there was no
calibration data — every knob was an "MVP default". The
post-audit work added a live measurement surface so we can
update the defaults from real data instead of intuition.

The loop:

1. **Measure** — every above-threshold signal lands in
   `agent_scores`; every traded signal lands in `orders`;
   T+1h/T+1d/T+7d outcomes auto-recorded in `signal_outcomes`
   by the 6-hour backtest cron.

2. **Read** — the `/calibration` page reads back from the same
   tables and shows hit ratio + avg directional pct change by
   conviction band and by detector. It also surfaces a **90-day
   replay responsiveness** table (`GET /backtest/responsiveness`)
   — which watchlist repos' commit signals historically predicted
   price (mock agent by default; live agent with admin key).
   Sweeps run as a **background job** (worker cron every 6h + warm
   on API boot); HTTP returns 202 while pending, 200 when cached
   (30m TTL, Redis-backed price series cache 7d).

3. **Diagnose** — if avg T+1d in the 80-89 band trends
   negative over n ≥ 20, the rubric needs work. If it trends
   positive but lower than 90-100, the threshold is too loose.
   If a specific detector shows avg +0% across 20+ signals,
   that detector is noise; consider weighting it down.

4. **Adjust** — change one default at a time, ship it, wait at
   least a week before reading the change. Document the rationale
   in this file (a new row in the change log below).

---

## Historical responsiveness (replay sweep)

Before expanding the watchlist or tuning the rubric on intuition,
run the **commit→price responsiveness** sweep. It reuses the live
detector pipeline + replay engine over each commit-level watchlist
repo's last 90 days of public history, attaches matured T+1d/T+7d
price outcomes, and ranks repos by directional hit rate and avg
return.

**Surfaces:**

- **`GET /backtest/responsiveness`** — JSON profiles (public,
  mock agent; `X-Admin-Key` for live LLM scoring). Background
  sweep; 202 while pending, 30m cache when ready.
- **`GET /backtest/tiers`** — A/B/C tier list derived from the
  latest sweep (A = expand agent spend, C = deprioritize).
- **`/calibration`** — same data in the "Repo responsiveness"
  table (tier column + tooltips).
- **CLI** — `MOCK_AGENT=1 npx tsx apps/api/scripts/run-responsiveness-sweep.ts`
  (requires `GITHUB_TOKEN` in env; ~3 min for 7 repos).

**How to read it:**

- **flagged days** — UTC day-batches where ≥1 detector fired.
  High count ≠ alpha; bitcoin flags often, rarely trades well.
- **trade-grade** — mock-agent calls at conviction ≥ 70 (cap 8
  scored batches per repo). Live-agent sweep differs; use admin
  key when evaluating rubric changes.
- **Hit T+7d vs T+1d** — disclosure-lag theses (security
  emergencies) resolve over days; prefer T+7d for those event
  classes. T+1d is the live scorecard's canonical window.
- **Avg dir T+7d** — sign-adjusted for long/short; positive
  means commit signals on average pointed the right way.

**First sweep (2026-07-11, mock agent, 90d):** Sui and Solana
(agave) showed the strongest T+7d directional averages; Bitcoin
the weakest (0% T+7d hit, negative avg). Zebra had strong T+1d
(63%) but weaker T+7d (29%) — consistent with pricing the
emergency before the disclosure drawdown fully lands.

**Repo tier list (same sweep, heuristic v1):**

| Tier  | Repos                                                                      | Action                                                    |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| **A** | MystenLabs/sui, anza-xyz/agave                                             | Prioritize live-agent scoring; allow T+7d outcome windows |
| **B** | zcash/halo2, ZcashFoundation/zebra, ethereum/go-ethereum, paradigmxyz/reth | Monitor; sequence_context wired (Zcash stack pilot)       |
| **C** | bitcoin/bitcoin                                                            | Deprioritize — high flag rate, weak price co-movement     |

Tier rules live in `apps/api/src/services/domain/repo-tiers.ts`
(≥50% T+7d hit or strong T+1d + positive T+7d drift → A;
both T+1d and T+7d below 35–40% → C).

**CoinGecko reliability (2026-07-11):** Optional `COINGECKO_API_KEY`
raises rate limits; price series cached in Redis (7d) + in-memory
(24h); replay sweeps prefetch one range per asset (no per-batch
fallback calls); request pacing 4.5s (free) / 1.2s (key).

**Sequence context (Phase 2 pilot):** Static sector graph in
`domain/sector-graph.ts`; `sequence_context` injected on live scores
and replay batches (upstream→downstream chain, 7d lookback). Zcash
stack: halo2 → zebra → zcash.

**Signal fidelity (same release):** GitHub list API omits diff
stats; live + replay now call `enrichCommitStats()`. Outcome
learning uses direction-adjusted hits via `domain/outcome-metrics.ts`.

## Change log

| Date       | Change                                                                               | Reason                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-26 | `CONVICTION_THRESHOLD` 70 → 80                                                       | Cohort 1 (5 trades) ran 0% win rate at 70+; raise floor while measuring more                                                                                                                                                                                                                                                         |
| 2026-06-26 | `MIN_COMMIT_AGE_MINUTES` new, default 30                                             | Hypothesis: cohort 1 fired on news already priced in within the hour                                                                                                                                                                                                                                                                 |
| 2026-06-26 | `TRADING_ENABLED` new, default false                                                 | Master kill switch — every live trade requires explicit opt-in                                                                                                                                                                                                                                                                       |
| 2026-06-26 | `MAX_CONCURRENT_POSITIONS=5`, `PER_ASSET=1` new                                      | Concentration + risk caps                                                                                                                                                                                                                                                                                                            |
| 2026-06-26 | `POSITION_TAKE_PROFIT_BPS=1500`, `STOP_LOSS_BPS=700` new                             | TP/SL levels written at position open, conviction-scaled                                                                                                                                                                                                                                                                             |
| 2026-06-26 | `TREASURY_SLIPPAGE_BPS=50` enforced via real quote                                   | Previous `amountOutMin=0` allowed infinite slippage                                                                                                                                                                                                                                                                                  |
| 2026-07-07 | `CONVICTION_THRESHOLD` 80 → 70 (reverted)                                            | The 80 experiment never got a real cohort — a scheduler bug (fixed same day) stranded any monitor that had ever fired, so signal volume collapsed for over a week. Reverting rather than re-measuring at 80 because rubric v4 (same day) changes what conviction means anyway                                                        |
| 2026-07-07 | Rubric v3 → v4                                                                       | Adds `book_context` (no pile-ons, no evidence-free reversals), commit-citation requirement (thesis must cite the SHA or conviction ≤ 50), and a hard cap of 65 on news-only signals — the operation's edge is commits, not headlines                                                                                                 |
| 2026-07-07 | Scheduler + worker: include `status='triggered'` in due-monitor queries              | A monitor that fires is marked 'triggered' and only resets to 'active' on its _next_ check — but both the scheduler's enqueue query and the worker's job lookup filtered to 'active' only, so any monitor that had ever fired was never checked again. Root cause of the commit pipeline going silent after the initial signal burst |
| 2026-07-07 | Scorecard: cumulative P&L / drawdown from the positions ledger, not raw price deltas | The scorecard was summing `price_after − price_at_signal` across every T+1d outcome row — unsized, not direction-adjusted, counting signals never traded on. A $400 BTC daily move showed as −$400 "P&L" on a 0.01-unit paper position. Now reads realized, direction-aware `pnl_usd` from `positions`                               |
| 2026-07-07 | Scorecard/calibration: hit-ratio denominators now `withT1d`/`closed`, not `total`    | Signals with no matured T+1d outcome were counted as misses ("0/47"). All three breakdowns (detector, watchlist, conviction band) now expose the matured-outcome count separately; frontend renders "—" until data exists                                                                                                            |
| 2026-07-07 | `signals.asset` column added; narrative-scan signals now resolve a price             | Outcome attribution resolved the asset from the _monitor_ row, and `narrative:portfolio` has no fixed coingeckoId — 47 news-era signals were permanently unpriceable. The narrative scan now writes its dominant asset onto the signal row directly                                                                                  |
| 2026-07-07 | Agent invariant clamp: `action=none` + conviction > 50 + empty book → capped at 50   | The model occasionally violated its own rubric invariant (observed live: conviction 88, action "none", flat book). That combination is only legitimate when the book already expresses the thesis                                                                                                                                    |
| 2026-07-11 | GitHub commit stats enrichment (`enrichCommitStats`) on live + replay paths          | List API omits diff sizes; `emergency_patch` / `silent_merge` size gates were blind in production and backtest                                                                                                                                                                                                                       |
| 2026-07-11 | Direction-adjusted outcomes in `fetchOutcomeContext` + `refreshBacktestStats`        | Past-outcomes prompt counted `direction=up` as a win regardless of long/short; backtest stats used `ABS(pct_change)>1`. Centralized in `domain/outcome-metrics.ts`                                                                                                                                                                   |
| 2026-07-11 | `GET /backtest/responsiveness` + `/calibration` replay table                         | Empirical commit→price responsiveness ranking before watchlist expansion; one CoinGecko range prefetch per asset in replay to avoid 429s                                                                                                                                                                                             |
| 2026-07-11 | Background responsiveness sweep + Redis price cache + repo tiers + sequence_context  | Prod 429/timeouts on inline HTTP sweep; tier list turns measurement into spend policy; sector-chain context for Zcash pilot                                                                                                                                                                                                          |
