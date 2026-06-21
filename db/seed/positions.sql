-- ─────────────────────────────────────────────────────────────
-- Portfolio management: positions table for open/close lifecycle,
-- P&L tracking, TP/SL levels, and conviction-based allocation.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  open_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  close_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  asset TEXT NOT NULL,
  chain TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'long',
  status TEXT NOT NULL DEFAULT 'open',
  entry_amount NUMERIC NOT NULL,
  entry_price_usd NUMERIC,
  entry_tx_hash TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_amount NUMERIC,
  exit_price_usd NUMERIC,
  exit_tx_hash TEXT,
  closed_at TIMESTAMPTZ,
  take_profit_price NUMERIC,
  stop_loss_price NUMERIC,
  conviction_at_open INTEGER,
  pnl_usd NUMERIC,
  pnl_pct NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_positions_status ON positions (status);
CREATE INDEX IF NOT EXISTS idx_positions_asset ON positions (asset);
