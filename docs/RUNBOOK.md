# LENITNES — Operator Runbook

Short reference for operating the live trading path. Reading order:
**preflight → first live trade → emergency exit**.

---

## Preflight checklist (before enabling live trading)

The agent ships with `TRADING_ENABLED=false` by default. Every gate
below must pass before flipping that switch in production.

### Fastest check: hit `/admin/risk-check`

The API exposes a dry-run gate evaluator that runs every risk check
WITHOUT firing a trade, and tells you which gate trips:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "https://lenitnes.persidian.com/api/admin/risk-check?asset=bitcoin&chain=bnb"
```

A `decision.effectiveMode === "live"` means every gate passes.
Anything else returns the gate that blocked + a human reason
(e.g. `"BSC chainId 97 ≠ mainnet (56)"`).

### What the API logs at boot

Every API startup logs a `treasury:` posture line:

```
treasury: KILL SWITCH ON — every trade routes to paper
treasury: live blocked — BSC chainId 97 is not mainnet (56)
treasury: live ready — 2 registry asset(s), bnb chain
```

If you see anything other than "live ready" with
`tradingEnabled=true`, the system is gated. The structured fields
on the same log line include `bnbBalance`, `bnbChainId`, `bnbWallet`.

### Full gate list (in order)

1. **Asset registry membership.** The asset must appear in
   `apps/api/src/services/treasury/asset-registry.ts` with a
   verified token address. Cross-check on BscScan against the
   official Binance-Peg token list. Only BTC + ETH are
   pre-registered — L1s (SOL/SUI/ZEC) are omitted from the SPOT
   registry (no canonical BEP-20 with deep liquidity) but trade live
   as Hyperliquid perps via the Propr adapter (see the Propr section
   below).

2. **BSC chain-ID guard.** Live BNB trades refuse unless
   `config.chains.bnb.chainId === 56`. Testnet (chainId 97)
   would revert against the mainnet-only registry addresses.

3. **Treasury wallet funded.** The risk gate's balance preflight
   refuses any trade that wouldn't cover `TREASURY_DEFAULT_AMOUNT`
   plus a 0.005 BNB gas buffer. The gas check job also alerts
   below `GAS_WARNING_THRESHOLD` (default 0.02 BNB).

4. **Slippage + liquidity defaults.** Sane out of the box:
   - `TREASURY_SLIPPAGE_BPS=50` (0.5%) — derives `amountOutMin`
     from the on-chain PancakeSwap quote
   - Per-asset `minPoolTvlUsd` in the registry (default $5M)
   - Per-asset `minDailyVolumeUsd` ($1M; requires `CMC_API_KEY`)

5. **TP/SL defaults.** Conviction-scaled:
   - `POSITION_TAKE_PROFIT_BPS=1500` (+15% base, tilted +10pp at conviction 100)
   - `POSITION_STOP_LOSS_BPS=700` (adaptive: 5% at conviction 70 → 9% at 100)

   Auto-close fires via the 5-min `checkTakeProfitStopLoss` job.

6. **Position caps.**
   - `MAX_CONCURRENT_POSITIONS=5` — global ceiling
   - `MAX_PER_ASSET_POSITIONS=1` — no concentration

7. **Admin API key.** `ADMIN_API_KEY` non-empty so manual close
   and risk-check are reachable.

---

## Propr perp venue (live shorts + L1 assets)

Propr is the perp venue that takes **shorts** and **L1 assets**
(ZEC/SOL/SUI/ARB) live on Hyperliquid perpetuals — the cases the
spot PancakeSwap path can't handle (spot has no short primitive;
those assets have no deep BSC liquidity). This is what lets the
flagship SHORT ZEC thesis go live instead of paper.

### Enabling Propr

Two kill switches must **both** be on (both default off):

```bash
TRADING_ENABLED=true      # master kill switch (already required for spot)
PROPR_ENABLED=true        # Propr-specific gate
PROPR_API_KEY=pk_live_…   # get it at https://app.propr.xyz/settings
```

Optional tuning (defaults shown):

```bash
PROPR_ACCOUNT_ID=           # blank = auto-discover (funded → competition → challenge)
PROPR_MIN_NOTIONAL_USD=20
PROPR_MAX_NOTIONAL_USD=500  # ~1% of a $50k tournament account
PROPR_LEVERAGE=1            # clamped to per-asset venue cap (BTC/ETH 5x, others 2x)
PROPR_SL_TP_ENABLED=true    # attach conviction-scaled SL+TP to every fill
PROPR_NOTARIZE=true         # notarize every fill to Hedera HCS
```

### What it does differently from spot

- **Shorts execute live** (sell/short entry, buy close) — not paper.
- **Leverage** clamped to `min(PROPR_LEVERAGE, venue cap)`; default 1x.
- **Notional** conviction-scaled: linear from `PROPR_MIN_NOTIONAL_USD`
  ($20) at conviction 70 to `PROPR_MAX_NOTIONAL_USD` ($500) at
  conviction 100. Higher conviction → bigger position.
- **SL + TP** attached to every fill. TP is conviction-scaled (15%
  at 70, up to 25% at 100). SL is adaptive: tighter for low
  conviction (5% at 70), wider for high conviction (9% at 100) —
  uncertain theses cut fast, strong theses get room to breathe.
- **Every fill notarized** to Hedera HCS — the live track record stays
  un-gameable.
- **Closes always `reduceOnly:true`** (selling without it opens a separate
  short — the #1 Propr pitfall).
- The `0xpropr:` tx-hash prefix marks a Propr open; `closePositionById`
  routes the close back through Propr, not the spot venue.

### Account discovery

The adapter's `setup()` runs 3-tier discovery: funded accounts
(`/book-account-issuances`) → competition participations
(`/competition-participations`) → challenge attempts
(`/challenge-attempts`). If you've joined a tournament (e.g. the
Lighter x Propr Trading Tournament), the competition participation
surfaces the `accountId` automatically. Pin it with
`PROPR_ACCOUNT_ID` to skip discovery.

### Failure mode

Propr declines (kill switch off, asset not listed, price unavailable,
order rejected) return `null` and fall through to the spot/paper path —
they **never throw** out of the trade loop. All declines + fills log
with the `propr:` prefix.

---

## First live trade (dry run)

Goal: prove the end-to-end path works for a tiny amount before
opening any real conviction-sized position.

### 1. Stage the environment

```bash
# Production env vars to set:
TRADING_ENABLED=true
TREASURY_MODE=live
TREASURY_DEFAULT_AMOUNT=0.001       # ~$0.50 at $500 BNB — keep tiny
TREASURY_DEFAULT_CHAIN=bnb
TREASURY_SLIPPAGE_BPS=100           # 1% — wider during dry run
ADMIN_API_KEY=<32+ char secret>
```

Restart the API + worker containers so the new env takes effect:

```bash
ssh nuncio-vultr "cd /opt/lenitnes && sudo docker compose restart api worker"
```

### 2. Force a single signal

Easiest path: wait for the next BTC / ETH commit-level signal that
clears conviction 70. If you don't want to wait, the seed script
generates a deterministic synthetic signal:

```bash
ssh nuncio-vultr "cd /opt/lenitnes && sudo docker compose exec api npm run seed:demo"
```

### 3. Verify the trade fires correctly

In the API logs (`npm run logs` or `sudo docker compose logs -f api`),
you should see in order:

```
risk gate: ok          (no downgrade messages)
quote: ...             (PancakeSwap V2 amountsOut returned)
openSwap: PancakeSwap V2 BNB→token executed
treasury: trade recorded   txHash=0x... (no 0xpap prefix)
position tracking: filled  entry_price_usd=... take_profit_price=... stop_loss_price=...
```

Then check:

- BscScan: `https://bscscan.com/tx/<txHash>` — the swap landed,
  some BTCB/ETH appears in the treasury wallet
- `/portfolio`: position visible with entry price + TP/SL + live
  unrealized PnL
- Telegram channel: signal broadcast with real tx link (not paper)

### 4. Manually close the test position

Don't wait for TP/SL — confirm the close path now while you're
watching:

```bash
# Find the position id
curl -s "https://lenitnes.persidian.com/api/portfolio" | jq '.openPositions[] | {id, asset, entry_price_usd}'

# Close it
curl -X POST "https://lenitnes.persidian.com/api/admin/positions/<id>/close" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

Expected response:

```json
{
  "ok": true,
  "positionId": "...",
  "asset": "bitcoin",
  "exitPriceUsd": 67234.12,
  "pnlUsd": -0.04,
  "closeTxHash": "0xabc..."
}
```

BscScan should show:

- BTCB/ETH approve (allowance granted to PancakeSwap V2 router)
- swapExactTokensForETH (the close itself, BNB returned to wallet)

### 5. Restore production sizing

If everything looked clean, bump `TREASURY_DEFAULT_AMOUNT` back to
your production size (e.g. `0.05` for $25 positions at $500 BNB) and
restart. Otherwise — `TRADING_ENABLED=false` and investigate the
log line that didn't match expectations.

---

## Emergency exit

### Close every open position immediately

There is no bulk-close endpoint by design (forces a deliberate
decision per position). For a true emergency:

```bash
# 1. Kill new trades
ssh nuncio-vultr "cd /opt/lenitnes && \
  sudo docker compose exec api sh -c 'export TRADING_ENABLED=false && pkill -USR1 node'"

# 2. List open positions
curl -s "https://lenitnes.persidian.com/api/portfolio" \
  | jq '.openPositions[].id'

# 3. Close each one
for id in $(curl -s ... | jq -r '.openPositions[].id'); do
  curl -X POST ".../admin/positions/$id/close" -H "X-Admin-Key: $ADMIN_API_KEY"
done
```

### Auto-close swap failed but position is marked closed

The `closePositionById` flow updates the DB row even when the
on-chain swap fails — better to record the intent than leave a
position in limbo. If you see this in the logs:

```
closePositionById: on-chain close swap failed — bookkeeping only
```

The position row is `status='closed'` but the wallet still holds
the token. To recover:

1. Check the wallet's token balance on BscScan.
2. Retry the close swap manually via TWAK CLI, or call the
   PancakeSwap V2 router directly with `swapExactTokensForETH`
   using the wallet's full balance as `amountIn`.
3. Once the BNB returns to the wallet, no DB update is needed —
   the realized PnL was already recorded at the (slightly off)
   exit price the closer fetched.

---

## Operator alerts (2026-07-07)

The pipeline died silently once — an invalid `SOSO_VALUE_API_KEY`
stopped the narrative scan, no agent score was produced for ~30
hours, and nothing paged anyone. The channel kept posting stale
heartbeats the whole time. Two things now exist to prevent a
repeat, both delivered to a **private operator chat**, never the
public Telegram channel:

### Setup

1. Message the bot directly (search its username in Telegram,
   tap Start) so it has a private chat to reply into.
2. Pull your chat id from the bot's own update log:
   ```bash
   ssh nuncio-vultr 'cd /opt/lenitnes && TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" .env | cut -d= -f2) \
     && curl -s "https://api.telegram.org/bot$TOKEN/getUpdates" \
     | python3 -c "import json,sys; [print(u[\"message\"][\"chat\"][\"id\"]) for u in json.load(sys.stdin)[\"result\"] if u.get(\"message\",{}).get(\"chat\",{}).get(\"type\")==\"private\"]"'
   ```
3. Set `TELEGRAM_OPERATOR_CHAT_ID` in `.env` to that id, then
   `sudo docker compose up -d worker api` to pick it up.
4. Verify: send a manual test message to that chat id via
   `sendMessage` and confirm it lands.

### What pages you

- **Dead-man's switch** (`checkPipelinePulse`, runs hourly):
  pages if no monitor check has run in 2h (worker dead / queue
  stuck), or no agent score has been produced in 48h (scoring
  pipeline starved — check API keys and data feeds). Rate-limited
  to one alert per condition per 12h.
- **Low gas** (`checkGasBalance`, every 6h): pages when the BSC
  treasury wallet balance drops below
  `TREASURY_GAS_WARNING_THRESHOLD`. Only matters once live
  trading is enabled — paper calls use no gas.

If `TELEGRAM_OPERATOR_CHAT_ID` is unset, both checks still run
and log at `warn`/`error` — they just have nowhere to page. Check
`docker logs lenitnes-worker-1 | grep "operator alert"` if you
suspect the channel isn't wired.

---

## Public Telegram format (2026-07-11)

Implementation: `apps/api/src/services/telegram-messages.ts`
(signal posts: `apps/api/src/services/notify.ts`).

### New signal broadcast (above-threshold trades)

- Header: asset · action · conviction · band · **PAPER/LIVE**
- Context line: **repo · primary detector · signal date**
- Full thesis, proof block, deep link to `/signals/:id` + `/calibration`
- Footer: “Verdict at T+1d · T+7d (auto-posted)”

### Outcome verdict (T+1d / T+7d)

Posted when a trade-grade call’s window matures (fresh ≤6h only).

**Single verdict** includes:

- Repo · detector · date · paper/live
- Plain-language move: “Price rose +9% — SHORT loses — call WRONG”
- Thesis snippet (≤100 chars)
- Tier policy label when present
- Cohort footer when ≥3 matured calls exist for that asset+window

**Digest** (≥2 same asset + window in one hourly batch):

- One post: “4 calls matured — 0/4 correct · avg directional”
- Numbered entries with thesis + per-signal links
- All-time cohort stat footer → `/calibration`

Stale backfill verdicts are **not** broadcast (6h freshness gate).

---

## Quick reference — what each kill switch does

| Switch                         | Default | What it stops                                                        |
| ------------------------------ | ------- | -------------------------------------------------------------------- |
| `TRADING_ENABLED=false`        | yes     | Every live swap. Signals + scoring continue, trades route to paper.  |
| `TREASURY_MODE=paper`          | yes     | Same as above (older toggle). Both must be true for live.            |
| Asset not in registry          | n/a     | Live swap for that asset; downgraded to paper.                       |
| BSC chain ID ≠ 56              | n/a     | Live BNB trades on testnet (chainId 97). Registry is mainnet-only.   |
| Treasury balance < amount+gas  | n/a     | Live swap when wallet can't cover. Fund the wallet.                  |
| Pool TVL below floor           | n/a     | Live swap for that asset on that chain.                              |
| 24h volume below floor         | n/a     | Live swap for that asset (CMC-gated).                                |
| `MAX_CONCURRENT_POSITIONS` hit | 5       | New live opens; existing positions unaffected.                       |
| `MAX_PER_ASSET_POSITIONS` hit  | 1       | Concentration in one asset; close existing first.                    |
| `PROPR_ENABLED=false`          | yes     | Live perp trades (shorts + L1 assets). Falls back to paper.          |
| Propr asset not listed         | n/a     | Live perp for that asset; falls back to spot/paper.                  |
| `PROPR_MAX_NOTIONAL_USD` clamp | 500     | Per-trade notional cap on perps. Floor via `PROPR_MIN_NOTIONAL_USD`. |

---

## Signal generation sources (2026-07-26)

Beyond the core per-monitor commit detector pipeline, three
periodic synthesis jobs generate signals from aggregated evidence.
All run on the worker's scheduler and trade through the same
treasury path (Propr perps for shorts, spot/paper fallback).

### Thesis synthesis (`synthesis:thesis`)

**Schedule**: every 2h (odd hours, `:00`).

Fetches recent settled commits from ALL active GitHub monitors,
excludes those that already produced a signal (via the monitor's
`last_seen_commit_hash` boundary), and when the un-triggered pool
is large enough (≥4 commits across ≥2 repos, or ≥6 in a single
repo), asks the LLM agent whether the collective pattern forms a
tradeable thesis. Full commit SHAs are in the evidence text so the
rubric's commit-citation requirement is satisfiable.

**Use case**: 15 mundane commits over 3 days that collectively
telegraph a consensus-breaking change, but no single commit trips
a detector.

### Velocity anomaly detection

**Schedule**: part of the proactive scan (odd hours, `:00`).

Tracks commit rate per repo over a 30-day rolling baseline and
flags ±2σ deviations in a 7-day window:

- **Spike** (+2σ): sudden burst of activity → emergency response,
  protocol upgrade, coordinated fix.
- **Drop** (−2σ): sudden quiet → maintainer departure, project
  pause, abandonment.

Score = `min(100, |deviation| × 15)`. Confidence scales with
deviation magnitude.

### PR activity monitoring

**Schedule**: part of the proactive scan (odd hours, `:00`).

Monitors open pull requests on all active repos and scores them by:

- Title keywords (breaking/consensus/security: +40, governance: +20)
- Comment count (+1 per 5, max +20)
- Review comments (+1 per 3, max +15)
- Size (>500 lines: +15, >200 lines: +8)
- Age with discussion (>7 days: +10)
- Labels (security/breaking/critical: +25)

**Threshold**: score ≥ 60 triggers a signal.

**Use case**: a PR titled "BREAKING: change consensus rules" with
50 comments is more significant than the merge commit alone. Catches
impact _before_ the code lands.

### How synthesis signals flow

All three follow the same pipeline:

1. Create a signal row under a synthetic monitor
   (`synthesis:thesis` or `proactive:signals`)
2. Anchor to Hedera HCS (best-effort)
3. Score via `scoreAndPersist` (same rubric v4, same agent)
4. If conviction ≥ 70 → `executeAgentTrade` → Propr perps / paper
5. Broadcast to Telegram

The agent's rubric v4 hard caps apply: no pile-ons on existing
positions, reversals require new evidence, news-only signals cap
at 65 conviction.
