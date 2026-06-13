# LENITNES

**Proof-chained web monitoring that detects code-level signals and executes trades across Kraken, Arbitrum, and Robinhood Chain — powered by AI, Hedera, and EVM smart contracts.**

LENITNES (a.k.a. _Sentinel_) watches GitHub repositories and other web sources for
signals that precede market moves, then routes trades to the optimal venue.
Every signal carries a tamper-evident **proof chain**:

```
╭───────────────╮   ╭──────────────╮   ╭────────────────╮   ╭──────────────────────────╮
│   TinyFish    │──▶│  Hedera HCS  │──▶│   Arbitrum     │──▶│  Execute:                │
│ detect signal │   │  + Grove     │   │  SignalRegistry│   │  Kraken / Arb DEX /      │
│  + classify   │   │  timestamp   │   │  (dual-chain)  │   │  Robinhood Chain stocks  │
╰───────────────╯   ╰──────────────╯   ╰────────────────╯   ╰──────────────────────────╯
```

The defensibility is the receipt: a Hedera consensus timestamp + TinyFish run ID +
Grove-stored proof package proves you detected a _public_ signal at a specific moment and
acted on it — valuable for compliance.

## Why this exists

In 2026, a critical vulnerability sat undiscovered in Zcash's `halo2` cryptographic
circuit code for **four years**. The bug — an unanchored base point in the
incomplete-addition loop — meant anyone could forge proofs and mint unlimited ZEC.
It was found by an AI (Claude 4.8), not by human auditors. When patched, the fix
landed quietly as
[`halo2_gadgets: Anchor variable-base scalar-mul incomplete-addition base`](https://github.com/zcash/halo2/commit/d8e48efddbe4746d76eb2c8a843a6ddc2b9a727a):
technical, understated, easy to scroll past.

The signals were public — an unusually large, urgent commit to core consensus code
with no preceding bug report or discussion — but no one was watching. LENITNES is
what watches. Not for this specific bug (that's formal verification's job), but for
the _pattern_: the sudden patch, the out-of-band urgency, the quiet change to
critical infrastructure that traders, researchers, and protocols need to know about
_before_ the news breaks.

## Core concepts

- **Monitor** — a target URL + a plain-English condition + a check frequency + staked HBAR.
- **Signal** — fires when the condition is met; carries the Hedera timestamp, screenshot/diff, TinyFish run ID, and IPFS CID.
- **Rule** — connects a signal to an action (Kraken order, webhook, Telegram, email), with optional conditions (time-of-day, etc.).
- **x402 On-Demand Execution** — pay per check via Hedera HBAR micropayments through the x402 protocol. No wallet funds touch the backend; payments are settled on-chain in real time.
- **Hedera Agent Kit** — all Hedera operations (HCS message submission, HBAR transfers, topic creation) are executed through the `hedera-agent-kit` plugin architecture rather than direct SDK calls.

## Project structure

```
lenitnes/
├── apps/
│   ├── api/                    Express + TypeScript REST API
│   │   └── src/
│   │       ├── index.ts        Server entry + graceful shutdown
│   │       ├── worker.ts       BullMQ worker entry
│   │       ├── config.ts       Env var loader (includes x402 + trade config)
│   │       ├── types.ts        Domain types (re-exports @lenitnes/types)
│   │       ├── db/             pool.ts · migrate.ts · schema.sql
│   │       ├── middleware/     auth.ts (JWT + cookie) · x402.ts · cache.ts · metrics.ts
│   │       ├── routes/         auth · monitors · signals · rules · orders · kraken · webhooks · execute
│   │       ├── services/       proof (hedera/null) · tinyfish · kraken (CLI+REST) · grove · notify · crypto
│   │       ├── queue/          connection.ts · producer.ts · scheduler.ts · worker.ts (BullMQ)
│   │       └── execution/      loop.ts (check→proof→trade pipeline + safety guards)
│   └── web/                    Next.js + Tailwind frontend
│       └── src/
│           ├── app/            Dashboard · Create Monitor · Signal Proof · Rules · Orders
│           ├── components/     WalletConnect.tsx (HashConnect + x402 signer)
│           └── lib/api.ts      Typed API client (JWT + x402 payment fetch)
├── packages/
│   └── types/                  Shared domain types (consumed by both apps)
├── db/
│   └── schema.sql              PostgreSQL schema
├── .husky/
│   └── pre-commit              lint-staged + tsc + gitleaks
├── eslint.config.mjs
├── prettierrc
└── package.json                 npm workspaces root
```

## Getting started

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env   # fill in all vars (see .env.example comments)

# 3. Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# paste the output as JWT_SECRET in .env

# 4. Create the database schema
npm run migrate --workspace=@lenitnes/api

# 5. Run everything
npm run dev:api    # API on :4000
npm run dev:web    # Web on :3000
npm run worker --workspace=@lenitnes/api   # execution loop (separate terminal)
```

## API

```
POST   /auth/login              Ed25519 sig verify + set httpOnly JWT cookie
GET    /auth/me                 current user (reads cookie)
POST   /auth/logout             clear cookie
GET    /health                  health check (no auth)

POST   /monitors                create monitor (no escrow/stake required)
GET    /monitors                list own monitors
GET    /monitors/:id            monitor detail + signal history
PATCH  /monitors/:id            update frequency / condition / top-up / status
DELETE /monitors/:id            pause + zero balance

GET    /orders                  list orders with Kraken status
GET    /orders/sync             sync placed order statuses from Kraken
POST   /orders/:id/cancel       cancel a placed order via Kraken API

GET    /signals                 list signals
GET    /signals/:id             signal detail + proof chain

POST   /rules                   create a rule
GET    /rules                   list rules
DELETE /rules/:id               delete a rule

POST   /kraken/configure        validate + store encrypted Kraken keys
DELETE /kraken/configure        remove stored keys
GET    /kraken/status           key configured? CLI available?
POST   /kraken/test-trade       paper trade (validate mode)
GET    /kraken/balance          current Kraken balance

POST   /webhooks/kraken         receive Kraken confirmations (HMAC verified)
POST   /execute/:monitorId      on-demand execution via x402 micropayment
```

Auth is via **httpOnly cookie** (`lenitnes_token`). The frontend uses `credentials: 'include'` on all requests. The x402 `/execute` endpoint reads the cookie first, then falls back to `Authorization: Bearer` for backward compatibility.

## Execution loop

For each due monitor (`apps/api/src/execution/loop.ts`):

1. **Atomic balance debit** — `UPDATE monitors SET hbar_balance = hbar_balance - cost WHERE id = $1 AND hbar_balance >= $1` prevents race conditions.
2. **Write heartbeat** via pluggable proof service (Hedera HCS by default, or `none` mode).
3. **Run TinyFish** against the URL with the NL condition (circuit breaker + scraper fallback).
4. **No signal** → store heartbeat and stop.
5. **Signal** → package proof, upload to Grove (Lens Protocol).
6. **Timestamp signal** via proof service (HCS message with signal ID, monitor ID, evidence).
7. **Execute rules** with safety guards:
   - **Pair cooldown** — skip if same user+pair traded within cooldown window (default 15 min).
   - **Max open orders** — prevent unbounded live orders (default 10).
   - **Zod validation** — trade config schema validates before any Kraken call.
   - **Order types** — market, limit, stop-loss, take-profit, stop-loss-limit, take-profit-limit.
8. **Store receipt** — Kraken order ID + response against the signal.

### x402 On-Demand Execution

The `POST /execute/:monitorId` endpoint is gated by the **x402** micropayment middleware (`apps/api/src/middleware/x402.ts`). The flow:

1. Frontend calls the endpoint with an x402-enabled `fetch` (provided by `WalletConnect.tsx`).
2. The backend returns a `402 Payment Required` with an x402 payment requirement.
3. The client signs a Hedera `TransferTransaction` via HashConnect and resubmits.
4. The x402 middleware verifies settlement on-chain via Blocky402.
5. On success, `executeCheck` runs with `skipDebit: true` (the x402 payment itself is the fee).
6. The full check→proof→signal pipeline executes immediately and returns results.

This tightly couples payment and execution — no credit, no execution — and all funds move on-chain.

## Deployment

### Coolify + Vultr (Self-Hosted — Production-Ready)

The fastest path to a live, SSL-terminated stack on your own server:

| Component | Setup                                    | Why                                     |
| --------- | ---------------------------------------- | --------------------------------------- |
| Server    | Vultr (or any VPS) with Docker + Coolify | $20–$40/mo, full control                |
| Frontend  | Next.js container behind Traefik (SSL)   | Auto Let's Encrypt via Coolify          |
| API       | Express container behind Traefik (SSL)   | Same domain `/api` path prefix          |
| Worker    | Standalone cron container                | No inbound ports needed                 |
| Database  | PostgreSQL 15 (Docker volume)            | Managed via docker-compose, auto-backup |

**Prerequisites:**

- VPS with Docker & Docker Compose
- [Coolify](https://coolify.io) installed (handles Traefik + Let's Encrypt)
- DNS A record: `lenitnes.yourdomain.com` → server IP

**Deploy:**

```bash
# 1. Clone / sync repo to server
git clone https://github.com/sneldao/lenitnes.git ~/lenitnes
cd ~/lenitnes

# 2. Create .env (see table below for required vars)
cp .env.example .env
nano .env

# 3. Build all images
sudo docker compose build

# 4. Start stack
sudo docker compose up -d

# 5. Verify
# API health:  curl https://lenitnes.yourdomain.com/api/health
# Web frontend: curl https://lenitnes.yourdomain.com
```

**How routing works:**

- Traefik (managed by Coolify) reads Docker labels on the `coolify` network.
- `lenitnes.persidian.com/` → web container (:3000)
- `lenitnes.persidian.com/api/*` → api container (:4000), `/api` stripped
- `NEXT_PUBLIC_API_URL=https://lenitnes.persidian.com/api` is baked into the web build.

**Auto-start on boot:**

```bash
sudo systemctl enable lenitnes.service
```

### Railway / Vercel (Alternative)

1. Railway: create project → add PostgreSQL → deploy API (`npm run start`) + Worker (`npm run worker`).
2. Vercel: connect repo → root directory `apps/web` → add `NEXT_PUBLIC_API_URL`.
3. Run migrations: `npm run migrate --workspace=@lenitnes/api`.

### Environment variables

| Variable                             | Description                                             |
| ------------------------------------ | ------------------------------------------------------- |
| `DATABASE_URL`                       | PostgreSQL connection string                            |
| `REDIS_URL`                          | Redis connection string (e.g. `redis://localhost:6379`) |
| `HEDERA_NETWORK`                     | `testnet` or `mainnet`                                  |
| `HEDERA_OPERATOR_ID`                 | Hedera operator account ID                              |
| `HEDERA_OPERATOR_KEY`                | Hedera operator private key                             |
| `HEDERA_TREASURY_ID`                 | Platform treasury account ID                            |
| `HEDERA_HCS_TOPIC_ID`                | HCS topic for signal/heartbeat records                  |
| `DEFAULT_COST_PER_CHECK_HBAR`        | Per-check fee (default: 0.5)                            |
| `TINYFISH_API_KEY`                   | TinyFish SDK API key                                    |
| `GROVE_CHAIN_ID`                     | Lens Protocol Grove chain ID (37111 = testnet)          |
| `ENCRYPTION_KEY`                     | 32-byte AES-256 key for Kraken key encryption           |
| `JWT_SECRET`                         | 32+ char random string for JWT signing                  |
| `WEBHOOK_SECRET`                     | HMAC secret for `/webhooks/kraken` verification         |
| `PROOF_MODE`                         | `hedera` (default) or `none` — proof service backend    |
| `TRADE_COOLDOWN_MINUTES`             | Minimum gap between same-pair trades (default: 15)      |
| `KRAKEN_CANCEL_AFTER_SECONDS`        | Auto-cancel un-filled orders (default: 300)             |
| `MAX_OPEN_ORDERS`                    | Max live orders per user (default: 10)                  |
| `TELEGRAM_BOT_TOKEN`                 | Telegram bot token (optional)                           |
| `SMTP_URL`                           | Email relay URL (optional)                              |
| `X402_FACILITATOR_URL`               | x402 facilitator (e.g. `https://blocky402.com`)         |
| `X402_HEDERA_NETWORK`                | `testnet` or `mainnet` for x402 verification            |
| `X402_PAY_TO`                        | Treasury account receiving x402 payments                |
| `X402_PRICE_HBAR`                    | Price per on-demand check (default: 0.5)                |
| `NEXT_PUBLIC_API_URL`                | Public API base URL (frontend)                          |
| `NEXT_PUBLIC_HASHCONNECT_PROJECT_ID` | HashConnect project ID (frontend)                       |
| `NEXT_PUBLIC_HEDERA_NETWORK`         | `testnet` or `mainnet` (frontend wallet network)        |
| `EVM_PRIVATE_KEY`                    | Private key for Arbitrum + Robinhood Chain deployments  |
| `ARBITRUM_RPC_URL`                   | Arbitrum Sepolia RPC (default: public endpoint)         |
| `ROBINHOOD_RPC_URL`                  | Robinhood Chain testnet RPC (default: public endpoint)  |
| `ARB_SIGNAL_REGISTRY_ADDRESS`        | Deployed SignalRegistry on Arbitrum Sepolia             |
| `ARB_TRADE_EXECUTOR_ADDRESS`         | Deployed TradeExecutor on Arbitrum Sepolia              |
| `RH_SIGNAL_REGISTRY_ADDRESS`         | Deployed SignalRegistry on Robinhood Chain              |
| `RH_TRADE_EXECUTOR_ADDRESS`          | Deployed TradeExecutor on Robinhood Chain               |
| `ROBINHOOD_SWAP_ROUTER`              | Swap router address on Robinhood Chain                  |

## Deployment status

| Service       | URL                                         | Status     |
| ------------- | ------------------------------------------- | ---------- |
| Web frontend  | `https://lenitnes.persidian.com`            | Live (SSL) |
| API health    | `https://lenitnes.persidian.com/api/health` | Live (SSL) |
| Server        | Vultr VPS — `144.202.117.160`               | Running    |
| Orchestration | Coolify + Traefik + Let's Encrypt           | Active     |

**Current stack:**

- **Hedera:** testnet — operator `0.0.9137770`, HCS topic `0.0.9159618`
- **Proof storage:** Grove (Lens Protocol) — immutable JSON uploads
- **Queue:** BullMQ + Redis 7 — scheduled checks with concurrency=5, 2 retries, exponential backoff
- **Notifications:** Telegram bot + SMTP relay + webhooks
- **Auth:** Ed25519 signature verification + JWT in httpOnly cookie
- **x402:** pay-per-check via HBAR micropayments (testnet)
- **Logging:** Pino (structured JSON) + pino-pretty in dev
- **Cache:** In-memory TTL cache with MAX_SIZE=500 eviction

**Frontend notes:**

- HashConnect project ID required for wallet connection. Get one at [hashpack.app/developers](https://hashpack.app/developers), then set `NEXT_PUBLIC_HASHCONNECT_PROJECT_ID` and rebuild the web image.
- `NEXT_PUBLIC_HEDERA_NETWORK` controls LedgerId (testnet/mainnet) for wallet connection.
- Template picker on the New Monitor page shows 10 pre-configured monitors — click any to pre-fill URL, condition, and frequency.
- Unauthenticated users see the landing page with the real Zcash halo2 case study, proof chain diagram, and template cards.

## Testing

```bash
npm test              # smoke test (API + web)
npm run typecheck     # TypeScript type-check all workspaces
npm run lint           # ESLint all workspaces
```

## Pre-commit hooks

Every commit runs automatically:

1. `tsc --noEmit` — type-check staged files
2. `eslint --fix` + `prettier --write` — format and lint
3. `gitleaks` — scan for leaked secrets

Install gitleaks: `brew install gitleaks` (macOS) or see https://github.com/gitleaks/gitleaks

## Hackathon notes

- **Multi-chain execution:** Kraken (CEX) + Arbitrum Sepolia (DEX via Uniswap V3) + Robinhood Chain (tokenized stocks). Auto-routing by asset type.
- **Smart contracts:** `SignalRegistry.sol` (on-chain signal hash storage, dual-chain) + `TradeExecutor.sol` (Uniswap-compatible swaps). Foundry-built, MIT licensed.
- **Typed signal detectors:** 8 pure-function detectors classify code changes (emergency_patch, security_critical, governance_shift, etc.). Backtest engine correlates signals with price outcomes.
- **Proof chain:** TinyFish detection → Hedera HCS + Arbitrum SignalRegistry → Grove storage → Kraken / Arbitrum DEX / Robinhood Chain execution. Every link verifiable.
- **x402** micropayment protocol for pay-per-request on-demand execution (Blocky402 facilitator).
- **HashConnect** wallet connection with `NEXT_PUBLIC_HEDERA_NETWORK` env var for testnet/mainnet switching.
- **Kraken integration:** CLI preferred, REST fallback. Supports 6 order types (market, limit, stop-loss, take-profit, stop-loss-limit, take-profit-limit) with auto-cancel dead-man's switch.
- **Trade safety:** pair cooldown (15 min), max open orders (10), Zod schema validation before any Kraken call.
- **Kraken key validation:** `/kraken/configure` pre-validates keys with a balance check + validate-mode trade before saving encrypted credentials.
- **TinyFish** natural-language web intelligence for signal detection with screenshot evidence.
- **Queue architecture:** BullMQ + Redis 7 for reliable, concurrent monitor execution (5 workers, 2 retries, exponential backoff).
- **Auth:** Ed25519 signature verification → httpOnly JWT cookie → all API calls use `credentials: 'include'`.
- **Frontend:** Toast system (success/error/warn/info), auth-gated queries (no 401 spam), print-to-PDF proof pages, template picker, P&L on orders page, signal activity chart.
- **Public repo + live demo:** [lenitnes.persidian.com](https://lenitnes.persidian.com)
- Demo flow: connect wallet → pick a template (e.g. Zcash halo2 watch) → create monitor → background checks every 30 min → on signal: Hedera timestamp + Grove proof + Kraken alert, in < 60s.
- On-demand flow: click **Execute** on any monitor → x402 HBAR micropayment → real-time check → results.
