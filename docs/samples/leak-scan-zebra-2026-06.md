# Leak-Scan Sample Report — ZcashFoundation/zebra, May–June 2026

> **What this is.** A commit-history leak scan: the same nine detectors and
> versioned scoring rubric that power the live LENITNES trading agent, run over
> a repository's public commit history to answer one question — _what was this
> codebase telling the market, and when?_ This sample covers the repo at the
> center of the June 2026 Zcash halo2 event, scanned blind by the production
> engine (no hand-tuning, no event-specific rules).
>
> Reproduce: `GET /backtest/replay?repo=ZcashFoundation/zebra&from=2026-05-15T00:00:00Z&to=2026-06-15T00:00:00Z&asset=zcash`
> (live agent reasoning requires an operator key; the public endpoint returns
> detector output with deterministic scoring).

## Method

- Commits fetched from the public GitHub API for the requested window and
  batched by UTC day — the granularity a live monitor sees them at.
- Each day-batch runs through the nine typed detectors (emergency patch,
  security-critical change, protocol upgrade, dependency rotation, governance
  shift, maintainer departure, silent merge, supply-chain risk, news signal).
- Batches where detectors fire are scored by the agent against rubric v4:
  conviction 0–100, directional thesis, confidence band. Conviction ≥ 70 with
  a direction is a **trade-grade call**.
- Where price history has matured, actual T+1d and T+7d moves are attached.

## Findings — 31 days, 7 flagged batches, 2 trade-grade calls

| Date (UTC)     | Commits | Detectors fired                                                                                 | Conviction | Call      | T+1d    | T+7d       |
| -------------- | ------- | ----------------------------------------------------------------------------------------------- | ---------- | --------- | ------- | ---------- |
| 2026-05-25     | 4       | emergency_patch, security_critical, protocol_upgrade                                            | 42         | none      | −1.3%   | −14.9%     |
| 2026-05-29     | 3       | protocol_upgrade                                                                                | 51         | none      | −2.7%   | —          |
| 2026-06-01     | 5       | security_critical, dependency_rotation, protocol_upgrade                                        | 72         | none¹     | —       | —          |
| **2026-06-02** | **15**  | **emergency_patch, security_critical, dependency_rotation, governance_shift, protocol_upgrade** | **88**     | **SHORT** | +10.7%  | **−16.1%** |
| 2026-06-03     | 8       | emergency_patch, security_critical, dependency_rotation, protocol_upgrade                       | 78         | long²     | —       | −28.4%     |
| 2026-06-09     | 2       | protocol_upgrade                                                                                | 55         | none³     | −5.5%   | +13.5%     |
| 2026-06-10     | 5       | governance_shift, protocol_upgrade                                                              | 72         | SHORT     | −5.0% ✓ | —          |

¹ Conviction 72 but action _none_ — the agent flagged the upgrade scaffolding
and explicitly reasoned it "may already be priced in."
² A reversal the day after an 88-conviction short. In live operation the book
discipline rule blocks this trade: a reversal must exceed the conviction that
opened the standing position (78 < 88), so the short stands.
³ Below the 70 trade threshold; archived, no trade.

## The headline

**On 2026-06-02 — the day Zebra 4.5.3 shipped the emergency soft fork, two
days before public disclosure — the engine fired five of nine detectors on a
15-commit batch and called SHORT at 88/100.** ZEC fell ~50% when disclosure
landed on 4–5 June; the T+7d window from the call shows −16.1%, and from the
following day's batch −28.4%. Nobody told the engine an event was coming. The
commits did.

The pre-echoes matter as much as the call: the 05-25 and 06-01 batches show
the engine registering elevated security activity at sub-trade conviction —
aware, but disciplined. It did not cry wolf in the quiet weeks.

## The control

The identical scan over `bitcoin/bitcoin` for the same window — a period with
no market-moving repo event — examined 8 flagged batches and produced **zero
trade-grade calls** (conviction range 30–58, all _none_). The engine's value
is not that it fires; it's that it fires selectively.

## Honest limitations

- T+1d was the wrong horizon for this event (+10.7% bounce before the −16.1%
  week); disclosure-lag theses resolve in days, not hours. The scorecard
  tracks both windows for exactly this reason.
- Day-batching can straddle a multi-day event; the 06-03 reversal is partly an
  artifact of re-reading the same emergency in a second batch. Live book
  discipline suppresses it; the raw scan shows it. We show it anyway.
- Price attribution uses daily CoinGecko data; intraday entries would differ.

## What an engagement looks like

The same scan, pointed at **your** repos — including private ones — on a
schedule, with findings delivered to your channel instead of a trading desk:
what your commit history signals about unannounced launches, emergency
responses, key rotations, and departures, before a market or a competitor
reads it the way this engine just read Zebra's.

_LENITNES — part of the [Persidian](https://persidian.com) portfolio. The
public track record at [lenitnes.persidian.com](https://lenitnes.persidian.com)
is this engine trading its own calls, in public, on-chain._
