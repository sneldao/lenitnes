# LENITNES

**A pre-registration machine for software-change judgments.** LENITNES watches repositories, detects commits that may invalidate published results, scores each one with a versioned rubric, and notarizes every verdict on Hedera HCS _before_ the outcome is knowable — then grades itself in public, losses included. The scorecard recomputes from the same tables the calls are written to, so the system cannot misremember its own performance.

## The loop

1. **DETECT** — typed commit detectors gate every signal; news is corroboration only, never the primary signal.
2. **SCORE** — an LLM grades the signal against a versioned rubric (v4 `[code]` / v6 `[bio]`) and emits conviction (0–100), thesis, and a recommended action.
3. **COMMIT** — above-threshold calls are executed (a trade, an alert — depending on the vertical) and every verdict is timestamped on Hedera HCS.
4. **GRADE** — outcomes are scored against the vertical's grading authority: market price for `[code]`, the dated scientific record for `[bio]`.

What varies by vertical is only four slots — the watched corpus, the rubric, the grading authority, and the action a high-conviction call triggers. The loop, the notarization, and the public grading discipline are invariant.

## Verticals — instances of one instrument

The tag names the _field being watched_, never the output type:

| Vertical              | Corpus                          | Grading authority                                              | Action on conviction          | Status                         |
| --------------------- | ------------------------------- | -------------------------------------------------------------- | ----------------------------- | ------------------------------ |
| `LENITNES[code]`      | consensus-critical crypto repos | market price (T+1h/1d/7d)                                      | trade (paper → live venues)   | Season 1 closed, record public |
| `LENITNES[bio]`       | scientific software repos       | published record (retractions, corrections, dated disclosures) | integrity alert, HCS-anchored | Season 2 running               |
| enterprise / `[next]` | a customer's own repos          | internal audit                                                 | leak-scan report              | capability demo (`/scan`)      |

Markets were chosen as Season 1's grader _because_ they are the hardest oracle: price cannot be spun, arrives in hours, and punishes errors in dollars. That season exists to prove the grading discipline works before the same instrument is aimed at the scientific record, where ground truth matters more but arrives slower.

**The epistemic distinction, said once:** the founding case studies (halo2 `[code]`, 3dClustSim `[bio]`) are replays — the engine graded against history whose outcome was already known. The live scorecard commits verdicts against futures it cannot see. Replays calibrate the instrument; live scoring is the record.

## One engine, two audiences

The unit of proof is the **call**, not the trade: a directional thesis, committed on-chain before the outcome, scored against what the grading authority actually recorded. That makes the same engine serve two audiences:

1. **Public (this site)** — the autonomous agent runs its theses in public. The track record is the product.
2. **Enterprise (the direction)** — the same detectors + versioned rubric, pointed at _your_ repos: what is your commit history telling the world before you announce it? `GET /backtest/replay?repo=owner/repo` runs the real engine over any public repo's history — the leak-scan demo. The public track record is the sales proof; the leak-scan is the product. This is a demo today, not a product — see [`docs/ROADMAP.md`](./docs/ROADMAP.md) for what's missing.

LENITNES is part of the [Persidian](https://persidian.com) portfolio — sentinels for different business rhythms: money in (Sikizana), messages out (Nuncio), theses tested (Lenitnes), data trusted (DataBard).

## The ZEC moment — `[code]` founding case

In late May 2026, a four-year-old soundness bug in Zcash's `halo2_gadgets` crate was discovered — a missing constraint that could have let an attacker mint counterfeit ZEC inside the Orchard shielded pool. The emergency soft fork landed in Zebra 4.5.3 on 2 June; the formal public disclosure came 4-5 June. **ZEC dropped ~50% in 48 hours.** We replayed the agent against the public commits: it would have flagged **95/100**, four-detector consensus, paper-trade **SHORT ZEC** at ~$600, 2-3 days before the formal disclosure. [Read the replay →](https://lenitnes.persidian.com/case-study/halo2)

## Live demo

Public surfaces — no signup, no auth:

- **[`/scorecard`](https://lenitnes.persidian.com/scorecard)** — live track record: vertical-specific scorecards (`[code]` Season 1 market metrics; `[bio]` record events), per-detector outcomes, recent calls.
- **[`/calibration`](https://lenitnes.persidian.com/calibration)** — is higher conviction actually predictive? Includes a 90-day replay sweep showing which watchlist repos' commit signals historically co-moved with price.
- **[`/methodology`](https://lenitnes.persidian.com/methodology)** — all detectors with examples (both verticals), how the agent scores, every safety gate.
- **[`/portfolio`](https://lenitnes.persidian.com/portfolio)** — open + closed positions with entry price, unrealized P&L, TP/SL levels.
- **[`/case-study/halo2`](https://lenitnes.persidian.com/case-study/halo2)** — the `[code]` founding case study.
- **[`/case-study/clustsim`](https://lenitnes.persidian.com/case-study/clustsim)** — the `[bio]` founding case study.
- **[`/signals/:id`](https://lenitnes.persidian.com/signals/)** — every committed signal with the full proof chain and a "was the agent right?" verdict card.
- **[`/scan`](https://lenitnes.persidian.com/scan)** — point the production engine at any public repo (crypto _or_ scientific) and see what its commit history signaled, day by day.

## The pipeline in detail

Operational specifics behind each loop stage:

1. **Watch** — curated repos. `[code]`: consensus-critical crypto (Zcash, Bitcoin, Ethereum, Solana, Arbitrum, Sui). `[bio]`: scientific software (AFNI, Nextstrain, Opentrons, OpenMMTools). Polling is free: the GitHub API feeds commit diffs directly; news is corroboration only, never the primary signal.
2. **Detect** — typed commit detectors are the signal gate, domain-scoped: `[code]` runs the consensus/security set (`emergency_patch`, `security_critical_patch`, `silent_merge`, …); `[bio]` runs `method_fix` and `results_rewrite`.
3. **Score** — an LLM agent evaluates the signal against a versioned rubric (v4 for `[code]`, v6 for `[bio]`). Bio scoring corroborates against the literature (Firecrawl research index, Paperclip when available) and emits `alert`/`investigate`/`none` plus a list of affected claims. Outputs conviction (0–100), thesis, action, confidence band.
4. **Gate** — conviction ≥ 70 (A-tier repos) to trade; unknown/B-tier repos trade at a stricter ≥ 80 until the responsiveness sweep confirms them. Sub-threshold scores persist as the public reasoning archive but produce no trade and no broadcast.
5. **Commit** — `[code]`: open a tracked position in the recommended direction (gated behind a double kill switch, paper fallback). `[bio]`: no trade — the commitment is the HCS-anchored alert itself. Every fill/alert is notarized on Hedera HCS and broadcast to Telegram.
6. **Track** — `[code]`: price snapshots at T+1h/1d/7d drive "call CORRECT/WRONG" verdicts. `[bio]`: each alert is graded against a dated event in the scientific record (retraction/correction/disclosure) with a lead-time in days. Drives the scorecard (`?domain=bio` for the integrity card).
7. **Replay** — the same engine runs over any repo's history (`/backtest/replay`) for case studies and leak-scans. `GET /backtest/responsiveness` sweeps the commit-level watchlist and ranks repos by historical commit→price responsiveness.

No human input in the steady state. See [`docs/AGENT_ARCHITECTURE.md`](./docs/AGENT_ARCHITECTURE.md) for the full design decisions, [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) for the operator runbook, and [`docs/CALIBRATION.md`](./docs/CALIBRATION.md) for the per-knob empirical rationale.

## Stack

| Layer          | Choice                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------- |
| API            | Express 5 + TypeScript (Node 20, ESM)                                                              |
| DB             | PostgreSQL 14                                                                                      |
| Agent          | Qwen3.8 chain: HF free endpoint (keyless) → TokenRouter fallback · rubric v4 `[code]` / v6 `[bio]` |
| Market data    | CoinMarketCap Pro via spot price hub · CoinGecko historical (+ x402 fallback)                      |
| News + macro   | SoSoValue On-Chain Finance API                                                                     |
| Notarize       | Hedera HCS + Arbitrum SignalRegistry                                                               |
| Trading (AMM)  | PancakeSwap V2 on BSC                                                                              |
| Trading (CLOB) | SoDEX orderbook on ValueChain                                                                      |
| Broadcast      | Telegram public channel                                                                            |
| Frontend       | Next.js 16 + Tailwind                                                                              |
| **Payments**   | **x402-over-Hedera (`exact-hedera` scheme) — pay-per-signal in HBAR**                              |

## x402-over-Hedera — pay-per-signal autonomous commerce

LENITNES signals are notarized on Hedera HCS — and now they're also **sold per-query through x402**. An autonomous agent pays 0.25–0.50 HBAR per call to read the signal feed or scorecard; each payment settles on Hedera testnet as a real HBAR transfer and is notarized to HCS (two on-chain artifacts per purchase).

- **Merchant**: `GET /paid/feed` (0.25 HBAR), `GET /paid/scorecard` (0.50 HBAR), `GET /paid/signals/:id` (0.50 HBAR)
- **Self-facilitator**: verify (decode signed TransferTransaction, validate payer/payee/amount/memo/asset) + settle (submit on testnet, confirm SUCCESS, notarize receipt to HCS)
- **x402 V2 conformance**: `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` headers via `@x402/core/http`; custom `exact-hedera` scheme under CAIP-2 `hedera:testnet`
- **Public audit**: `GET /payments` shows every settled micropayment with both HashScan links

See [`docs/X402_HEDERA_SUBMISSION.md`](./docs/X402_HEDERA_SUBMISSION.md) for the full architecture, HashScan links, and run steps.

## Getting started (local)

```bash
# 1. Install
npm install --legacy-peer-deps

# 2. Configure
cp .env.example .env
# Required: JWT_SECRET, ENCRYPTION_KEY, WEBHOOK_SECRET (32-byte hex each)
# Required: DATABASE_URL (live LLM runs keyless by default; set MOCK_AGENT=1 for deterministic tests, TOKENROUTER_API_KEY for the fallback provider)
# Optional: SOSO_VALUE_API_KEY (news + macro feeds), SODEX_* (orderbook execution)

# 3. Migrate + seed
createdb lenitnes
psql -d lenitnes -f db/schema.sql
psql -d lenitnes -f db/migrations/003_pivot.sql
psql -d lenitnes -f db/migrations/004_signal_asset.sql
psql -d lenitnes -f db/migrations/008_science_domain.sql
psql -d lenitnes -f db/migrations/009_agent_scores_bio.sql
psql -d lenitnes -f db/seed/watchlist.sql
psql -d lenitnes -f db/seed/watchlist_bio.sql
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
- [`docs/RAGENT_PIVOT.md`](./docs/RAGENT_PIVOT.md) — re:AGENT Hackathon (Aug 15–16): LENITNES[bio] vertical, Track A

## License

MIT.
