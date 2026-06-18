# LENITNES

**An autonomous AI intelligence operation. Frontier-model agents read public commits to consensus-critical code, score them against a versioned conviction rubric, execute timestamped testnet trades, and broadcast every call to a public Telegram channel — all in the same block, all publicly auditable.**

LENITNES is a zero-headcount research desk. No users, no per-monitor staking, no SaaS dashboard to manage. The agents run continuously; their calls become a public track record the system cannot misremember.

## The ZEC moment

In 2026, a frontier-model researcher discovered that Zcash's `halo2` proving circuit had carried a four-year vulnerability — an unanchored base point in the incomplete-addition loop that allowed forging proofs to mint unlimited ZEC. The fix landed quietly as [`halo2_gadgets: Anchor variable-base scalar-mul incomplete-addition base`](https://github.com/zcash/halo2/commit/d8e48efddbe4746d76eb2c8a843a6ddc2b9a727a) — technical, understated, easy to scroll past. The commit was public for ~4 days before the market noticed. ZEC then dropped ~50%.

The signals were public the whole time: an unusually large, urgent commit to consensus-critical code with no preceding bug report or discussion, landing during a quiet hour. **No human was watching with the right rubric. An AI could have been.** LENITNES is what watches.

We replayed the agent against that exact commit. It would have flagged it 92/100, multi-detector consensus, paper-trade long ZEC, broadcast the thesis in 280 characters. [Read the replay →](https://lenitnes.com/case-study/halo2)

## The credibility surface

The hard problem in AI trading agents isn't the inference — it's the **track record**. Most agents show you their model. LENITNES shows you the model AND the closed-out P&L. Every committed signal carries:

- The on-chain signal record (Arbitrum `SignalRegistry`)
- The testnet trade tx hash (or paper receipt in MOCK mode)
- The agent's thesis + conviction + recommended action
- The mainnet price outcome at T+1h, T+1d, and T+7d

The system cannot misremember its own performance. The [public scorecard](https://lenitnes.com/scorecard) recomputes hit ratio, Sharpe, drawdown, and by-signal-type breakdown from the same tables that the trade receipts point at. Cached 60s, invalidated on every new signal.

## Live demo

Three public surfaces — no signup, no auth:

- **[`/scorecard`](https://lenitnes.com/scorecard)** — the live track record. Hit ratio, P&L, Sharpe, by-signal-type, by-watchlist, recent calls.
- **[`/case-study/halo2`](https://lenitnes.com/case-study/halo2)** — the founding myth. The agent's actual verdict on the 2022 halo2 soundness fix + the ZEC price chart that followed.
- **[`/signals/:id`](https://lenitnes.com/signals/)** — every committed signal, with the full proof chain (Hedera HCS, IPFS, Arbitrum).

## How it works (autonomous loop)

1. **Watchlist** — a curated set of consensus-critical and security-critical repositories. Admin-managed, not user-facing.
2. **Detect** — TinyFish + scraper pulls each new commit; 8 typed detectors classify it (`emergency_patch`, `security_critical`, `consensus_relevant`, `governance_shift`, etc.).
3. **Score** — a frontier-model agent evaluates the commit against a versioned rubric. Outputs a conviction score (0–100), 280-char thesis, recommended action (`long` | `short` | `none`), and confidence band.
4. **Gate** — conviction ≥ 70. Sub-threshold scores still persist (the reasoning archive) but produce no trade and no Telegram post.
5. **Commit** (if above threshold) — all three happen together:
   - **Trade** the call from the treasury wallet on testnet (Arbitrum / Robinhood Chain / paper).
   - **Notarize** the signal: Hedera HCS message + Arbitrum `SignalRegistry` write + Grove proof package.
   - **Broadcast** to the public Telegram channel with thesis, tx hash, and outcome window timestamps.
6. **Track outcome** — at T+1h, T+1d, T+7d, the mainnet price is snapshotted and attributed back to the originating signal.

No human input in the steady state. The only operator surfaces are `/admin/*` (X-Admin-Key gated) and the watchlist seed.

## Core concepts

- **Watchlist entry** — system-curated repository + monitored paths + asset mapping. Not user-owned.
- **Signal** — a scored commit that crossed the conviction threshold. Carries agent verdict, on-chain proof, paper trade receipt, and the eventual price outcome.
- **Conviction score** — frontier-model 0–100 evaluation. Only signals at threshold trigger the commit step.
- **Treasury wallet** — single server-side wallet per chain (testnet). All trades are paper / testnet during the credibility-building phase. v2 = 2-of-3 Gnosis Safe.
- **Outcome window** — fixed T+1h / T+1d / T+7d mainnet price snapshots. Drives the public scorecard.
- **Reasoning archive** — every agent score, above and below threshold. The "would have said" log.

## Stack

| Layer     | Choice                                     | Why                          |
| --------- | ------------------------------------------ | ---------------------------- |
| API       | Express 5 + TypeScript                     | Boring, fast, easy to deploy |
| DB        | PostgreSQL 14                              | Reliable, JSONB, window fns  |
| Agent     | Frontier model (Kimi K2 / Claude / etc.)   | Pluggable, MOCK for tests    |
| Notarize  | Hedera HCS + Arbitrum `SignalRegistry`     | Two-chain proof              |
| Store     | IPFS (Grove / Lens)                        | Immutable evidence package   |
| Trade     | Arbitrum Sepolia + Robinhood Chain testnet | Real on-chain receipts       |
| Broadcast | Telegram public channel                    | Public, timestamped          |
| Charts    | CoinGecko historical API (with fallback)   | Real price outcomes          |
| Frontend  | Next.js 16 + Tailwind                      | Music-publication aesthetic  |

## Getting started (local)

```bash
# 1. Install
npm install --legacy-peer-deps

# 2. Configure
cp .env.example .env
# Required: JWT_SECRET, ENCRYPTION_KEY, WEBHOOK_SECRET (32-byte hex each)
# Required: DATABASE_URL, VIRTUALS_API_KEY (or MOCK_AGENT=1 for testing)

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

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full guide. The short version:

```bash
# 1. Install Foundry (forge)
curl -L https://foundry.paradigm.xyz | bash

# 2. Get a testnet wallet + Arbitrum Sepolia ETH
#    Faucet: https://www.alchemy.com/faucets/arbitrum-sepolia

# 3. Deploy contracts
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --private-key $TREASURY_PRIVATE_KEY \
  --broadcast

# 4. Update .env with the deployed addresses
ARB_SIGNAL_REGISTRY_ADDRESS=0x...
ARB_TRADE_EXECUTOR_ADDRESS=0x...
TREASURY_MODE=live
TELEGRAM_BOT_TOKEN=...
TELEGRAM_PUBLIC_CHANNEL_ID=@lenitnes
TINYFISH_API_KEY=...
GITHUB_TOKEN=...

# 5. Restart the API. The system runs the loop and posts to Telegram on every above-threshold signal.
```

## Project structure

```
lenitnes/
├── apps/
│   ├── api/                    Express + TypeScript REST API
│   │   └── src/
│   │       ├── index.ts        Server entry + graceful shutdown
│   │       ├── config.ts        Env-var loader (treasury, agent, admin, telegram, evm)
│   │       ├── db/              pool · migrate · schema · 003_pivot · validate
│   │       ├── routes/          monitors · signals · scorecard · admin · backtest · replay
│   │       ├── services/        agent · treasury · replay · notify · scorecard
│   │       ├── services/evm/    client · trade · signal-registry
│   │       ├── execution/       loop.ts (the autonomous loop, sections 1-7)
│   │       ├── seed/            demo.ts (real-evidence seed)
│   │       └── middleware/      cache · metrics · rate-limit
│   └── web/                    Next.js 16 + Tailwind
│       └── src/app/             scorecard · case-study/halo2 · signals · admin
├── contracts/                  Foundry (SignalRegistry + TradeExecutor)
├── packages/types/             Shared domain types
├── db/
│   ├── schema.sql              Postgres schema (CREATE IF NOT EXISTS)
│   ├── migrations/003_pivot.sql  Day 2 pivot: drops per-user tables
│   └── seed/                   watchlist · treasury_wallets
├── docs/
│   ├── AGENT_ARCHITECTURE.md   Frozen decision doc (Q1-Q3)
│   └── HACKATHON_CUT.md        10-day plan
├── DEPLOYMENT.md               Testnet deploy guide
└── README.md                   You are here
```

## API surface (public)

```
GET  /scorecard            Public track record (cached 60s, no auth)
GET  /scorecard/recent    Recent calls (cached 30s)
GET  /case-study/halo2     ... (live at /case-study/halo2 on the web)
GET  /signals              Signal list
GET  /signals/:id          Signal detail with agent verdict + proof chain
GET  /proof/public/:id     Public proof for sharing
GET  /backtest/replay/halo2  The founding-myth replay (hardcoded for now)
GET  /admin/status         Operator surface (X-Admin-Key)
GET  /admin/agent/budget   Agent daily spend vs cap
POST /admin/cache/invalidate  Manual cache flush
```

## Why this matters

The Lepton Agents Hackathon (June 2026) is one of the first venues where the judging panel actually looks at the model output AND the model's track record. Most agent projects ship a chat demo. LENITNES ships a credibility surface — the public scorecard — that can only get more credible over time. The 60-day paper-trade track record is the moat.

Built in 10 days. Public, open-source, forkable.

## License

MIT.
