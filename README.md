# LENITNES

**An autonomous AI agent that reads public commits to consensus-critical cryptocurrency code and infers trading directions before the market prices them in. Every signal is timestamped on Hedera HCS, every call is tracked as an explicitly-labeled paper position with price snapshots at T+1h/1d/7d, and the public scorecard recomputes from the same tables the calls are written to — the system cannot misremember its own performance.**

No users, no per-monitor staking, no SaaS dashboard. The agent runs continuously; its calls become a public track record.

## One engine, two audiences

The unit of proof is the **call**, not the trade: a directional thesis, committed on-chain before the outcome, scored against what the price actually did. That makes the same engine serve two audiences:

1. **Public (this site)** — the autonomous agent trades its own theses in public. The track record is the product.
2. **Enterprise (the direction)** — the same nine detectors + versioned rubric, pointed at _your_ repos: what is your commit history telling the market before you announce it? `GET /backtest/replay?repo=owner/repo` runs the real engine over any public repo's history — the leak-scan demo. The public track record is the sales proof; the leak-scan is the product. This is a demo today, not a product — see [`docs/ROADMAP.md`](./docs/ROADMAP.md) for what's missing.

LENITNES is part of the [Persidian](https://persidian.com) portfolio — sentinels for different business rhythms: money in (Sikizana), messages out (Nuncio), theses tested (Lenitnes), data trusted (DataBard).

## The ZEC moment

In late May 2026, a four-year-old soundness bug in Zcash's `halo2_gadgets` crate was discovered — a missing constraint that could have let an attacker mint counterfeit ZEC inside the Orchard shielded pool. The emergency soft fork landed in Zebra 4.5.3 on 2 June; the formal public disclosure came 4-5 June. **ZEC dropped ~50% in 48 hours.** We replayed the agent against the public commits: it would have flagged **95/100**, four-detector consensus, paper-trade **SHORT ZEC** at ~$600, 2-3 days before the formal disclosure. [Read the replay →](https://lenitnes.persidian.com/case-study/halo2)

## Live demo

Public surfaces — no signup, no auth:

- **[`/scorecard`](https://lenitnes.persidian.com/scorecard)** — live track record. Hit ratio, Sharpe, drawdown, per-detector outcomes, recent calls.
- **[`/calibration`](https://lenitnes.persidian.com/calibration)** — is higher conviction actually predictive? Includes a 90-day replay sweep showing which watchlist repos' commit signals historically co-moved with price.
- **[`/methodology`](https://lenitnes.persidian.com/methodology)** — all 9 detectors with examples, how the agent scores, every safety gate.
- **[`/portfolio`](https://lenitnes.persidian.com/portfolio)** — open + closed positions with entry price, unrealized P&L, TP/SL levels.
- **[`/case-study/halo2`](https://lenitnes.persidian.com/case-study/halo2)** — the founding case study.
- **[`/signals/:id`](https://lenitnes.persidian.com/signals/)** — every committed signal with the full proof chain and a "was the agent right?" verdict card.
- **[`/scan`](https://lenitnes.persidian.com/scan)** — the enterprise pitch as a working demo: point the production engine at any public repo and see what its commit history signaled, day by day.

## How it works

1. **Watch** — curated consensus-critical repos: Zcash (`zcash/halo2`, `ZcashFoundation/zebra`), Bitcoin, Ethereum (geth, reth), Solana (`anza-xyz/agave`), Arbitrum, Sui. News is corroboration only, never the primary signal.
2. **Detect** — 9 typed detectors ARE the signal gate: they decide whether a batch of new commits constitutes a signal (`emergency_patch`, `security_critical_patch`, `consensus_relevant`, …).
3. **Score** — an LLM agent evaluates the signal against a versioned rubric (v4), with commit evidence (SHAs, messages), the cross-signal narrative, and the current open book. Rubric v4 requires commit-driven theses to cite the SHA and its code-level meaning, hard-caps news-only signals at conviction 65, and enforces book discipline (no pile-ons, no evidence-free reversals). Outputs conviction (0–100), thesis, action, confidence band.
4. **Gate** — conviction ≥ 70 to trade. Sub-threshold scores persist as the public reasoning archive but produce no trade and no broadcast.
5. **Commit** — open a tracked position in the recommended direction, long or short, explicitly labeled paper (live swaps exist behind the `TRADING_ENABLED` kill switch, off until calibration clears). Notarize the thesis on Hedera HCS, broadcast to Telegram.
6. **Track** — once each window genuinely matures (T+1h/4h/1d/7d), the price is snapshotted from CoinGecko and attributed back to the signal. T+1d and T+7d resolutions post a public "call CORRECT / WRONG" verdict to Telegram. Drives the scorecard.
7. **Replay** — the same engine runs over any repo's history (`/backtest/replay`) for case studies and leak-scans. `GET /backtest/responsiveness` sweeps the commit-level watchlist and ranks repos by historical commit→price responsiveness.

No human input in the steady state. See [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) for the full design decisions, [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) for the operator runbook, and [`docs/CALIBRATION.md`](./docs/CALIBRATION.md) for the per-knob empirical rationale.

## Stack

| Layer          | Choice                                                     |
| -------------- | ---------------------------------------------------------- |
| API            | Express 5 + TypeScript (Node 20, ESM)                      |
| DB             | PostgreSQL 14                                              |
| Agent          | LLM via NVIDIA API (`AGENT_MODEL`) · versioned rubric (v4) |
| Market data    | CoinMarketCap Pro API (+ x402 fallback)                    |
| News + macro   | SoSoValue On-Chain Finance API                             |
| Notarize       | Hedera HCS + Arbitrum SignalRegistry                       |
| Trading (AMM)  | PancakeSwap V2 on BSC                                      |
| Trading (CLOB) | SoDEX orderbook on ValueChain                              |
| Broadcast      | Telegram public channel                                    |
| Frontend       | Next.js 16 + Tailwind                                      |

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
psql -d lenitnes -f db/migrations/004_signal_asset.sql
psql -d lenitnes -f db/seed/watchlist.sql
psql -d lenitnes -f db/seed/treasury_wallets.sql

# 4. Run
npm run dev:api    # API on :4000
npm run dev:web    # Web on :3000
```

Visit `http://localhost:3000/scorecard` to see the track record.

## Documentation

- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — what's built vs. demo, and what the enterprise leak-scan direction needs to become a real product
- [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) — frozen design decisions: where the agent sits, what it adds, how the gates interact
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — operator runbook: preflight checks, first-live-trade dry run, emergency exit
- [`docs/CALIBRATION.md`](./docs/CALIBRATION.md) — per-knob empirical rationale + change log
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — testnet deploy guide (Arbitrum + BSC)
- [`openapi.yaml`](./openapi.yaml) — full REST API spec (30 paths)
- [`docs/HACKATHON_CUT.md`](./docs/HACKATHON_CUT.md) — BNB Hack + Lepton Agents Hackathon notes

## License

MIT.
