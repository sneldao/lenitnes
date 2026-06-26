# LENITNES — Operator Runbook

Short reference for operating the live trading path. Reading order:
**preflight → first live trade → emergency exit**.

---

## Preflight checklist (before enabling live trading)

The agent ships with `TRADING_ENABLED=false` by default. Every gate
below must pass before flipping that switch in production.

1. **Asset registry membership.** Confirm the asset(s) you intend to
   trade live appear in `apps/api/src/services/treasury/asset-registry.ts`
   with a verified token address. Cross-check the address on BscScan
   against the official Binance-Peg token list. Only BTC + ETH are
   pre-registered on BSC mainnet — L1s (SOL/SUI/ZEC) are deliberately
   omitted because they have no canonical BEP-20 with deep liquidity.

2. **Treasury wallet funded.** The treasury address
   `0x4dA649DeB07159E791C423bb139e6213e745D138` (or your equivalent)
   must hold:
   - Enough native BNB to cover `TREASURY_DEFAULT_AMOUNT` × max
     concurrent positions, plus ~0.005 BNB per swap for gas.
   - Enough BNB above `GAS_WARNING_THRESHOLD` (default 0.02) to
     avoid the low-gas circuit alert.

3. **Slippage + liquidity gates set.** Defaults are sane:
   - `TREASURY_SLIPPAGE_BPS=50` (0.5%)
   - Per-asset `minPoolTvlUsd` in the registry (default $5M for BTC/ETH)
   - Per-asset `minDailyVolumeUsd` ($1M default; requires `CMC_API_KEY`)

4. **TP/SL defaults reviewed.** Conviction-scaled around:
   - `POSITION_TAKE_PROFIT_BPS=1500` (+15%, tilted by conviction)
   - `POSITION_STOP_LOSS_BPS=700` (−7%, fixed)
     These fire via the 5-min `checkTakeProfitStopLoss` scheduler.

5. **Position caps configured.**
   - `MAX_CONCURRENT_POSITIONS=5` — global ceiling
   - `MAX_PER_ASSET_POSITIONS=1` — no concentration

6. **Admin API key set.** `ADMIN_API_KEY` non-empty so manual close
   is available if the auto-close path fails.

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

## Quick reference — what each kill switch does

| Switch                         | Default | What it stops                                                       |
| ------------------------------ | ------- | ------------------------------------------------------------------- |
| `TRADING_ENABLED=false`        | yes     | Every live swap. Signals + scoring continue, trades route to paper. |
| `TREASURY_MODE=paper`          | yes     | Same as above (older toggle). Both must be true for live.           |
| Asset not in registry          | n/a     | Live swap for that asset; downgraded to paper.                      |
| Pool TVL below floor           | n/a     | Live swap for that asset on that chain.                             |
| 24h volume below floor         | n/a     | Live swap for that asset (CMC-gated).                               |
| `MAX_CONCURRENT_POSITIONS` hit | 5       | New live opens; existing positions unaffected.                      |
| `MAX_PER_ASSET_POSITIONS` hit  | 1       | Concentration in one asset; close existing first.                   |
