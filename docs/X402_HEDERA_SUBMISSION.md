# x402-over-Hedera — Pay-Per-Signal Autonomous Commerce

> **LENITNES × x402 × Hedera** — an autonomous AI agent's trading signals become a pay-per-query API. Every call settles as a real HBAR micropayment on Hedera testnet, verified by a self-facilitator, and notarized to HCS. Two on-chain artifacts per purchase.

## What this builds

This implements **reference architecture #1** ("an agent that pays per query") with a twist: LENITNES is both the _data producer_ (its signals are notarized on Hedera HCS) and the _merchant_ (it sells those signals per-call through x402). A separate autonomous payer agent buys the data — a complete machine-to-machine commerce loop on Hedera rails.

### The flow

```
Consumer agent (payer)                 LENITNES API (merchant + self-facilitator)
   GET /paid/feed ────────────────▶  (no PAYMENT-SIGNATURE header)
   ◀── 402 + PAYMENT-REQUIRED ─────  {scheme:"exact-hedera", network:"hedera:testnet",
                                      asset:"HBAR", amount:"25000000", payTo:"0.0.9137770",
                                      extra:{paymentReference:"<uuid>"}}
   signs HBAR TransferTransaction
     payer→merchant, memo = paymentReference
   GET /paid/feed ────────────────▶  PAYMENT-SIGNATURE header (base64 PaymentPayload)
                                      facilitator.verify: decode+validate (payer, payTo,
                                        amount, memo, HBAR-only, no replay)
                                      facilitator.settle: execute() on testnet → receipt
                                        + notarize receipt to HCS
   ◀── 200 + PAYMENT-RESPONSE ─────  {success:true, transaction, extra:{hcsTxId}}
```

### x402 conformance

- **V2 headers** via `@x402/core/http`: `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE` — all base64-encoded JSON.
- **Custom scheme** `exact-hedera` under CAIP-2 `hedera:testnet`.
- **Self-facilitation** (verify + settle via `@hashgraph/sdk`) — sanctioned by the x402 spec.
- **Replay protection**: fresh UUID `paymentReference` per 402 challenge; client must use it as the HBAR memo; facilitator rejects duplicates (DB UNIQUE + in-memory).

### Hedera rails usage

1. **HBAR TransferTransaction** — the payment ($0.0001/transfer), signed by payer, submitted by facilitator.
2. **Transaction receipt** — facilitator confirms SUCCESS, amount, payee on-chain.
3. **HCS notarization** — every receipt written to HCS topic `0.0.9159618` → second HashScan link.
4. **Replay protection** — `paymentReference` consumed once via `x402_payments` ledger.

## On-chain evidence (HashScan links)

Each paid query produces **two** on-chain transactions (HBAR transfer + HCS notarization):

| #   | Resource        | Amount    | HBAR transfer                                                                        | HCS notarization                                                                     |
| --- | --------------- | --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | /paid/feed      | 0.25 HBAR | [HashScan](https://hashscan.io/testnet/transaction/0.0.9832906@1785356509.037180938) | [HashScan](https://hashscan.io/testnet/transaction/0.0.9137770@1785356510.310369660) |
| 2   | /paid/feed      | 0.25 HBAR | [HashScan](https://hashscan.io/testnet/transaction/0.0.9832906@1785356588.443377202) | [HashScan](https://hashscan.io/testnet/transaction/0.0.9137770@1785356591.388905835) |
| 3   | /paid/feed      | 0.25 HBAR | [HashScan](https://hashscan.io/testnet/transaction/0.0.9832906@1785356627.766399367) | [HashScan](https://hashscan.io/testnet/transaction/0.0.9137770@1785356628.583235570) |
| 4   | /paid/scorecard | 0.50 HBAR | [HashScan](https://hashscan.io/testnet/transaction/0.0.9832906@1785356662.879228752) | [HashScan](https://hashscan.io/testnet/transaction/0.0.9137770@1785356669.112357985) |

### Accounts

- **Merchant (payee)**: `0.0.9137770` — [HashScan](https://hashscan.io/testnet/account/0.0.9137770)
- **Payer (consumer agent)**: `0.0.9832906` — [HashScan](https://hashscan.io/testnet/account/0.0.9832906)
- **HCS topic**: `0.0.9159618` — [HashScan](https://hashscan.io/testnet/topic/0.0.9159618)

## How to run

```bash
# 1. Prerequisites: Hedera testnet operator in .env
#    HEDERA_OPERATOR_ID=0.0.x, HEDERA_OPERATOR_KEY=0x..., HEDERA_HCS_TOPIC_ID=0.0.x
#    X402_MERCHANT_ENABLED=true

# 2. Generate + fund the payer agent wallet
npm run x402:setup --workspace=@lenitnes/api

# 3. Start the API
npm run dev:api

# 4. Run the consumer agent (pays per query on Hedera)
npm run x402:agent --workspace=@lenitnes/api
npm run x402:agent --workspace=@lenitnes/api -- /paid/scorecard

# 5. View all settled payments
curl http://localhost:4000/payments | jq
```

## Files

**New:** `services/x402/*` (6 files), `middleware/x402.ts`, `routes/paid.ts`, `routes/payments.ts`, `scripts/x402-*.ts` (2), `db/migrations/007_x402_payments.sql`, `tests/x402-facilitator.test.ts`

**Edited:** `config.ts`, `config-schema.ts`, `index.ts`, `db/migrate-followup.ts`, `package.json`, `.env.example`, `.gitignore`
