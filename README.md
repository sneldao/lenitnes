# LENITNES

**Proof-chained web monitoring that detects market signals and executes trades.**

LENITNES (a.k.a. _Sentinel_) watches GitHub repositories and other web sources for
signals that precede crypto market moves, then alerts or executes trades on Kraken.
Every signal carries a tamper-evident **proof chain**:

```
╭───────────────╮   ╭──────────────╮   ╭────────────────╮   ╭──────────────╮
│   TinyFish    │──▶│    Hedera     │──▶│      IPFS       │──▶│    Kraken     │
│ detect signal │   │ HCS timestamp │   │ pin proof pkg  │   │ alert / trade │
│  + screenshot │   │ + micropay    │   │     (CID)      │   │   (receipt)   │
╰───────────────╯   ╰──────────────╯   ╰────────────────╯   ╰──────────────╯
```

The defensibility is the receipt: a Hedera consensus timestamp + TinyFish run ID +
IPFS-pinned screenshot proves you detected a _public_ signal at a specific moment and
acted on it — valuable for compliance.

## Core concepts

- **Monitor** — a target URL + a plain-English condition + a check frequency + staked HBAR.
- **Signal** — fires when the condition is met; carries the Hedera timestamp, screenshot/diff, TinyFish run ID, and IPFS CID.
- **Rule** — connects a signal to an action (Kraken order, webhook, Telegram, email), with optional conditions (time-of-day, etc.).

## Project structure

```
lenitnes/
├── apps/
│   ├── api/                    Express + TypeScript REST API
│   │   └── src/
│   │       ├── index.ts        Server entry + graceful shutdown
│   │       ├── worker.ts       Cron execution loop
│   │       ├── config.ts       Env var loader
│   │       ├── types.ts        Domain types (re-exports @lenitnes/types)
│   │       ├── db/             pool.ts · migrate.ts
│   │       ├── middleware/     auth.ts (JWT Bearer)
│   │       ├── routes/         auth · monitors · signals · rules · webhooks
│   │       ├── services/       hedera · tinyfish · kraken · ipfs · notify · crypto
│   │       └── execution/      loop.ts (8-step check→proof→trade pipeline)
│   └── web/                    Next.js + Tailwind frontend
│       └── src/
│           ├── app/            Dashboard · Create Monitor · Signal Proof · Rules
│           └── lib/api.ts      Typed API client
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
POST   /auth/login              upsert user + return JWT
GET    /health                 health check (no auth)

POST   /monitors               create monitor, provision escrow
GET    /monitors               list own monitors
GET    /monitors/:id           monitor detail + signal history
PATCH  /monitors/:id           update frequency / condition / top-up / status
DELETE /monitors/:id           pause + release remaining escrow

GET    /signals                list signals (heartbeats excluded by default)
GET    /signals/:id            signal detail + full proof package

POST   /rules                  create a rule
GET    /rules                  list rules

POST   /webhooks/kraken        receive Kraken order confirmations
```

All routes under `/monitors`, `/signals`, `/rules` require a `Authorization: Bearer <token>` header.

## Execution loop

For each due monitor (`apps/api/src/execution/loop.ts`):

1. **Balance check** — pause if below one check cost.
2. **Debit micropayment** + write an HCS heartbeat (immutable "check ran" record).
3. **Run TinyFish** against the URL with the NL condition.
4. **No signal** → store a heartbeat and stop.
5. **Signal** → package proof, pin to IPFS.
6. **Write signal to HCS** (on-chain proof).
7. **Execute rules** (Kraken order / webhook / Telegram / email).
8. **Store Kraken receipt** against the signal.

## Deployment

### Railway (API + Worker)

1. Create a new Railway project.
2. Add a PostgreSQL database (Railway → Add Plugin → PostgreSQL).
3. Add a new **Railway Service** for the API:
   - Build command: `npm run build --workspace=@lenitnes/api`
   - Start command: `npm run start --workspace=@lenitnes/api`
   - Environment variables: copy all vars from `.env.example`
4. Add a second Railway Service for the worker:
   - Build command: `npm run build --workspace=@lenitnes/api`
   - Start command: `npm run worker --workspace=@lenitnes/api`
   - Environment variables: same as above
5. Run migrations: `npm run migrate --workspace=@lenitnes/api`

### Vercel (Frontend)

1. Connect the repo to Vercel.
2. Set root directory to `apps/web`.
3. Add environment variables: `NEXT_PUBLIC_API_URL` (your Railway API URL), `NEXT_PUBLIC_HASHCONNECT_PROJECT_ID`, `NEXT_PUBLIC_HEDERA_NETWORK`.
4. Deploy.

### Environment variables

| Variable                             | Description                                   |
| ------------------------------------ | --------------------------------------------- |
| `DATABASE_URL`                       | PostgreSQL connection string                  |
| `HEDERA_NETWORK`                     | `testnet` or `mainnet`                        |
| `HEDERA_OPERATOR_ID`                 | Hedera operator account ID                    |
| `HEDERA_OPERATOR_KEY`                | Hedera operator private key                   |
| `HEDERA_TREASURY_ID`                 | Platform treasury account ID                  |
| `HEDERA_HCS_TOPIC_ID`                | HCS topic for signal/heartbeat records        |
| `DEFAULT_COST_PER_CHECK_HBAR`        | Per-check fee (default: 0.5)                  |
| `TINYFISH_API_KEY`                   | TinyFish SDK API key                          |
| `PINATA_JWT`                         | Pinata JWT for IPFS pinning                   |
| `ENCRYPTION_KEY`                     | 32-byte AES-256 key for Kraken key encryption |
| `JWT_SECRET`                         | 32+ char random string for JWT signing        |
| `TELEGRAM_BOT_TOKEN`                 | Telegram bot token (optional)                 |
| `NEXT_PUBLIC_API_URL`                | Public API base URL (frontend)                |
| `NEXT_PUBLIC_HASHCONNECT_PROJECT_ID` | HashConnect project ID (frontend)             |

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

- Built using the **Hedera Agent Kit / `@hashgraph/sdk`** (JS).
- Public repo + live demo (Vercel frontend, Railway backend), kept live for 90 days.
- Demo flow: create a monitor on a real repo → push a commit with "security fix" →
  TinyFish detection → Hedera timestamp → IPFS proof → Kraken alert/paper-trade, in < 60s.

> ⚠️ Service integrations (TinyFish SDK, Web3.Storage upload, HashConnect signing) are
> scaffolded with clear `TODO`s where real credentials/SDK wiring is required.
