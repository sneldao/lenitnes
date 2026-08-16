-- 010: Fix propr perp realized-PnL units (season-1 accounting correction).
--
-- positions.entry_amount is venue-specific: spot/paper store asset QUANTITY,
-- but propr perps store USD NOTIONAL (recordTrade stores amountIn, and the
-- propr path passes notionalUsd). The close path computed
-- pnl_usd = (exit_price - entry_price) * entry_amount for ALL venues, which
-- is correct for quantity books but inflates notional books by the asset's
-- price multiple (~x468 for ZEC) — producing the bogus -$283k season-1 total.
--
-- pnl_pct was always correct (pure price math), so the fix re-derives
-- pnl_usd = entry_amount * pnl_pct / 100 for closed propr rows only.
-- Idempotent: re-running recomputes the same values.

UPDATE positions
   SET pnl_usd = ROUND((entry_amount * pnl_pct / 100)::numeric, 2)
 WHERE venue = 'propr'
   AND status = 'closed'
   AND pnl_pct IS NOT NULL;
