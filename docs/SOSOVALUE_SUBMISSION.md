# LENITNES × SoSoValue Buildathon

**An autonomous AI trading agent that reads on-chain finance news and executes on SoDEX's orderbook — all without human input.**

---

## What was built

Three interconnected phases that extend LENITNES (an existing autonomous trading agent) with SoSoValue data feeds and SoDEX execution:

### Phase 1 — SoSoValue Terminal Integration

- **SoSoValue API client** (`apps/api/src/services/data-providers/sosovalue/`) — 7 endpoints:
  - Currency list + market snapshot (price, market cap, ATH, cycle data)
  - News feed + keyword search (headlines, sentiment, related currencies)
  - Macro-economic events (GDP, CPI, Fed decisions)
  - Index snapshots (BTC dominance, ETH staking ratio, etc.)
- **9th signal detector** (`apps/api/src/services/detectors/news-signal.ts`) — keyword-matches news items against bullish/bearish terms. 30+ keywords covering sentiment, security, governance, regulation.
- **Agent context enrichment** — when SoSoValue is configured, the LLM receives macro context + index snapshots alongside commit data for broader scoring.
- **REST API routes** — public `/sosovalue/news`, `/sosovalue/news/search`, `/sosovalue/macro`, `/sosovalue/index/snapshots`.

### Phase 2 — Data Provider Abstraction

- **Provider interfaces** (`services/data-providers/types.ts`) — `MarketDataProvider` + `PriceDataProvider`
- **Provider registry** — CMC, CoinGecko, SoSoValue behind a unified facade
- Result: new data sources can be added without touching detector or treasury code.

### Phase 3 — SoDEX Execution Venue

- **Venue abstraction** (`services/venues/types.ts`) — `Venue` interface: `getQuote`, `getPoolTvlUsd`, `openSwap`, `closeSwap`
- **PancakeSwap V2 venue** — existing AMM trading moved behind the interface
- **SoDEX venue** (`services/venues/sodex/`) — central limit orderbook integration:
  - **EIP-712 signed orders** — typed data signing for ExchangeAction (payloadHash + nonce)
  - **Orderbook depth quoting** — `GET /markets/{symbol}/orderbook` → walk bids/asks for realistic fill estimates
  - **Market orders** — BUY via `funds` (quote currency), SELL via `quantity` (base currency)
  - **Symbol lookup** — `GET /markets/symbols` for dynamic symbolID resolution
  - **Public market data** — no API key required for orderbook reads
- **Venue registry** — auto-initializes at boot; SoDEX activates only when credentials present

### Notarization

Every signal is notarized on Hedera HCS + Arbitrum SignalRegistry + IPFS, producing an immutable proof chain across three layers.

---

## Data flow

```
SoSoValue News Feed                  SoSoValue Macro/Index API
        │                                      │
        ▼                                      ▼
  news-signal detector ───┬─── agent context enrichment
        │                  │
        ▼                  ▼
  classification[]    macro context + index snapshots
        │                  │
        └──────┬───────────┘
               ▼
        LLM scoring (Kimi K2)
        conviction 0–100
               │
         ≥ 80? ── no ──► archive
               │
              yes
               │
               ▼
        Safety gates
        (kill switch, asset registry, TVL floor, ...)
               │
          pass? ── no ──► paper mode
               │
              yes
               │
               ▼
        Venue routing
               │
        ┌──────┴──────┐
        ▼              ▼
  PancakeSwap V2    SoDEX CLOB
  (BSC, AMM)        (ValueChain, orderbook)
        │              │
        └──────┬───────┘
               ▼
        Hedge HCS + Arbitrum notarization
        Telegram broadcast
```

---

## Key files

| File                                                      | Purpose                                               |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `apps/api/src/services/data-providers/sosovalue/index.ts` | SoSoValue API client (7 endpoints)                    |
| `apps/api/src/services/data-providers/sosovalue/types.ts` | SoSoValue type definitions                            |
| `apps/api/src/services/detectors/news-signal.ts`          | News sentiment detector (9th detector)                |
| `apps/api/src/services/data-providers/types.ts`           | MarketDataProvider + PriceDataProvider interfaces     |
| `apps/api/src/services/data-providers/registry.ts`        | Provider registry (CMC, CoinGecko, SoSoValue)         |
| `apps/api/src/services/venues/types.ts`                   | Venue interface                                       |
| `apps/api/src/services/venues/registry.ts`                | Venue registry + auto-init                            |
| `apps/api/src/services/venues/sodex/index.ts`             | SoDEX venue (quoting, order placement)                |
| `apps/api/src/services/venues/sodex/signing.ts`           | EIP-712 typed data signing                            |
| `apps/api/src/services/venues/pancakeswap/index.ts`       | PancakeSwap V2 venue                                  |
| `apps/api/src/routes/sosovalue.ts`                        | Express routes for SoSoValue data                     |
| `apps/api/src/execution/loop.ts`                          | Main execution loop (news enrichment + trade routing) |

---

## SoSoValue Integration Detail

### News feed → signal detection

```
SoSoValue /news/search?keyword=<coingeckoId>
        │
        ▼
  news-signal.ts — classifies each item:
    - bullish keywords → confidence += 20
    - bearish keywords → confidence += 20 (short bias)
    - high-profile match → confidence += 10
        │
        ▼
  SignalClassification[] fed into LLM scoring
```

The news detector uses the same `SignalDetector` interface as the 8 commit-based detectors, so zero changes to the existing pipeline were needed. It activates via an optional `news` field on `DetectorInput`.

### Macro + index context for agent scoring

Before the LLM scores each signal, the execution loop builds a `macroContext` string (upcoming events like "US CPI MoM: 3.2% vs 3.1% forecast") and an `indexContext` string (BTC dominance, ETH staking ratio, stablecoin supply) from SoSoValue endpoints. These are appended to the LLM prompt on compatible models.

### REST API for developers

| Route                                        | Returns                      |
| -------------------------------------------- | ---------------------------- |
| `GET /sosovalue/news?limit=20`               | Latest crypto news headlines |
| `GET /sosovalue/news/search?keyword=bitcoin` | News matching keyword        |
| `GET /sosovalue/macro?limit=10`              | Macro-economic events        |
| `GET /sosovalue/index/snapshots`             | Crypto index snapshots       |

All routes return 502 when `SOSO_VALUE_API_KEY` is not configured.

---

## SoDEX Integration Detail

### EIP-712 signing

Orders use typed data per EIP-712 with the `ExchangeAction { payloadHash, nonce }` struct, signed by the API key's private key under domain `{ name: "spot", chainId: 138565 }`. The signature is hex-encoded with a `0x01` prefix as required by SoDEX.

### Market order placement

- **BUY** (`side: 0`): sends `funds` (quote currency amount), `timeInForce: IOC`
- **SELL** (`side: 1`): sends `quantity` (base currency amount), `timeInForce: IOC`

Both use `type: 2` (market order). Symbol IDs are resolved dynamically from `GET /markets/symbols`.

### Orderbook quoting

Public market data (no API key required):

```
GET ${SPOT_ENDPOINT}/markets/{symbol}/orderbook?limit=20
```

For a quote:

- **Buy**: walk asks ascending → calculate total base for given quote amount
- **Sell**: walk bids descending → calculate total quote for given base amount
- Returns null if insufficient depth to fill

### TVL from orderbook

`getPoolTvlUsd` sums `bid_price * bid_qty + ask_price * ask_qty` across the full depth. Returns at least $10k floor.

---

## Configuration

### SoSoValue (news + macro)

```env
SOSO_VALUE_API_KEY=your_api_key_here
```

Rate limit: 20 req/min, 100k/month. When absent, all SoSoValue routes return 502 and the news detector is skipped silently.

### SoDEX (orderbook execution)

```env
SODEX_API_KEY_NAME=api-key-name
SODEX_API_KEY_PRIVATE=0x...
SODEX_ACCOUNT_ID=12345
SODEX_SYMBOL=vBTC_vUSDC
SODEX_NETWORK=testnet
```

When absent, the treasury falls through to PancakeSwap on BSC. API keys are registered via SoDEX UI with the master wallet.

---

## Buildathon context

- **Competition**: SoSoValue Buildathon Wave 3
- **Build phase**: Jun 29 – Jul 8, 2026
- **Evaluation**: Jul 9 – Jul 22, 2026
- **Use case**: Autonomous AI agent that reads SoSoValue news feeds, detects trading signals from narrative-breaking events, enriches its scoring with macro context and index data, and executes trades on SoDEX's CLOB — a complete data-input-to-actionable-output pipeline.
- **Repository**: https://github.com/sneldao/lenitnes
- **Live demo**: https://lenitnes.persidian.com
