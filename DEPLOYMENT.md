# Deploying LENITNES to testnet

This guide takes the local dev setup to a live, on-chain testnet deploy with real Telegram broadcasts. The full path takes 1-2 hours of focused work.

## Prerequisites

1. **A testnet wallet.** Generate one with any tool (e.g. `cast wallet new` from Foundry, MetaMask, or `node -e "..."`).
2. **Arbitrum Sepolia ETH for gas.** Get it from a faucet:
   - https://www.alchemy.com/faucets/arbitrum-sepolia
   - https://www.sepoliafaucet.com (bridge to Arbitrum)
   - 0.01 ETH is plenty.
3. **Foundry (forge).** Install:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```
4. **A Virtuals / OpenAI-compatible LLM key.** The agent defaults to Virtuals (Kimi K2). Get one at https://compute.virtuals.io. For tests, set `MOCK_AGENT=1` and skip this.

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
# Treasury / deployer key (32-byte hex, no 0x prefix)
TREASURY_PRIVATE_KEY=ac9d...your-key-here...

# LLM provider
VIRTUALS_API_KEY=acp-...
VIRTUALS_BASE_URL=https://compute.virtuals.io/v1
AGENT_MODEL=moonshotai/kimi-k2-0905
# For deterministic tests, set MOCK_AGENT=1 and skip the API key.
MOCK_AGENT=

# Trade execution
TREASURY_DEFAULT_CHAIN=arbitrum
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

# Arbitrum Sepolia RPC
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ROBINHOOD_RPC_URL=https://rpc.testnet.chain.robinhood.com
```

## Step 4 — Deploy contracts

```bash
cd contracts
forge build
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --private-key $TREASURY_PRIVATE_KEY \
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

## Step 5 — Seed the demo (so the scorecard isn't empty)

```bash
WEBHOOK_SECRET=... JWT_SECRET=... ENCRYPTION_KEY=... npm run seed:demo -w @lenitnes/api
```

This processes 3 real public commits through the actual pipeline (ZCash halo2 soundness fix 2022-04-15, ZCash docs commit 2024-08-22, Bitcoin Core wallet commit 2024-09-12). The MOCK agent scores each, a paper trade is recorded for the above-threshold one, and real CoinGecko (or fallback) prices are fetched for the outcome windows. The scorecard now has real numbers.

Re-running is idempotent.

## Step 6 — Fund the treasury wallet

The deployed `TradeExecutor` and the treasury wallet (your `TREASURY_PRIVATE_KEY`) need testnet USDC (or whatever the `tokenIn` is) and ETH for gas.

For Arbitrum Sepolia USDC: bridge from Ethereum Sepolia via the official Arbitrum bridge, or use a Circle testnet faucet.

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
# or for live trades:
cast tx <0xREAL...> --rpc-url $ARBITRUM_RPC_URL
```

The trade will be visible at https://sepolia.arbiscan.io/tx/<tx-hash>.

## What to monitor

- `/admin/status` — daily signal count, agent budget spent vs cap, latest signal
- `/scorecard` — public surface, recomputed on every signal
- Telegram — the broadcast channel

## Going to mainnet

This is the credibility-building phase: testnet, paper, real commits, real prices, public track record. The 60-day paper-trade track record is the proof. After 60 days of clean operation, the same deploy path with a real ETH/USDC source and `TREASURY_MODE=live` is the mainnet path.

The constraint is **time**, not engineering. The system works.

## Troubleshooting

**`schema validation failed — run npm run migrate`** — the API's `validateSchema()` checks that all post-pivot tables exist. Re-run the migrations.

**`MOCK_AGENT=1` doesn't fire** — the agent budget check fires before the MOCK check. Set `DAILY_AGENT_BUDGET_USD=100` in `.env` to give it room.

**Telegram broadcast not posting** — verify the bot is admin in the channel. `curl https://api.telegram.org/bot<token>/getChat?chat_id=@lenitnes` should return `"ok":true`.

**CoinGecko rate-limited** — the demo seed has a hardcoded fallback table for the 3 demo commits. The live loop's outcome tracker will skip signals when the API is unavailable and backfill when it's back.

## License

MIT. Fork freely.
