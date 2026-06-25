# Deploying LENITNES to testnet

This guide takes the local dev setup to a live, on-chain testnet deploy with real Telegram broadcasts. The full path takes 1-2 hours of focused work.

Two parallel tracks are supported:

- **Arbitrum Sepolia + Robinhood Chain** — the always-on credibility surface.
- **BSC Testnet (BNB Hack, June 22-28)** — the third trading venue. Same code path, separate contracts, different deploy steps.

Pick the track you want; both can run on the same API instance.

## Prerequisites

1. **A testnet wallet.** Generate one with any tool (e.g. `cast wallet new` from Foundry, MetaMask, or `node -e "..."`).
2. **Testnet ETH/BNB for gas.** Get it from a faucet:
   - Arbitrum Sepolia: https://www.alchemy.com/faucets/arbitrum-sepolia
   - BSC Testnet: https://testnet.bnbchain.org/faucet-smart
   - Robinhood Chain: contact the chain team (no public faucet as of June 2026)
   - 0.01 ETH / 0.01 BNB is plenty.
3. **Foundry (forge).** Install:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```
4. **An NVIDIA API key (primary) or Virtuals API key (fallback).** The agent prefers NVIDIA (minimax-m3). Get a key at https://build.nvidia.com. For tests, set `MOCK_AGENT=1` and skip this.
5. **(BSC track only) Trust Wallet Agent Kit.** Used for self-custody signing on BSC.
   ```bash
   npm install -g @trustwallet/cli
   twak init --api-key <id> --api-secret <secret>
   ```
   Get credentials at https://portal.trustwallet.com/dashboard/apps.

## Step 1 — Set up the local repo

```bash
git clone https://github.com/sneldao/lenitnes.git
cd lenitnes
npm install --legacy-peer-deps
cp .env.example .env
```

Generate the required 32-byte hex secrets:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('WEBHOOK_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

Paste each into `.env`.

## Step 2 — Database

```bash
# Locally:
createdb lenitnes
psql -d lenitnes -f db/schema.sql
psql -d lenitnes -f db/migrations/003_pivot.sql
psql -d lenitnes -f db/seed/watchlist.sql
psql -d lenitnes -f db/seed/treasury_wallets.sql

# Or with a hosted Postgres (Supabase, Railway, Neon):
psql $DATABASE_URL -f db/schema.sql
psql $DATABASE_URL -f db/migrations/003_pivot.sql
psql $DATABASE_URL -f db/seed/watchlist.sql
psql $DATABASE_URL -f db/seed/treasury_wallets.sql
```

## Step 3 — Configure `.env` for live trading

```bash
# Treasury / deployer key (32-byte hex, no 0x prefix). Used by the
# forge deploy step AND as the signer for live trades.
EVM_PRIVATE_KEY=ac9d...your-key-here...
TREASURY_PRIVATE_KEY=ac9d...your-key-here...   # same value; config reads TREASURY_PRIVATE_KEY

# LLM provider (primary: NVIDIA, fallback: Virtuals)
NVIDIA_API_KEY=nvapi-...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
AGENT_MODEL=nvidia/minimax-m3
AGENT_TEMPERATURE=1.00
VIRTUALS_API_KEY=acp-...
VIRTUALS_BASE_URL=https://compute.virtuals.io/v1
# For deterministic tests, set MOCK_AGENT=1 and skip API keys.
MOCK_AGENT=0

# Trade execution
TREASURY_DEFAULT_CHAIN=arbitrum       # 'arbitrum' | 'robinhood' | 'bnb'
TREASURY_MODE=live              # 'paper' for paper-only
TREASURY_DEFAULT_AMOUNT=0.01    # amount of tokenIn per trade
TREASURY_SLIPPAGE_BPS=50        # 0.5%

# Telegram public channel
TELEGRAM_BOT_TOKEN=...:AA...
TELEGRAM_PUBLIC_CHANNEL_ID=@lenitnes

# TinyFish detection
TINYFISH_API_KEY=...

# GitHub API (for commit enrichment + backtest)
GITHUB_TOKEN=ghp_...

# Admin (operator surface)
ADMIN_API_KEY=...32-byte-hex...

# Arbitrum Sepolia RPC + Robinhood Chain RPC + deployed addresses
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ROBINHOOD_RPC_URL=https://rpc.testnet.chain.robinhood.com
ARB_SIGNAL_REGISTRY_ADDRESS=0x...
ARB_TRADE_EXECUTOR_ADDRESS=0x...
RH_SIGNAL_REGISTRY_ADDRESS=0x...
RH_TRADE_EXECUTOR_ADDRESS=0x...
ROBINHOOD_SWAP_ROUTER=0x...

# ── BSC Testnet (BNB Hack, June 22-28) ──
BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
BNB_SWAP_ROUTER=0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD
BNB_SIGNAL_REGISTRY_ADDRESS=0x...   # from Step 4b
BNB_TRADE_EXECUTOR_ADDRESS=0x...    # from Step 4b
BNB_DEFAULT_TOKEN_IN=0x...          # BEP-20 USDC on BSC testnet

# ── Trust Wallet Agent Kit (BSC self-custody signing) ──
TWAK_ACCESS_ID=...
TWAK_HMAC_SECRET=...
TWAK_ENABLED=true                   # set false to fall back to direct ethers.Wallet

# ── CoinMarketCap (market context for the agent) ──
CMC_API_KEY=...                     # Pro API key, OR:
X402_ENABLED=false                  # true to use x402 (USDC on Base, ~$0.01/req)
X402_PRIVATE_KEY=...                # only when X402_ENABLED=true; wallet needs USDC on Base (chain 8453)

# ── Hedera HCS proof chain (optional) ──
# Every signal is committed to a Hedera Consensus Service topic as
# an immutable public timestamp. The tx id lands in
# signals.hedera_hcs_message_id and shows up in the scorecard's
# proofCoverage metric. The on-chain key type for the operator
# account MUST match HEDERA_OPERATOR_KEY_TYPE — the SDK's fromString
# auto-detect gets 32-byte raw keys wrong (treats the 0x prefix as
# a DER signal), so we parse explicitly.
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=...             # 32-byte raw secp256k1 (most EVM-derived) or ED25519
HEDERA_OPERATOR_KEY_TYPE=ecdsa      # 'ecdsa' (secp256k1) or 'ed25519' — must match the on-chain key type
HEDERA_TREASURY_ID=0.0.xxxxx
HEDERA_HCS_TOPIC_ID=0.0.xxxxx
```

`MOCK_AGENT=1` works with `TREASURY_MODE=live` — the agent returns a deterministic stub and trades still go through, so you can verify the live-trade plumbing without burning budget. The default is `MOCK_AGENT=0` (real LLM calls).

## Step 4a — Deploy contracts to Arbitrum Sepolia

```bash
cd contracts
forge build
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --private-key $EVM_PRIVATE_KEY \
  --broadcast
```

The deploy prints two addresses:

```
SignalRegistry: 0xABC...
TradeExecutor:  0xDEF...
```

Copy them into `.env`:

```bash
ARB_SIGNAL_REGISTRY_ADDRESS=0xABC...
ARB_TRADE_EXECUTOR_ADDRESS=0xDEF...
```

## Step 4b — Deploy contracts to BSC Testnet (BNB Hack)

Run with `CHAIN=bsc` — the deploy script auto-detects and uses the PancakeSwap V2 router for BSC.

```bash
cd contracts
forge build
CHAIN=bsc forge script script/Deploy.s.sol \
  --rpc-url $BNB_RPC_URL \
  --private-key $EVM_PRIVATE_KEY \
  --broadcast
```

Output:

```
SignalRegistry: 0x05177fa11543cEB73cb18883DFb49B17dc23C862
TradeExecutor:  0xE2Ac333ad2BCD6A0389bf95a059fF576d13EbE8F
```

Copy them into `.env`:

```bash
BNB_SIGNAL_REGISTRY_ADDRESS=0x05177fa11543cEB73cb18883DFb49B17dc23C862
BNB_TRADE_EXECUTOR_ADDRESS=0xE2Ac333ad2BCD6A0389bf95a059fF576d13EbE8F
```

(If you redeploy, the addresses will change. Re-run the seed:demo
after — `signal_outcomes`, `orders`, and the agent_scores for
existing DEMO: signals are unaffected because they key off signal_id,
not contract address.)

Confirm on BSCScan Testnet:

- SignalRegistry: https://testnet.bscscan.com/address/<SIGNAL_REGISTRY>
- TradeExecutor: https://testnet.bscscan.com/address/<TRADE_EXECUTOR>

## Step 5 — Seed the demo (so the scorecard isn't empty)

```bash
WEBHOOK_SECRET=... JWT_SECRET=... ENCRYPTION_KEY=... npm run seed:demo -w @lenitnes/api
```

This processes 3 real public commits through the actual pipeline (ZCash halo2 soundness fix 2022-04-15, ZCash docs commit 2024-08-22, Bitcoin Core wallet commit 2024-09-12). The agent (MOCK stub if no API key) scores each, a paper trade is recorded for the above-threshold one, and real CoinGecko (or fallback) prices are fetched for the outcome windows. The scorecard now has real numbers.

Re-running is idempotent.

## Step 6 — Fund the treasury wallet

The deployed `TradeExecutor` and the treasury wallet (your `EVM_PRIVATE_KEY`) need testnet USDC (or whatever the `tokenIn` is) and ETH/BNB for gas.

- **Arbitrum Sepolia USDC**: bridge from Ethereum Sepolia via the official Arbitrum bridge, or use a Circle testnet faucet.
- **BSC testnet BNB** (for gas + trade): https://testnet.bnbchain.org/faucet-smart
- **BSC testnet USDC** (the trade's tokenIn): no canonical testnet USDC contract on BSC; check the BNB Hack docs for the current address, or use any BEP-20 the operator is willing to spend.

When `TREASURY_MODE=live`, `TREASURY_DEFAULT_CHAIN` decides which chain the next above-threshold trade lands on. Switch with a single env var.

## Step 7 — Start the API

```bash
npm run dev:api
```

Verify the scorecard is live:

```bash
curl http://localhost:4000/scorecard | jq
```

## Step 8 — Trigger the loop

The loop runs automatically on a cron (every check's `frequency_seconds`). To trigger a manual check on a specific monitor:

```bash
curl -X POST http://localhost:4000/monitors/$MONITOR_ID/first-check
```

If detectors fire and the agent scores above 70, you'll see a Telegram post in the channel.

## Step 9 — Confirm a trade on-chain

```bash
cast tx <0xpap...> --rpc-url $ARBITRUM_RPC_URL
# Arbitrum Sepolia explorer: https://sepolia.arbiscan.io/tx/<tx-hash>
# BSC Testnet explorer:    https://testnet.bscscan.com/tx/<tx-hash>
```

The trade will be visible at the explorer for the chain the trade landed on. Trade receipts include a `chain` field (one of `arbitrum` | `robinhood` | `bnb`) so you can route the explorer link accordingly.

## Step 10 — (BSC only) Register on-chain for the BNB Hack leaderboard

```bash
TWAK_WALLET_PASSWORD=<your-tw-ak-wallet-password> ./scripts/register-bnb-hack.sh
```

This calls `twak compete register` against the BNB Hack registry using the agent wallet the script creates locally. The wallet's address is recorded for the live-trading leaderboard (June 22-28). Run this BEFORE the trading window opens.

## What to monitor

- `/admin/status` — daily signal count, agent budget spent vs cap, latest signal
- `/scorecard` — public surface, recomputed on every signal
- Telegram — the broadcast channel

## Going to mainnet

This is the credibility-building phase: testnet, paper, real commits, real prices, public track record. The 60-day paper-trade track record is the proof. After 60 days of clean operation, the same deploy path with a real ETH/USDC source and `TREASURY_MODE=live` is the mainnet path.

The constraint is **time**, not engineering. The system works.

## Troubleshooting

**`vitest` fails with `Cannot find module './rolldown-binding.darwin-arm64.node'` (or `linux-x64-gnu` / `linux-arm64-gnu`)** — npm silently skipped the platform-specific optional dependency for `@rolldown/binding-*`. Re-run with optional deps forced: `npm install --include=optional`. This downloads the native binding for the current platform. (Day 13 had a `postinstall` script that did this automatically; Day 14 removed it because it doubled install time on every CI run — the `--include=optional` workaround is fast enough that the manual flag is acceptable.)

**`schema validation failed — run npm run migrate`** — the API's `validateSchema()` checks that all post-pivot tables exist. Re-run the migrations.

**`MOCK_AGENT=1` doesn't fire** — fixed in Day 13. The agent budget check is now bypassed entirely on the MOCK path (the stub costs nothing, and a developer running seed:demo or a local backtest shouldn't need DAILY_AGENT_BUDGET_USD just to exercise the pipeline). The circuit-breaker is still exercised by the live path (`MOCK_AGENT=` empty or `0`).

**Telegram broadcast not posting** — verify the bot is admin in the channel. `curl https://api.telegram.org/bot<token>/getChat?chat_id=@lenitnes` should return `"ok":true`.

**CoinGecko rate-limited** — the demo seed has a hardcoded fallback table for the 3 demo commits. The live loop's outcome tracker will skip signals when the API is unavailable and backfill when it's back.

**CMC market context failing** — check `CMC_API_KEY` and `CMC_API_KEY` quota. The agent will run without market context if the fetch fails (it's enrichment, not a hard dependency).

**x402 client init fails** — `apps/api/src/services/cmc-x402.ts` imports `wrapAxiosWithPaymentFromConfig` from `@x402/axios` and `ExactEvmScheme` from `@x402/evm`. If your pinned version of `@x402/axios` doesn't export `wrapAxiosWithPaymentFromConfig`, either upgrade (`npm install @x402/axios@latest`) or disable the x402 path by setting `X402_ENABLED=false` — `services/cmc.ts` will fall back to the Pro API key automatically.

**BSC trade goes through but no TWAK signature** — `TWAK_ENABLED` is `false` or `TWAK_ACCESS_ID`/`TWAK_HMAC_SECRET` is unset. The treasury will fall back to direct `ethers.Wallet` signing, which works but forfeits the TWAK special-prize component.

**BSC forge deploy reverts with "insufficient funds"** — the deployer wallet needs BSC testnet BNB for gas. Faucet: https://testnet.bnbchain.org/faucet-smart.

**Hedera HCS writes fail with `INVALID_SIGNATURE`** — the configured `HEDERA_OPERATOR_KEY` is being parsed as the wrong algorithm. The @hashgraph/sdk `PrivateKey.fromString()` auto-detect treats the `0x` prefix as a DER signal and picks ED25519, but the on-chain key for the account is likely ECDSA_SECP256K1. Set `HEDERA_OPERATOR_KEY_TYPE=ecdsa` (or `ed25519` if the account was created via the Hedera portal/SDK default) and rebuild. Verify the public key matches the mirror node (`/api/v1/accounts/<id>` returns the key under `key.key`) before troubleshooting any other HCS issue.

**Worker logs are silent — only the 4 startup lines show, but Redis `bull:monitor-checks:completed` is rising** — pino's default destination is async; lines in flight at SIGTERM are lost. The worker also re-renders nothing at info level for healthy no-op ticks. Production `logger.ts` now passes `pino.destination({ sync: true })` as the second positional arg so stdout flushes synchronously. Symptom check: `docker logs lenitnes-worker-1` should show `github-direct enrichment populated commits` or `skipping — monitor not found or inactive` within a minute of the scheduler tick. If it doesn't, you have an older build; rebuild and restart the worker.

**First monitor signal fires, then nothing for hours — all rows in `monitors` end up `status='triggered'`** — the `dueMonitors()` scheduler query filters `WHERE status='active'`. The loop sets `status='triggered'` when a real signal fires but `executeCheckTransaction` only set `last_check_at`, never reset the status, so every monitor that had ever fired a real signal was silently dropped from the queue. Worker code path `if (!monitor) return` was at debug level (suppressed in production), so the bug was invisible in logs. Fixed: `executeCheckTransaction` now sets `status='active'` alongside `last_check_at` on every tick, and `worker.ts`'s "skipping" log is promoted to `info` so this class of regression surfaces immediately. Manual recovery for an existing stuck DB: `UPDATE monitors SET status = 'active' WHERE status = 'triggered';`

## License

MIT. Fork freely.
