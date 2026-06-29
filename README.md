# LENITNES

**An autonomous AI intelligence operation. Frontier-model agents read public commits to consensus-critical code — and news from SoSoValue's on-chain finance feeds — score them against a versioned conviction rubric, timestamp every signal on Hedera HCS (immutable proof), execute testnet trades on BSC (PancakeSwap) or ValueChain (SoDEX orderbook), and broadcast every call to a public Telegram channel — all in the same block, all publicly auditable across two chains.**

LENITNES is a zero-headcount research desk. No users, no per-monitor staking, no SaaS dashboard to manage. The agents run continuously; their calls become a public track record the system cannot misremember.

## The ZEC moment

In late May 2026, Taylor Hornby of Shielded Labs — working with Anthropic's Opus 4.8 — discovered a four-year-old soundness bug in Zcash's `halo2_gadgets` crate. A missing constraint in the variable-base scalar multiplication gadget could have let an attacker mint counterfeit ZEC inside the Orchard shielded pool. On 2 June, Zebra 4.5.3 shipped an emergency soft fork that disabled Orchard transactions at block 3,363,426. On 3 June, Zebra 5.0.0 / NU6.2 hard-forked the network and re-enabled Orchard with the corrected circuit. The formal public disclosure landed 4-5 June. **ZEC dropped ~50% in 48 hours**, from a ~$624 peak to ~$309.

We don't claim our agent would have found Hornby's bug — he and Opus 4.8 did. What we claim is downstream: the emergency-response commits in the public Zebra and halo2 repos on 2-3 June were a signal of their own. A surprise soft fork disabling a live shielded pool, no preceding bug report, immediately followed by a hard fork that swaps the verifying key — that shape is unambiguous. Our detectors fire on it. A retail trader can't read every consensus-critical commit in real time; a frontier-model agent can.

We replayed the agent against the Zebra 4.5.3 release. It would have flagged it **95/100**, four-detector consensus, paper-trade **SHORT ZEC** at ~$600, broadcast the thesis 2-3 days before the formal disclosure. [Read the replay →](https://lenitnes.persidian.com/case-study/halo2)

## The credibility surface

The hard problem in AI trading agents isn't the inference — it's the **track record**. Most agents show you their model. LENITNES shows you the model AND the closed-out P&L. Every committed signal carries:

- The on-chain signal record (Arbitrum `SignalRegistry`)
- The testnet trade tx hash (or paper receipt in MOCK mode)
- The agent's thesis + conviction + recommended action
- The mainnet price outcome at T+1h, T+1d, and T+7d

The system cannot misremember its own performance. The [public scorecard](https://lenitnes.persidian.com/scorecard) recomputes hit ratio, Sharpe, drawdown, and by-signal-type breakdown from the same tables that the trade receipts point at. Cached 60s, invalidated on every new signal.

## Live demo

Public surfaces — no signup, no auth:

- **[`/scorecard`](https://lenitnes.persidian.com/scorecard)** — the live track record. Leads with the "We are here: observation phase" banner. Conviction-band calibration table, per-detector outcomes, recent calls.
- **[`/calibration`](https://lenitnes.persidian.com/calibration)** — long-form view of the conviction calibration loop. Is higher conviction actually predictive? Honest "early sample" framing while N is small.
- **[`/methodology`](https://lenitnes.persidian.com/methodology)** — top-to-bottom narrative: what we watch and why, all 8 detectors with examples, how the agent scores, every safety gate in plain English, position lifecycle, why paper-trade first.
- **[`/portfolio`](https://lenitnes.persidian.com/portfolio)** — open + closed positions with entry price, current price, unrealized P&L, TP/SL levels.
- **[`/case-study/halo2`](https://lenitnes.persidian.com/case-study/halo2)** — the founding case study. The agent's verdict on the 2026 Orchard emergency response (Zebra 4.5.3 + NU6.2) + the ZEC -50% price move that followed the formal disclosure.
- **[`/signals/:id`](https://lenitnes.persidian.com/signals/)** — every committed signal, with the full proof chain (Hedera HCS, IPFS, Arbitrum) and a "was the agent right?" verdict card.

## How it works (autonomous loop)

1. **Watchlist** — a curated set of consensus-critical and security-critical repositories. Admin-managed, not user-facing.
2. **Detect** — TinyFish + scraper pulls each new commit (with a 30-minute settling delay so we don't fire on already-priced-in news); 9 typed detectors classify it (`emergency_patch`, `security_critical`, `consensus_relevant`, `governance_shift`, `news_signal`, etc.). The 9th detector (`news_signal`) is powered by **SoSoValue's on-chain finance news feed** — it finds narrative-breaking events before they hit the commit graph.
3. **Enrich** (optional) — when SoSoValue is configured, the agent receives macro-economic context (GDP, CPI, Fed rate decisions) and crypto index snapshots (BTC dominance, ETH staking ratio, stablecoin supply ratio) alongside the commit data — broader context than any commit alone.
4. **Score** — a frontier-model agent evaluates the enriched context against a versioned rubric. Outputs a conviction score (0–100), 280-char thesis, recommended action (`long` | `short` | `none`), and confidence band.
5. **Gate** — conviction ≥ 80 (raised from 70 on 2026-06-26 after cohort 1 ran 0% win rate). Sub-threshold scores still persist in the reasoning archive but produce no trade and no Telegram post.
6. **Safety stack** — every live trade passes through a gated risk evaluator before the swap is signed: master kill switch, asset-registry membership, chain-ID guard, treasury balance preflight, on-chain TVL floor, 24h-volume floor, position-count + per-asset caps. Failure on any gate forces paper mode; the signal still ships.
7. **Commit** (if above threshold + safety passes):
   - **Route** — pick the execution venue by chain: PancakeSwap V2 on BSC or SoDEX central-limit orderbook on ValueChain. The venue abstraction allows adding new venues without touching the treasury core.
   - **Trade** via the selected venue with `amountOutMin` derived from an on-chain quote × the configured slippage (no `=0` foot-gun). Conviction-scaled TP/SL written at open.
   - **Notarize** the signal: Hedera HCS message + Arbitrum `SignalRegistry` write + Grove proof package.
   - **Broadcast** to the public Telegram channel with the verdict-forward editorial dispatch voice (asset + action + conviction + thesis, no infra noise).
8. **Settle** — every 5 minutes, the TP/SL scheduler reads CoinGecko per-asset prices, closes any position whose target is hit via a real reverse swap, and records realized P&L. At T+1h / T+1d / T+7d, the price is also snapshotted as backtest outcome data.

No human input in the steady state. The only operator surfaces are `/admin/*` (X-Admin-Key gated) and the watchlist seed.

See **[`docs/RUNBOOK.md`](./docs/RUNBOOK.md)** for the operator runbook (preflight checks, first-live-trade dry run, emergency exit) and **[`docs/CALIBRATION.md`](./docs/CALIBRATION.md)** for the per-knob empirical rationale + change log.

## Core concepts

- **Watchlist entry** — system-curated repository + monitored paths + asset mapping. Not user-owned.
- **Signal** — a scored commit that crossed the conviction threshold. Carries agent verdict, on-chain proof, paper trade receipt, and the eventual price outcome.
- **Conviction score** — frontier-model 0–100 evaluation. Only signals at the configured threshold (currently 80) trigger the commit step.
- **Calibration band** — buckets of conviction scores (0-29 noise → 90-100 maximum). The `/calibration` page shows hit ratio + avg directional pct change per band, so we can see whether higher conviction = better outcomes.
- **Asset registry** — single source of truth for which `coingeckoId → on-chain token address` pairs are safe to swap live. BSC mainnet only (BTCB, ETH); L1s and small caps route to paper. New assets require BscScan verification + manual entry.
- **Treasury wallet** — single server-side wallet per chain. All trades are paper / testnet during the observation phase. v2 = 2-of-3 Gnosis Safe.
- **Outcome window** — fixed T+1h / T+1d / T+7d mainnet price snapshots. Drives the public scorecard and calibration views.
- **Reasoning archive** — every agent score, above and below threshold. The "would have said" log.
- **Position lifecycle** — open (swap + entry price capture + conviction-scaled TP/SL writes) → settle (5-min scheduler reads price, closes on TP/SL hit via real reverse swap) → recorded realized PnL.

## Stack

| Layer          | Choice                                        | Why                                                         |
| -------------- | --------------------------------------------- | ----------------------------------------------------------- |
| API            | Express 5 + TypeScript                        | Boring, fast, easy to deploy                                |
| DB             | PostgreSQL 14                                 | Reliable, JSONB, window fns                                 |
| Agent          | Kimi K2 via Virtuals · MOCK for tests         | Versioned rubric, conviction 0-100                          |
| Market data    | CoinMarketCap Pro API (+ x402 fallback)       | Global metrics, Fear & Greed, asset quotes                  |
| News + macro   | SoSoValue On-Chain Finance API                | 9th `news_signal` detector, macro context for agent scoring |
| Notarize       | Hedera HCS + Arbitrum `SignalRegistry`        | Two-chain proof                                             |
| Store          | IPFS (Grove / Lens)                           | Immutable evidence package                                  |
| Trading (AMM)  | PancakeSwap V2 on BSC                         | AMM swaps via `swapExactETHForTokens` with amountOutMin     |
| Trading (CLOB) | SoDEX orderbook on ValueChain (testnet)       | Market orders through EIP-712 signed REST API               |
| Signing        | Trust Wallet Agent Kit (TWAK) · ethers Wallet | Self-custody signing on BSC; direct ethers fallback         |
| Broadcast      | Telegram public channel                       | Public, timestamped                                         |
| Charts         | CoinGecko historical API (with fallback)      | Real price outcomes                                         |
| Frontend       | Next.js 16 + Tailwind                         | Dark dashboard, Fraunces + Space Grotesk                    |

See [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) for the frozen
Q1-Q3 design decisions and [`docs/HACKATHON_CUT.md`](./docs/HACKATHON_CUT.md)
for the 10-day plan + BNB Hack (June 22-28) plan.

## Getting started (local)

```bash
# 1. Install
npm install --legacy-peer-deps

# 2. Configure
cp .env.example .env
# Required: JWT_SECRET, ENCRYPTION_KEY, WEBHOOK_SECRET (32-byte hex each)
# Required: DATABASE_URL, NVIDIA_API_KEY (or MOCK_AGENT=1 for testing)
# Optional: TWAK_ACCESS_ID + TWAK_HMAC_SECRET (BSC live trading),
#           CMC_API_KEY (market context) or X402_PRIVATE_KEY (x402 fallback),
#           SOSO_VALUE_API_KEY (news feeds + macro data for agent enrichment),
#           SODEX_API_KEY_NAME + SODEX_API_KEY_PRIVATE (orderbook execution on ValueChain)

# 3. Generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Migrate + seed the database
createdb lenitnes
psql -d lenitnes -f db/schema.sql
psql -d lenitnes -f db/migrations/003_pivot.sql
psql -d lenitnes -f db/seed/watchlist.sql
psql -d lenitnes -f db/seed/treasury_wallets.sql

# 5. Seed the demo (3 real commits through the real pipeline)
npm run seed:demo -w @lenitnes/api

# 6. Run
npm run dev:api    # API on :4000
npm run dev:web    # Web on :3000
```

Visit `http://localhost:3000/scorecard` to see the track record. Visit `http://localhost:3000/case-study/halo2` for the founding myth.

## Deploy to testnet (the real path)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide, including the
parallel BSC testnet deploy for the BNB Hack. The short version:

```bash
# 1. Install Foundry (forge)
curl -L https://foundry.paradigm.xyz | bash

# 2. Get a testnet wallet + ETH for gas
#    Arbitrum Sepolia:  https://www.alchemy.com/faucets/arbitrum-sepolia
#    BSC testnet:       https://testnet.bnbchain.org/faucet-smart

# 3. Deploy contracts (Arbitrum Sepolia)
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --private-key $EVM_PRIVATE_KEY \
  --broadcast

#    …or BSC testnet (BNB Hack):
CHAIN=bsc forge script script/Deploy.s.sol \
  --rpc-url $BNB_RPC_URL \
  --private-key $EVM_PRIVATE_KEY \
  --broadcast

# 4. Update .env with the deployed addresses
ARB_SIGNAL_REGISTRY_ADDRESS=0x...
ARB_TRADE_EXECUTOR_ADDRESS=0x...
# (BSC deploy — see DEPLOYMENT.md Step 4b)
BNB_SIGNAL_REGISTRY_ADDRESS=0x...
BNB_TRADE_EXECUTOR_ADDRESS=0x...
TREASURY_MODE=live
TELEGRAM_BOT_TOKEN=...
TELEGRAM_PUBLIC_CHANNEL_ID=@lenitnes
TINYFISH_API_KEY=...
GITHUB_TOKEN=...

# 5. (BSC only) Optional: self-custody signing via Trust Wallet Agent Kit
TWAK_ACCESS_ID=...
TWAK_HMAC_SECRET=...
TWAK_ENABLED=true

# 6. Restart the API. The system runs the loop and posts to Telegram on every above-threshold signal.
```

## Project structure

```
lenitnes/
├── apps/
│   ├── api/                    Express + TypeScript REST API
│   │   └── src/
│   │       ├── index.ts        Server entry + graceful shutdown
│   │       ├── config.ts        Env-var loader (chains, treasury, agent, admin, telegram)
│   │       ├── db/              pool · migrate · schema · 003_pivot · validate
│   │       ├── routes/          monitors · signals · scorecard · admin · backtest · replay · dlq · proof · webhooks
│   │       ├── services/        agent · treasury · replay · notify · scorecard · share-token
│   │       │   ├── data-providers/ Provider interfaces + implementations
│   │       │   │   ├── cmc/      CoinMarketCap Pro API (global metrics, Fear & Greed, quotes)
│   │       │   │   ├── coingecko/ CoinGecko price data (charts, outcomes)
│   │       │   │   └── sosovalue/ SoSoValue news feeds, macro events, index snapshots
│   │       │   ├── venues/       Execution venue abstraction
│   │       │   │   ├── pancakeswap/ PancakeSwap V2 AMM (quotes + swaps)
│   │       │   │   └── sodex/   SoDEX orderbook (EIP-712 signed REST orders)
│   │       │   ├── twak.ts       Trust Wallet Agent Kit wrapper (BSC self-custody swap)
│   │       │   ├── detectors/    9 signal detectors (8 commit-based + 1 news-signal)
│   │       │   ├── treasury/    asset-registry · risk gate
│   │       │   └── evm/         client · trade · signal-registry
│   │       ├── execution/       loop.ts (the autonomous loop, sections 1-7)
│   │       ├── seed/            demo.ts (real-evidence seed, 3 public commits)
│   │       └── middleware/      cache · metrics · rate-limit
│   └── web/                    Next.js 16 + Tailwind
│       └── src/app/             scorecard · case-study/halo2 · signals/:id · backtest · public/proof/:id
├── contracts/                  Foundry (SignalRegistry + TradeExecutor; multi-chain)
├── packages/types/             Shared domain types (Chain, AgentScore, TreasuryWallet)
├── db/
│   ├── schema.sql              Postgres schema (CREATE IF NOT EXISTS)
│   ├── migrations/003_pivot.sql  Day 2 pivot: drops per-user tables
│   └── seed/                   watchlist · treasury_wallets (4 chains: hedera, arbitrum, robinhood, bnb)
├── scripts/                    register-bnb-hack.sh — on-chain agent registration
├── docs/
│   ├── AGENT_ARCHITECTURE.md   Frozen decision doc (Q1-Q3)
│   ├── HACKATHON_CUT.md        10-day plan + BNB Hack pivot
│   └── RUNBOOK.md              Operator runbook (preflight, first trade, emergency exit)
├── DEPLOYMENT.md               Testnet deploy guide (Arbitrum + BSC)
├── openapi.yaml                REST API spec (post-pivot, 27 paths)
└── README.md                   You are here
```

## API surface (public)

```
GET  /scorecard                  Public track record (cached 60s, no auth)
GET  /scorecard/recent           Recent calls (cached 30s)
GET  /signals                    Signal list (cached 30s)
GET  /signals/:id                Signal detail with proof package + agent verdict
GET  /proof/public/:id           Public proof for sharing (share-token gated)
GET  /backtest/stats             Per-detector + per-asset backtest stats
GET  /backtest/signals/:id/outcomes  Outcome rows for one signal
GET  /backtest/replay            Founding-myth replay (any repo)
GET  /backtest/replay/halo2      Canonical halo2 replay
GET  /monitors                   Watchlist entries (system-curated, public)
GET  /monitors/:id               Monitor + signal history
GET  /orders                     Recent orders (treasury trades)
GET  /dlq                        DLQ depth + jobs (operator surface in practice)
GET  /health                     Verbose snapshot (DB, Redis, DLQ, memory)
GET  /health/live                Liveness probe (k8s)
GET  /health/ready               Readiness probe (DB + Redis)
GET  /metrics                    Prometheus metrics

# SoSoValue on-chain finance data (no auth)
GET  /sosovalue/news             SoSoValue news feed (latest crypto headlines)
GET  /sosovalue/news/search      Search news by keyword
GET  /sosovalue/macro            Macro-economic events and indicators
GET  /sosovalue/index/snapshots  Crypto index snapshots (BTC.D, ETH staking ratio, etc.)

# Operator (X-Admin-Key)
GET  /admin/status               Signal counts, agent budget, treasury wallets
POST /admin/cache/invalidate     Drop cache entries by pattern
POST /admin/cache/invalidate-all Nuke every cache entry
GET  /admin/venues               Active venue status (PancakeSwap, SoDEX)
POST /admin/positions/:id/close  Manually close an open position (fires real on-chain swap if live)
```

See **[docs/RUNBOOK.md](./docs/RUNBOOK.md)** for the operator runbook —
preflight checks, first-live-trade dry run, and emergency exit
procedure.

Full OpenAPI 3.1 spec (30 paths): [`openapi.yaml`](./openapi.yaml).

## BNB Hack (June 22-28 live trading window)

LENITNES participates in the [Lepton Agents Hackathon](https://www.bnbchain.foundation/en/learn-DynamicPage/what-is-the-lepton-ai-hackathon) with a third trading venue: **BNB Smart Chain (testnet)**.

**What it does:**

```
Monitor (GitHub) → TinyFish detects → NVIDIA LLM scores (conviction 0-100) →
≥70? → Treasury signs swap on BSC → Telegram broadcasts → T+1d/T+7d outcome tracked
```

**Live demo results (seed:demo via autonomous pipeline):**

| Commit                         | LLM Conviction | Action   | Mode                                      |
| ------------------------------ | -------------- | -------- | ----------------------------------------- |
| `zcash/halo2` soundness fix    | **82/100**     | **long** | paper — registry does not list ZEC on BSC |
| `zcash/halo2` docs             | 20/100         | none     | —                                         |
| `bitcoin/bitcoin` fee estimate | 25/100         | none     | —                                         |

When the registry lists the asset on BSC (BTC, ETH today), the
treasury fires a real PancakeSwap V2 `swapExactETHForTokens` with
`amountOutMin` from an on-chain quote — not a sanity-free wrap. The
[trading safety layer](./apps/api/src/services/treasury/) gates every
live swap on: master kill switch (`TRADING_ENABLED=false` by
default), asset-registry membership, BSC chain-ID guard, treasury
balance preflight, on-chain pool TVL floor, CMC 24h-volume floor, and
position-count + per-asset-concentration caps. Failure on any gate
forces paper mode. Live trading flips on only after the
[`/calibration`](https://lenitnes.persidian.com/calibration) page
shows the 80+ band visibly outperforming for a meaningful sample.

**Special prize readiness:**

| Prize              | Status        | Details                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TWAK**           | ✅ Live       | TWAK wallet created, credentials in `.env`, agent registered on-chain via `twak compete register`. BSC trades route through TWAK for mainnet self-custody signing, with automatic fallback to direct ethers swap on testnet. See `services/twak.ts` and `scripts/register-bnb-hack.sh`. |
| **x402**           | ✅ Live       | `X402_ENABLED=true`, wallet funded with **5 USDC on Base** (chain 8453). CMC market data fetches use the x402 pay-per-request protocol (~$0.01/req). On-chain payments verified — `costUsd: 0.02` confirmed on-Base settlement. See `services/cmc-x402.ts`.                             |
| **On-chain agent** | ✅ Registered | Agent wallet `0xA1Dd482E4D6C8cf6f5f7BF80FEc6Bd3F11F5888a` registered on BNB Hack leaderboard via `scripts/register-bnb-hack.sh`.                                                                                                                                                        |

Key architecture decisions for the BNB track:

- **BSC chain plumbing** — `chains.bnb` in `config.ts`, BSC RPC + WBNB/PancakeSwap wiring in `services/evm/client.ts`, BSC treasury wallet row in `db/seed/treasury_wallets.sql`.
- **TWAK + fallback** — The treasury tries TWAK first (mainnet self-custody, slippage handled via the `--slippage` CLI flag). If TWAK isn't configured, it falls back to a direct `ethers.Wallet` swap that calls PancakeSwap V2's `swapExactETHForTokens` with `amountOutMin` derived from an on-chain `getAmountsOut` quote × the configured slippage tolerance. Both paths produce verifiable on-chain transactions.
- **Real LLM, not mock** — Switched from non-functional `minimaxai/minimax-m3` to `meta/llama-3.1-70b-instruct` on NVIDIA's API. The rubric-based conviction scoring produces consistent, calibrated outputs.
- **x402 pay-per-request** — CMC data fetches use the x402 protocol (USDC on Base, ~$0.01/req). Payments confirmed on-chain; CMC's AWS WAF blocks headless display, but the protocol integration is complete.
- **On-chain agent registration** — `scripts/register-bnb-hack.sh` calls `twak compete register` against the BNB Hack registry so the agent is in the live-trading leaderboard.

Deployed BSC Testnet contracts:

| Contract              | Address                                      |
| --------------------- | -------------------------------------------- |
| SignalRegistry        | `0x05177fa11543cEB73cb18883DFb49B17dc23C862` |
| TradeExecutor         | `0xE2Ac333ad2BCD6A0389bf95a059fF576d13EbE8F` |
| PancakeSwap V2 Router | `0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD` |

See [`docs/HACKATHON_CUT.md`](./docs/HACKATHON_CUT.md) for the full BNB Hack plan and Day 1-3 pivot notes, and [DEPLOYMENT.md § Step 4b](./DEPLOYMENT.md#step-4b--deploy-contracts-to-bsc-testnet-bnb-hack) for the BSC deploy walk-through.

## Why this matters

The Lepton Agents Hackathon (June 2026) is one of the first venues where the judging panel actually looks at the model output AND the model's track record. Most agent projects ship a chat demo. LENITNES ships a credibility surface — the public scorecard — that can only get more credible over time. The 60-day paper-trade track record is the moat.

Built in 10 days. Public, open-source, forkable.

## License

MIT.
