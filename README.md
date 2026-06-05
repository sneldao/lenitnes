# LENITNES

**Proof-chained web monitoring that detects market signals and executes trades.**

LENITNES (a.k.a. _Sentinel_) watches GitHub repositories and other web sources for
signals that precede crypto market moves, then alerts or executes trades on Kraken.
Every signal carries a tamper-evident **proof chain**:

```diagram
╭───────────────╮   ╭──────────────╮   ╭────────────────╮   ╭──────────────╮
│   TinyFish    │──▶│    Hedera     │──▶│      IPFS       │──▶│    Kraken     │
│ detect signal │   │ HCS timestamp │   │ pin proof pkg  │   │ alert / trade │
│  + screenshot │   │ + micropay    │   │     (CID)      │   │   (receipt)   │
╰───────────────╯   ╰──────────────╯   ╰────────────────╯   ╰──────────────╯
```

The defensibility is the receipt: a Hedera consensus timestamp + TinyFish run ID +
IPFS-pinned screenshot proves you detected a *public* signal at a specific moment and
acted on it — valuable for compliance.

## Core concepts

- **Monitor** — a target URL + a plain-English condition + a check frequency + staked HBAR.
- **Signal** — fires when the condition is met; carries the Hedera timestamp, screenshot/diff, TinyFish run ID, and IPFS CID.
- **Rule** — connects a signal to an action (Kraken order, webhook, Telegram, email), with optional conditions (time-of-day, etc.).

## Architecture

| Layer    | Tech                                             | Location        |
| -------- | ------------------------------------------------ | --------------- |
| Frontend | Next.js + Tailwind (Vercel)                      | `apps/web`      |
| Backend  | Node.js / Express + TypeScript (Railway/Render)  | `apps/api`      |
| Worker   | node-cron execution loop                         | `apps/api` (`worker.ts`) |
| Database | PostgreSQL (Supabase/Railway)                    | `db/schema.sql` |
| Hedera   | `@hashgraph/sdk` — escrow, micropayments, HCS    | `apps/api/src/services/hedera.ts` |
| TinyFish | NL web-intelligence agent + screenshots          | `apps/api/src/services/tinyfish.ts` |
| Kraken   | REST API (market/limit orders)                   | `apps/api/src/services/kraken.ts` |
| Storage  | IPFS via Pinata / Web3.Storage                   | `apps/api/src/services/ipfs.ts` |
| Wallet   | HashConnect (browser HBAR staking)               | `apps/web` (TODO) |

## Getting started

```bash
# 1. Install (npm workspaces)
npm install

# 2. Configure
cp .env.example .env   # fill in Hedera, TinyFish, Kraken, IPFS, DB

# 3. Create the database schema
npm run migrate --workspace=@lenitnes/api

# 4. Run everything
npm run dev:api    # API on :4000
npm run dev:web    # Web on :3000
npm run worker --workspace=@lenitnes/api   # execution loop
```

## API

```
POST   /monitors          create monitor, provision escrow
GET    /monitors          list monitors
GET    /monitors/:id      monitor detail + signal history
PATCH  /monitors/:id      update frequency / condition / top-up / status
DELETE /monitors/:id      pause + release remaining escrow

GET    /signals           list signals (heartbeats excluded by default)
GET    /signals/:id       signal detail + full proof package

POST   /rules             create a rule
GET    /rules             list rules

POST   /webhooks/kraken   receive Kraken order confirmations
```

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

## Hackathon notes

- Built using the **Hedera Agent Kit / `@hashgraph/sdk`** (JS).
- Public repo + live demo (Vercel frontend, Railway backend), kept live for 90 days.
- Demo flow: create a monitor on a real repo → push a commit with "security fix" →
  TinyFish detection → Hedera timestamp → IPFS proof → Kraken alert/paper-trade, in < 60s.

> ⚠️ Service integrations (TinyFish SDK, Web3.Storage upload, HashConnect signing) are
> scaffolded with clear `TODO`s where real credentials/SDK wiring is required.
