-- ─────────────────────────────────────────────────────────────
-- Seed: treasury wallets, one per chain. Placeholder addresses
-- for development. Production: fill in real addresses before
-- enabling the autonomous loop (Day 5).
-- ─────────────────────────────────────────────────────────────

INSERT INTO treasury_wallets (chain, address, label, is_active)
VALUES
  ('hedera',    '0.0.000000', 'Hedera testnet treasury (placeholder)', true),
  ('arbitrum',  '0x0000000000000000000000000000000000000000', 'Arbitrum Sepolia treasury (placeholder)', true),
  ('robinhood', '0x0000000000000000000000000000000000000000', 'Robinhood Chain treasury (placeholder)', true),
  ('bnb',       '0x0000000000000000000000000000000000000000', 'BSC testnet treasury (BNB Hack)', true)
ON CONFLICT (chain) DO NOTHING;
