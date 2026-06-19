# LENITNES — BNB Hack Pivot (June 18-21)

> **Status:** Pivoted from Lepton Agents Hackathon to BNB Hack:
> AI Trading Agent Edition (BNB Chain × CoinMarketCap × Trust Wallet).
> $36k prize pool, deadline June 21, live trading week June 22-28.
> **Companion doc:** `AGENT_ARCHITECTURE.md` — frozen reference for
> agent ↔ detector ↔ threshold design.
>
> **BSC contracts deployed (June 18):**
>
> - SignalRegistry: `0x05177fa11543cEB73cb18883DFb49B17dc23C862`
> - TradeExecutor: `0xE2Ac333ad2BCD6A0389bf95a059fF576d13EbE8F`
> - PancakeSwap V2 Router: `0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD`
> - Deployer: `0x4dA649DeB07159E791C423bb139e6213e745D138`
> - Network: BSC Testnet (Chain 97)
> - Txs: `0x3c75…c1b47a` + `0xab20…02b7a`
> - TWAK wallet: `0xA1Dd482E4D6C8cf6f5f7BF80FEc6Bd3F11F5888a`
> - TWAK BNB Hack registration tx: `0x8bd8…cb025`
> - Paper trade test: ✅ BSC monitor → TinyFish → DB (June 19)

## Core Principles

The plan is built around these. Every task is tagged with the
principles it exercises. A task that exercises none is cut.

1. **ENHANCEMENT FIRST** — extend existing code before adding new code
2. **CONSOLIDATION** — delete user-facing surface that doesn't fit
3. **PREVENT BLOAT** — minimize new code; refactor old code rather
   than parallel-implement
4. **CLEAN SEPARATION** — `agent.ts` knows nothing about Telegram,
   trading, or the DB beyond its own score table
5. **PUBLIC SURFACE FIRST** — every day ends with something publicly
   visible, even if small
6. **DETERMINISM WHERE POSSIBLE** — sub-threshold agent scores persist;
   every score is auditable
7. **ZERO HEADCOUNT** — the operator is the agent; no users, no
   waitlist, no auth

## End-State Architecture

┌─────────────┐ ┌────────────┐ ┌──────────────┐
│ Watchlist │───▶│ TinyFish │───▶│ Detectors │
│ (5 seeded) │ │ (LLM #1) │ │ (8 rules) │
└─────────────┘ └────────────┘ └──────┬───────┘
│ fired?
▼
┌──────────────┐
│ Agent.ts │◀── CMC market context
│ (LLM #2) │ (Fear & Greed, global
│ Kimi K2 │ metrics, asset quotes)
└──────┬───────┘
│ conviction ≥ 70?
▼
┌─────────────────────┐
│ Treasury │
│ ├─ Arbitrum: ethers │
│ ├─ Robinhood: ethers│
│ └─ BSC: TWAK swap │
│ (self-custody) │
└─────────┬───────────┘
│
┌─────────▼───────────┐
│ Public Scorecard │
│ + Telegram │
│ + HCS+IPFS+Arbitrum │
└─────────────────────┘

Three chains. BSC is the live-trading venue for the BNB Hack
(June 22-28). Arbitrum Sepolia + Robinhood remain as demo surfaces.

Agent enriched with live CMC market data via Pro API or x402.
Treasury uses TWAK CLI for self-custody signing on BSC.

## BNB Hack Additions (June 18-20)

```
File                                    Action    Purpose
─────                                   ────────  ─────────────────────────────────────
apps/api/src/config.ts                  [modify]  Refactor evm.* → chains.{arbitrum,robinhood,bnb}
apps/api/src/services/evm/client.ts     [modify]  Add bnb chain config (BSC testnet, WBNB, PancakeSwap)
packages/types/src/index.ts             [modify]  Add 'bnb' to Chain union type
apps/api/src/services/evm/trade.ts      [modify]  Chain-agnostic via config; BSC deploy path
apps/api/src/execution/loop.ts          [modify]  Add CMC market_context to agent input
apps/api/src/services/agent/rubric-v1.md [modify]  Add market context section (Fear & Greed, funding, regime)

apps/api/src/services/twak.ts            [create]  TWAK CLI wrapper — swap, wallet, price, compete register
apps/api/src/services/cmc.ts            [create]  CMC Pro API — global metrics, quotes, formatMarketContext()
apps/api/src/services/cmc-x402.ts       [create]  x402 CMC data — pay $0.01 USDC/request on Base

apps/api/src/services/treasury.ts        [modify]  BSC live trades → TWAK swap; Arbitrum/Robinhood → ethers
db/seed/treasury_wallets.sql            [modify]  Add bnb treasury wallet row
.env.example                            [modify]  Add BSC, TWAK, CMC, x402 env blocks
contracts/script/Deploy.s.sol           [modify]  Add BSC router + CHAIN=bsc deploy path

scripts/register-bnb-hack.sh            [create]  On-chain agent registration via twak compete register
```

Three-day build. BSC is a third chain (not a replacement). Agent is
enriched with CMC market data. Treasury uses TWAK for self-custody
signing on BSC. x402 pays for CMC data in the trade loop.

### BSC Deploy + TWAK Registration (Completed June 18-19)

SignalRegistry and TradeExecutor live on BSC Testnet (Chain 97):

| Contract                | Address                                      | Tx Hash                                                              |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| SignalRegistry          | `0x05177fa11543cEB73cb18883DFb49B17dc23C862` | `0x3c75500493aa024e4b5da637d223f41dd2c8393f81f7516cbf573a1525c1b47a` |
| TradeExecutor           | `0xE2Ac333ad2BCD6A0389bf95a059fF576d13EbE8F` | `0xab20dd2fb86d5e86ed050a2b4991e3cc6a310d1c20bee780155ba95446702b7a` |
| PancakeSwap V2 Router   | `0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD` | — (existing)                                                         |
| TWAK Agent Wallet (BSC) | `0xA1Dd482E4D6C8cf6f5f7BF80FEc6Bd3F11F5888a` | `0x8bd83d5f47e2957d80ea26dec1f9ecc9de8d9f7291192328baef9558413cb025` |

**Paper trade test (June 19):** BSC monitor created (`cb0e8a64`) watching `bnb-chain/bsc` releases. `POST /monitors/:id/first-check` → TinyFish fetch (3/12 keywords matched) → signal persisted as heartbeat (confidence 25/50). Full pipeline verified end-to-end on BSC chain in paper mode.

**TWAK:** CLI initialized, wallet created on 25 chains, BNB Hack competition registered (`0x8bd8`). `TWAK_ENABLED=true` in `.env`. BSC trades route through TWAK swap in live mode; paper mode returns mock hash.

**CMC/x402:** `X402_ENABLED=false` (no x402 private key configured). Market context enrichment requires `CMC_API_KEY` or `X402_PRIVATE_KEY` — neither set. Adding either key unlocks the feature; x402 additionally unlocks the x402 prize path ($0.01/request on Base).

## File Layout (pre-BNB)

```
apps/
  api/
    src/
      execution/loop.ts                [modify]  insert agent call between detectors and post-commit
      services/
        agent.ts                       [create]  single file, ~200 lines
        agent/
          rubric-v1.md                 [create]  versioned prompt
        treasury.ts                    [create]  single file, server-side wallet
        notify.ts                      [modify]  add broadcastSignal()
        domain/backtest.service.ts     [untouched] Phase 5 work is already done here
        domain/leaderboard.service.ts  [delete]  user-keyed; pivot is agent-keyed
        domain/user.service.ts          [delete]  zero users after pivot
        domain/monitor.service.ts      [modify]  drop user_id binding, rename shape
        domain/rule.service.ts         [delete]  user-defined rules; agent is the only rule
      routes/
        auth.ts                        [delete]
        profile.ts                     [delete]
        waitlist.ts                    [delete]
        monitors.ts                    [modify]  expose watchlist CRUD for admin only
        rules.ts                       [delete]
        execute.ts                     [delete]  x402 on-demand
        kraken.ts                      [delete]  per-user key configure
        leaderboard.ts                 [modify]  → routes/scorecard.ts (or rename)
        scorecard.ts                   [create]  public, no auth, cached 60s
      middleware/x402.ts               [delete]
      services/crypto.ts               [delete]  only encrypts per-user Kraken keys
    src/db/migrations/
      003_drop_user_surface.sql        [create]  drops + renames (see Schema)
      004_add_agent_scores.sql         [create]  agent_scores table
  web/
    src/app/
      page.tsx                         [modify]  ZEC hero, scorecard embed
      account/                         [delete]
      monitors/new/                    [delete]
      rules/                           [delete]
      hunters/                         [delete]
      leaderboard/                     [modify]  → scorecard/ (UI is new)
      scorecard/                       [create]  single public page
      retrospective/zec/               [create]  ZEC founding myth
    src/components/
      WalletConnect.tsx                [delete]
      HashConnect integration          [delete]

db/
  seed/
    watchlist.sql                      [create]  5 watchlist rows
    treasury_wallets.sql               [create]  1 wallet per chain (now 4: hedera, arbitrum, robinhood, bnb)

docs/
  AGENT_ARCHITECTURE.md                [create]  (this PR)
  HACKATHON_CUT.md                     [create]  (this file)
  OPERATIONS.md                        [post-hackathon]
```

Net: ~40% of the API surface, ~60% of the web surface deleted.
The new surface (agent.ts + treasury.ts + scorecard.ts + retrospective

- seed SQL) is ~600 lines of new code. Smaller than what gets cut.

## Schema (frozen, ships Day 2)

```sql
-- migrations/003_drop_user_surface.sql
ALTER TABLE monitors DROP COLUMN user_id;
ALTER TABLE monitors DROP COLUMN hbar_balance;
ALTER TABLE monitors DROP COLUMN cost_per_check;
-- Keep the table name `monitors` (renaming breaks 100+ references).
-- In code and docs, refer to it as "the watchlist."

-- Drop user-owned tables.
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS kraken_keys CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;

-- Drop user-keyed infra. Keep signal_classifications, signal_outcomes,
-- signal_comments, webhook_deliveries, failed_proofs, audit_logs, detector_backtest_stats.
DROP TABLE IF EXISTS signal_comments CASCADE;

-- Add asset_mapping seed and treasury_wallets.
-- (asset_mapping column already exists; see schema.sql:144.)

-- migrations/004_add_agent_scores.sql
CREATE TABLE IF NOT EXISTS agent_scores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id            UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  rubric_version       TEXT NOT NULL,
  conviction           INTEGER NOT NULL,
  thesis               TEXT NOT NULL,
  recommended_action   TEXT NOT NULL,
  confidence_band      TEXT NOT NULL,
  raw_response         JSONB NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_scores_signal ON agent_scores(signal_id);

CREATE TABLE IF NOT EXISTS treasury_wallets (
  chain      TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  label      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true
);
```

**No new outcome_snapshots table.** `signal_outcomes` already has the
exact shape we need (schema.sql:197). The existing
`processSignalOutcomes` cron in `backtest.service.ts:14` already
computes T+1h, T+4h, T+1d, T+7d windows and refreshes
`detector_backtest_stats`. Phase 5 of the 18-day plan is already done.

## API Surface (frozen, ships Day 8)

```
GET  /scorecard/overall              → { hit_ratio, cumulative_pnl_paper, sharpe, drawdown }
GET  /scorecard/by-signal-type       → { [detector_type]: HitStats }
GET  /scorecard/by-watchlist-entry   → { [monitor_id]: HitStats }
GET  /scorecard/recent?limit=N       → SignalCard[]
GET  /signals/:id                    → public signal + thesis + agent score + outcomes + proofs
GET  /proof/public/:id               → public proof package (exists, unchanged)
POST /admin/watchlist                → admin-only watchlist CRUD
POST /admin/treasury/wallets         → admin-only wallet CRUD
DELETE /admin/watchlist/:id
```

All public routes — no auth. Admin routes guarded by an
`ADMIN_API_KEY` env header. No user auth flow.

## Adapter Surfaces (frozen)

```
Agent (frontier model)
  interface AgentClient {
    score(input: AgentInput): Promise<AgentScore>;
  }
  - Live: Anthropic SDK, model = claude-opus-4-7, temperature = 0
  - Mock: deterministic stub returning fixed conviction + thesis

Treasury (chain wallets)
  interface TreasuryClient {
    signAndSend(chain: 'arbitrum' | 'hedera' | 'robinhood', tx: TxRequest): Promise<TxReceipt>;
    getBalance(chain, address): Promise<bigint>;
  }
  - Live: viem for EVM, Hedera SDK for Hedera
  - Mock: synthesises tx hash, no RPC

Price (already in services/price.ts)
  - getPriceAtWindow(symbol, timestamp, windowSec, source)
  - Multi-source: CoinGecko (free) for crypto, deferred
```

## 10-Day Execution Plan

### Day 1 — Cleanup (Principle tags: 1, 2, 3)

**Goal:** Delete every user-facing surface that doesn't fit the
zero-headcount operator model. Test suite stays green throughout.

Tasks (each = 1 commit):

1. Delete `apps/api/src/routes/auth.ts` + `profile.ts` + `waitlist.ts`
   - `execute.ts` + `kraken.ts` (routes) + `services/crypto.ts`
   - `services/domain/user.service.ts` + `services/domain/rule.service.ts`
     (Principle: 2, 3)
2. Delete `apps/api/src/middleware/x402.ts` + x402 imports from
   `routes/monitors.ts` and `routes/execute.ts`
   (Principle: 2, 3)
3. Delete `apps/web/src/app/account/`, `monitors/new/`, `rules/`,
   `hunters/` + `components/WalletConnect.tsx` + HashConnect imports
   (Principle: 2, 3)
4. Update `routes/monitors.ts` to drop the `isOwner` check +
   `user_id` foreign key (Principle: 1, 2)
5. Run `npm run test` + `npm run typecheck` + `npm run lint` +
   `npm run build` — all green (Principle: 5)

Exit criteria:

- [ ] `git grep -l "user_id"` returns 0 in `apps/api/src/routes/`
- [ ] `git grep -l "x402"` returns 0 outside `package-lock.json`
- [ ] `git grep -l "WalletConnect"` returns 0
- [ ] All 4 npm scripts green

### Day 2 — Schema + watchlist seed + agent architecture (1, 2, 3, 4, 7)

**Goal:** Data model reflects the new world. Watchlist is seeded.
Agent architecture is frozen in code (the doc was written in this PR).

Tasks:

1. Write `db/migrations/003_drop_user_surface.sql` + apply to dev DB
   (Principle: 2, 3, 7)
2. Write `db/migrations/004_add_agent_scores.sql` + apply
   (Principle: 1, 4)
3. Write `db/seed/watchlist.sql` with 5 rows from
   `AGENT_ARCHITECTURE.md` "Cold start" table
   (Principle: 7, 5)
4. Write `db/seed/treasury_wallets.sql` with 1 wallet per chain
   (Principle: 7)
5. Update `@lenitnes/types` to drop `User`, `KrakenKey`, `Waitlist`,
   add `AgentScore`, `TreasuryWallet` (Principle: 1)
6. Add `CONVICTION_THRESHOLD`, `DAILY_AGENT_BUDGET_USD`,
   `ADMIN_API_KEY`, `TREASURY_PRIVATE_KEY`, `TELEGRAM_PUBLIC_CHANNEL_ID`
   to `.env.example` (Principle: 7)
7. Update `README.md` to lead with the agent thesis; keep the rest

Exit criteria:

- [ ] Migrations run cleanly against a fresh dev DB
- [ ] `git grep -l "User\b"` returns 0 in `apps/api/src/services/domain/`
- [ ] README's first paragraph names the agent

### Day 3 — Agent skeleton + rubric v1 (4, 6, 1)

**Goal:** `agent.ts` exists, the rubric is a versioned file, the
interface is locked. No integration yet.

Tasks:

1. Write `apps/api/src/services/agent/rubric-v1.md` — the prompt
   template, ~150 tokens. Inputs: detector output, asset_mapping,
   precedent_count, commit metadata. Output: JSON conviction + thesis
   - action + band. (Principle: 4, 6)
2. Write `apps/api/src/services/agent.ts` with:
   - `interface AgentInput` and `interface AgentScore`
   - `score(input, env) → AgentScore` calling Anthropic SDK
   - cost guard (reads `DAILY_AGENT_BUDGET_USD`, fail-fast)
   - raw_response persisted in full
     (Principle: 4, 6)
3. Write `apps/api/src/services/agent.test.ts` with 3 cases:
   detector fires → conviction above threshold; detector fires →
   conviction below; daily budget exceeded → structured error
   (Principle: 4)
4. Add a `MOCK_AGENT=1` env path that returns a deterministic stub
   for tests and local dev (Principle: 4)
5. Run `npm run test` — green

Exit criteria:

- [ ] `apps/api/src/services/agent.ts` is ≤ 250 lines
- [ ] `apps/api/src/services/agent/rubric-v1.md` exists
- [ ] Tests cover above-threshold, below-threshold, budget-cap

### Day 4 — Agent integration + Gate 2 wiring (1, 4, 5, 6)

**Goal:** `loop.ts` calls the agent after detectors. Sub-threshold
agent_scores persist. Above-threshold triggers trade.

Tasks:

1. In `loop.ts`, after the detector pipeline (line 317), insert:
   - if any classification fired → `await scoreAgent({...})`
   - persist AgentScore row (regardless of threshold)
   - branch: above threshold → continue; below → return as
     "agent-rejected signal" with `is_heartbeat=false, conviction=X`
     (Principle: 1, 4, 6)
2. Add `agent_scores` insert helper in `services/agent.ts`
   (Principle: 4, 6)
3. Add a `gate2Blocked` field to `CheckMetadata` and surface it on
   the dashboard (Principle: 5)
4. Update `apps/web/src/app/signals/[id]/page.tsx` to show the
   agent's thesis + conviction when present
   (Principle: 5)
5. End-to-end test: pick one watchlist row, manually trigger a
   check, verify the agent row appears in `agent_scores`
   (Principle: 5)

Exit criteria:

- [ ] `git grep -n "scoreAgent"` in `loop.ts` returns the new call
- [ ] Local DB has at least 1 `agent_scores` row from the manual test
- [ ] `npm run test` green

### Day 5 — Treasury + first testnet trade (1, 2, 4, 7)

**Goal:** Above-threshold agent conviction triggers a testnet trade
signed by the system wallet, in the same call as notarization.

Tasks:

1. Write `apps/api/src/services/treasury.ts` with:
   - `signAndSend(chain, txRequest)` wrapping viem for EVM
   - `getBalance(chain, address)`
   - `MOCK_TREASURY=1` env path that synthesises a tx hash
     (Principle: 1, 4)
2. Refactor `kraken.ts`'s `mode: 'paper' | 'live'` flag to be the
   default for the new treasury path; remove the per-user
   `AddOrderParams` schema (Principle: 2, 1)
3. In `loop.ts` post-commit (after IPFS/HCS/Arbitrum), if the agent
   recommended a trade and the conviction cleared the threshold,
   call `treasury.signAndSend(...)` and write the resulting
   `chain_tx_hash` to the signal row + the orders table
   (Principle: 1, 4, 7)
4. End-to-end test: trigger a check on the ARB watchlist row,
   verify the orders row is filled with a tx hash (mock or testnet)
   (Principle: 5, 7)

Exit criteria:

- [ ] `apps/api/src/services/treasury.ts` is ≤ 200 lines
- [ ] One row in `orders` with a non-mock tx hash (or mock + log)
- [ ] `npm run test` green

### Day 6 — Telegram broadcast (1, 5)

**Goal:** Every above-threshold signal lands in the Telegram channel
with thesis + receipts.

Tasks:

1. Extend `services/notify.ts` with `broadcastSignal(signal, score,
tradeReceipt, proofs)` — templated message: thesis · asset ·
   action · trade tx hash + explorer link · HCS topic + seq · Grove
   CID · outcome window timestamps
   (Principle: 1, 5)
2. In `loop.ts`, after the trade step, call `broadcastSignal(...)`
   (Principle: 1, 5)
3. Manual checklist (block launch, not Day 6): create @lenitnes
   channel, create @lenitnes_bot via BotFather, add bot as admin,
   save chat id to `TELEGRAM_PUBLIC_CHANNEL_ID`
   (Principle: 7)
4. End-to-end test: trigger a check, verify a Telegram message
   appears in the channel (if manual setup done) or in the log
   (mock path) (Principle: 5)

Exit criteria:

- [ ] `broadcastSignal` is in `services/notify.ts` (extended, not parallel)
- [ ] `git grep -n "broadcastSignal"` returns one call site in `loop.ts`

### Day 7 — Scorecard data layer (1, 5)

**Goal:** `routes/scorecard.ts` serves public, cached aggregations.

Tasks:

1. Write `apps/api/src/services/scorecard.ts` with pure SQL
   aggregations over `signals` + `agent_scores` + `signal_outcomes`
   - `detector_backtest_stats`. Functions: `overall()`,
     `bySignalType()`, `byWatchlistEntry()`, `recentCalls(limit)`
     (Principle: 1, 5)
2. Write `apps/api/src/routes/scorecard.ts` with the 4 GET routes
   from the API Surface. No auth. 60s cache. (Principle: 1, 5)
3. Delete `apps/api/src/services/domain/leaderboard.service.ts` and
   `apps/api/src/routes/leaderboard.ts` (user-keyed, doesn't fit)
   (Principle: 2, 3)
4. End-to-end test: hit `/scorecard/overall` and `/scorecard/recent`
   in local dev, verify 200 + non-empty body (Principle: 5)

Exit criteria:

- [ ] `apps/api/src/services/scorecard.ts` is ≤ 150 lines
- [ ] `git grep -l "leaderboard"` returns 0 outside deleted paths
- [ ] All 4 scorecard routes return 200

### Day 8 — Scorecard UI (5)

**Goal:** The public credibility surface lives at `/scorecard`.

Tasks:

1. Write `apps/web/src/app/scorecard/page.tsx` — a single page
   consuming the 4 scorecard endpoints. Sections: hit ratio ·
   cumulative P&L (paper) · Sharpe · drawdown · by-signal-type
   chart · recent calls (cards). Click-through to `/signals/[id]`
   (Principle: 5)
2. Delete `apps/web/src/app/leaderboard/`
   (Principle: 2, 3)
3. Add a `<ScorecardEmbed />` component to the landing page
   (Principle: 5)
4. Manual visual review: walk the page on a 360px viewport and a
   1440px viewport. No card-defaults; design system is the existing
   Fraunces + JetBrains Mono palette. (Principle: 5)

Exit criteria:

- [ ] `apps/web/src/app/scorecard/page.tsx` exists and renders
- [ ] Landing page embeds the scorecard
- [ ] `npm run build` green

### Day 9 — Landing + ZEC retrospective (5, 7)

**Goal:** The founding-myth hero. The README is honest. The agent's
stable scoring range on the halo2 patch is reproducible.

Tasks:

1. Extend `routes/backtest.ts` with a "replay agent against
   historical commits" mode. Use `temperature=0`, `N=10` runs,
   publish median conviction + IQR. (Principle: 6, 7)
2. Replay against the halo2 patch commit. Capture the 10 outputs.
   (Principle: 5, 7)
3. Write `apps/web/src/app/retrospective/zec/page.tsx` — static-ish
   page showing the agent's stable scoring range + mainnet ZEC chart
   (CoinGecko embed). (Principle: 5, 7)
4. Pin the retrospective link in the landing-page hero
   (Principle: 5, 7)
5. Manual visual review of the retrospective page (Principle: 5)

Exit criteria:

- [ ] `retrospective/zec` page renders with the 10-run output
- [ ] Landing hero links to it
- [ ] `npm run build` green

### Day 10 — Launch (5, 6, 7)

**Goal:** Autonomous loop is running. First public signal lands.
60-day paper-trade track record starts.

Tasks:

1. Final landing copy + scorecard live publicly
   (Principle: 5)
2. Telegram channel live with pinned retrospective
   (Principle: 5, 7)
3. Start the autonomous loop (`npm run dev:api` + scheduler)
   (Principle: 5, 7)
4. First public signal post (even if "agent scored 3 commits today,
   none crossed threshold" — transparency starts now)
   (Principle: 5, 6, 7)
5. Tag a `v0.1.0` release; write a one-paragraph `CHANGELOG.md`
   entry; push (Principle: 5)

Exit criteria:

- [ ] `git log --oneline | head -10` shows 10 days of work
- [ ] `apps/web/src/app/page.tsx` is live with scorecard + retrospective
- [ ] `git tag v0.1.0` exists and is pushed

## Risk Register

| Risk                                                | Likelihood          | Mitigation in plan                                                                                            | Fallback                                           |
| --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Claude API non-determinism breaks ZEC retrospective | High (already true) | Day 9 uses `N=10` runs, publishes median + IQR                                                                | "Agent's stable range: 71-83, median 78" framing   |
| Treasury private key leak                           | Medium              | Lives in `.env`, never logged, never exposed to web                                                           | Rotate immediately; document in `OPERATIONS.md`    |
| Watchlist goes cold — no signal fires in 7 days     | Medium              | Seeded 5 high-signal assets (BTC, ETH, SOL, ARB, ZEC); agent runs daily                                       | Loosen detector thresholds; widen condition text   |
| Detector + agent threshold gate confusion           | Low                 | Day 4 reconciles explicitly: confidence_threshold = gate 1 (loop.ts:416), conviction_threshold = gate 2 (env) | Disable agent, fall back to detector-only mode     |
| Public scorecard shows bad early numbers            | High (low N)        | Display "n=12 signals" prominently; show per-signal-type breakdown                                            | Suppress scorecard for first 30 days               |
| LLM cost overrun                                    | Medium              | `DAILY_AGENT_BUDGET_USD=20` cap with circuit breaker                                                          | Drop to Haiku for sub-threshold scoring            |
| Migration breaks dev DB                             | Low                 | Migrations are idempotent (`IF NOT EXISTS`); tested on fresh DB                                               | Manual rollback SQL in `db/migrations/ROLLBACK.md` |

## Definition of Done

- [ ] `git grep -l "user_id\|x402\|WalletConnect\|leaderboard\|waitlist"` returns 0 outside `node_modules` and `package-lock.json`
- [ ] `git grep -l "kraken_keys"` returns 0
- [ ] `npm run test && npm run lint && npm run typecheck && npm run build` all green
- [ ] `apps/api/src/services/agent.ts`, `treasury.ts`, `scorecard.ts` all exist and are ≤ 250 lines
- [ ] `agent_scores` table has ≥ 1 row from a real agent call
- [ ] `treasury_wallets` table has 1 row per active chain
- [ ] `monitors` table has 5 seeded rows (ZEC, BTC, ETH, SOL, ARB)
- [ ] `signal_outcomes` table has ≥ 1 row with a non-NULL `pct_change`
- [ ] `/scorecard/overall` returns 200 with non-empty body
- [ ] `/retrospective/zec` page renders with 10-run agent output
- [ ] Landing page (`apps/web/src/app/page.tsx`) embeds scorecard + links to retrospective
- [ ] Telegram channel has at least 1 broadcast message (live or test mode)
- [ ] `git tag v0.1.0` exists and is pushed
- [ ] `docs/AGENT_ARCHITECTURE.md` and `docs/HACKATHON_CUT.md` are in the repo

## Post-Hackathon (deferred, not Day 1-10)

- v2 rubric with `consensus_critical` + `holder_concentration`
- 2-of-3 Gnosis Safe for treasury
- T+1h / T+1d / T+7d outcome tracker (already done in
  `processSignalOutcomes`; post-hackathon = visual polish)
- Multi-source price provider (equities, Robinhood)
- `docs/OPERATIONS.md` — key rotation, runbook
