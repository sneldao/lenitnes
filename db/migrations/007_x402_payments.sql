-- 007_x402_payments.sql
-- Ledger of every x402 micropayment settled on Hedera.
-- Each row = one consumer agent paying per query for a LENITNES
-- resource. The payment_reference (carried in the HBAR transfer memo)
-- is unique → replay protection: a signed transaction can only settle
-- once. Both the on-chain HBAR transfer and the HCS receipt
-- notarization are linked for auditability.

CREATE TABLE IF NOT EXISTS x402_payments (
  id                   TEXT PRIMARY KEY,           -- ULID
  payment_reference    TEXT NOT NULL UNIQUE,        -- UUID in the tx memo; one-shot
  resource             TEXT NOT NULL,               -- e.g. /paid/signals/01J...
  scheme               TEXT NOT NULL DEFAULT 'exact-hedera',
  network              TEXT NOT NULL DEFAULT 'hedera:testnet',
  asset                TEXT NOT NULL DEFAULT 'HBAR',
  amount_tinybar       BIGINT NOT NULL,             -- atomic units settled
  payer                TEXT NOT NULL,               -- payer account id (0.0.x)
  payee                TEXT NOT NULL,               -- merchant account id (0.0.x)
  hedera_tx_id         TEXT NOT NULL,               -- the HBAR transfer (HashScan #1)
  hcs_tx_id            TEXT,                        -- receipt notarization (HashScan #2)
  hashscan_url         TEXT NOT NULL,
  hcs_hashscan_url     TEXT,
  settlement_status    TEXT NOT NULL DEFAULT 'settled',  -- settled | failed
  error_reason         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_x402_payments_created_at
  ON x402_payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_x402_payments_payer
  ON x402_payments (payer);
