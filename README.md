# LENITNES

**An autonomous AI trading agent that reads public commits to consensus-critical cryptocurrency code — and news from SoSoValue's on-chain finance feeds — to infer trading directions before the market prices them in. Every signal is timestamped on Hedera HCS, every trade is on-chain, and the public scorecard recomputes from the same tables the trade receipts point at — the system cannot misremember its own performance.**

No users, no per-monitor staking, no SaaS dashboard. The agents run continuously; their calls become a public track record.

## The ZEC moment

In late May 2026, a four-year-old soundness bug in Zcash's `halo2_gadgets` crate was discovered — a missing constraint that could have let an attacker mint counterfeit ZEC inside the Orchard shielded pool. The emergency soft fork landed in Zebra 4.5.3 on 2 June; the formal public disclosure came 4-5 June. **ZEC dropped ~50% in 48 hours.** We replayed the agent against the public commits: it would have flagged **95/100**, four-detector consensus, paper-trade **SHORT ZEC** at ~$600, 2-3 days before the formal disclosure. [Read the replay →](https://lenitnes.persidian.com/case-study/halo2)

## Live demo

Public surfaces — no signup, no auth:

- **[`/scorecard`](https://lenitnes.persidian.com/scorecard)** — live track record. Hit ratio, Sharpe, drawdown, per-detector outcomes, recent calls.
- **[`/calibration`](https://lenitnes.persidian.com/calibration)** — is higher conviction actually predictive? Honest "early sample" framing while N is small.
- **[`/methodology`](https://lenitnes.persidian.com/methodology)** — all 9 detectors with examples, how the agent scores, every safety gate.
- **[`/portfolio`](https://lenitnes.persidian.com/portfolio)** — open + closed positions with entry price, unrealized P&L, TP/SL levels.
- **[`/case-study/halo2`](https://lenitnes.persidian.com/case-study/halo2)** — the founding case study.
- **[`/signals/:id`](https://lenitnes.persidian.com/signals/)** — every committed signal with the full proof chain and a "was the agent right?" verdict card.

## How it works

1. **Watch** — curated consensus-critical repos (ZCash, Bitcoin, Ethereum, Solana, Arbitrum, Sui) + SoSoValue news + macro feeds per asset.
2. **Detect** — 9 typed detectors classify every commit and news item (`emergency_patch`, `security_critical`, `consensus_relevant`, `news_signal`, etc.).
3. **Score** — a frontier-model agent evaluates the signal against a versioned rubric, with a cross-signal narrative: what every other repo + the news feed did in the same 24h window. Outputs conviction (0–100), thesis, action, confidence band. A separate 2h narrative scan synthesizes the whole cluster into one thesis even when no individual monitor crossed threshold.
4. **Gate** — conviction ≥ 70 to trade. Sub-threshold signals persist as a reasoning archive but produce no trade.
5. **Commit** — trade from the treasury wallet (PancakeSwap on BSC / SoDEX orderbook on ValueChain), notarize on Hedera HCS, broadcast to Telegram. All in the same block, all publicly auditable.
6. **Track** — at T+1h, T+1d, T+7d the mainnet price is snapshotted from CoinGecko and attributed back to the originating signal. Drives the public scorecard.

No human input in the steady state. See [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) for the full design decisions, [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) for the operator runbook, and [`docs/CALIBRATION.md`](./docs/CALIBRATION.md) for the per-knob empirical rationale.

## Stack

| Layer          | Choice                                               |
| -------------- | ---------------------------------------------------- |
| API            | Express 5 + TypeScript (Node 20, ESM)                |
| DB             | PostgreSQL 14                                        |
| Agent          | Llama 3.1 70B via NVIDIA API · versioned rubric (v3) |
| Market data    | CoinMarketCap Pro API (+ x402 fallback)              |
| News + macro   | SoSoValue On-Chain Finance API                       |
| Notarize       | Hedera HCS + Arbitrum SignalRegistry                 |
| Trading (AMM)  | PancakeSwap V2 on BSC                                |
| Trading (CLOB) | SoDEX orderbook on ValueChain                        |
| Broadcast      | Telegram public channel                              |
| Frontend       | Next.js 16 + Tailwind                                |

## Getting started (local)

```bash
# 1. Install
npm install --legacy-peer-deps

# 2. Configure
cp .env.example .env
# Required: JWT_SECRET, ENCRYPTION_KEY, WEBHOOK_SECRET (32-byte hex each)
# Required: DATABASE_URL, NVIDIA_API_KEY (or MOCK_AGENT=1 for testing)
# Optional: SOSO_VALUE_API_KEY (news + macro feeds), SODEX_* (orderbook execution)

# 3. Migrate + seed
createdb lenitnes
psql -d lenitnes -f db/schema.sql
psql -d lenitnes -f db/migrations/003_pivot.sql
psql -d lenitnes -f db/seed/watchlist.sql
psql -d lenitnes -f db/seed/treasury_wallets.sql

# 4. Run
npm run dev:api    # API on :4000
npm run dev:web    # Web on :3000
```

Visit `http://localhost:3000/scorecard` to see the track record.

## Documentation

- [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) — frozen design decisions: where the agent sits, what it adds, how the gates interact
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — operator runbook: preflight checks, first-live-trade dry run, emergency exit
- [`docs/CALIBRATION.md`](./docs/CALIBRATION.md) — per-knob empirical rationale + change log
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — testnet deploy guide (Arbitrum + BSC)
- [`openapi.yaml`](./openapi.yaml) — full REST API spec (30 paths)
- [`docs/HACKATHON_CUT.md`](./docs/HACKATHON_CUT.md) — BNB Hack + Lepton Agents Hackathon notes

## License

MIT.
