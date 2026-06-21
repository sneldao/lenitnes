import { query } from '../db/pool.js';
import { config } from '../config.js';

export interface OpenPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  entry_amount: number;
  entry_price_usd: number | null;
  entry_tx_hash: string | null;
  opened_at: string;
  take_profit_price: number | null;
  stop_loss_price: number | null;
  conviction_at_open: number | null;
  current_price_usd: number | null;
  unrealized_pnl_usd: number | null;
  unrealized_pnl_pct: number | null;
}

export interface ClosedPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  entry_amount: number;
  entry_price_usd: number | null;
  exit_amount: number;
  exit_price_usd: number | null;
  pnl_usd: number;
  pnl_pct: number;
  opened_at: string;
  closed_at: string;
  conviction_at_open: number | null;
  conviction_at_close: number | null;
}

export interface PortfolioSummary {
  total_open_positions: number;
  total_closed_positions: number;
  total_invested_usd: number;
  current_value_usd: number;
  unrealized_pnl_usd: number;
  realized_pnl_usd: number;
  win_rate: number | null;
  best_trade_pct: number | null;
  worst_trade_pct: number | null;
  avg_hold_time_hours: number | null;
}

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const { rows } = await query<{
    id: string;
    asset: string;
    chain: string;
    direction: string;
    entry_amount: string;
    entry_price_usd: string | null;
    entry_tx_hash: string | null;
    opened_at: string;
    take_profit_price: string | null;
    stop_loss_price: string | null;
    conviction_at_open: number | null;
  }>(
    `SELECT id, asset, chain, direction, entry_amount::text,
            entry_price_usd::text, entry_tx_hash,
            opened_at::text, take_profit_price::text,
            stop_loss_price::text, conviction_at_open
       FROM positions
      WHERE status = 'open'
      ORDER BY opened_at DESC`,
  );

  return rows.map((r) => ({
    id: r.id,
    asset: r.asset,
    chain: r.chain,
    direction: r.direction,
    entry_amount: parseFloat(r.entry_amount),
    entry_price_usd: r.entry_price_usd ? parseFloat(r.entry_price_usd) : null,
    entry_tx_hash: r.entry_tx_hash,
    opened_at: r.opened_at,
    take_profit_price: r.take_profit_price ? parseFloat(r.take_profit_price) : null,
    stop_loss_price: r.stop_loss_price ? parseFloat(r.stop_loss_price) : null,
    conviction_at_open: r.conviction_at_open,
    current_price_usd: null,
    unrealized_pnl_usd: null,
    unrealized_pnl_pct: null,
  }));
}

export async function getClosedPositions(limit = 20): Promise<ClosedPosition[]> {
  const { rows } = await query<{
    id: string;
    asset: string;
    chain: string;
    direction: string;
    entry_amount: string;
    entry_price_usd: string | null;
    exit_amount: string;
    exit_price_usd: string | null;
    pnl_usd: string;
    pnl_pct: string;
    opened_at: string;
    closed_at: string;
    conviction_at_open: number | null;
    conviction_at_close: number | null;
  }>(
    `SELECT id, asset, chain, direction,
            entry_amount::text, entry_price_usd::text,
            exit_amount::text, exit_price_usd::text,
            pnl_usd::text, pnl_pct::text,
            opened_at::text, closed_at::text,
            conviction_at_open, conviction_at_close
       FROM positions
      WHERE status = 'closed'
      ORDER BY closed_at DESC
      LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    asset: r.asset,
    chain: r.chain,
    direction: r.direction,
    entry_amount: parseFloat(r.entry_amount),
    entry_price_usd: r.entry_price_usd ? parseFloat(r.entry_price_usd) : null,
    exit_amount: parseFloat(r.exit_amount),
    exit_price_usd: r.exit_price_usd ? parseFloat(r.exit_price_usd) : null,
    pnl_usd: parseFloat(r.pnl_usd),
    pnl_pct: parseFloat(r.pnl_pct),
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    conviction_at_open: r.conviction_at_open,
    conviction_at_close: r.conviction_at_close,
  }));
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const { rows: open } = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM positions WHERE status = 'open'",
  );
  const { rows: closed } = await query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM positions WHERE status = 'closed'",
  );
  const { rows: pnlData } = await query<{
    realized: string | null;
    win_rate: string | null;
    best: string | null;
    worst: string | null;
    avg_hours: string | null;
  }>(
    `SELECT
       COALESCE(SUM(pnl_usd), 0)::text AS realized,
       CASE WHEN COUNT(*) > 0
         THEN (COUNT(*) FILTER (WHERE pnl_usd > 0)::float / COUNT(*)::float * 100)::text
         ELSE NULL
       END AS win_rate,
       MAX(pnl_pct)::text AS best,
       MIN(pnl_pct)::text AS worst,
       AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600)::text AS avg_hours
      FROM positions WHERE status = 'closed'`,
  );

  const openCount = parseInt(open[0]?.c ?? '0', 10);
  const closedCount = parseInt(closed[0]?.c ?? '0', 10);
  const r = pnlData[0];

  // For unrealized P&L, we need current prices. Skip for now —
  // the caller can compute this with market data.
  return {
    total_open_positions: openCount,
    total_closed_positions: closedCount,
    total_invested_usd: 0,
    current_value_usd: 0,
    unrealized_pnl_usd: 0,
    realized_pnl_usd: r?.realized ? parseFloat(r.realized) : 0,
    win_rate: r?.win_rate ? parseFloat(r.win_rate) : null,
    best_trade_pct: r?.best ? parseFloat(r.best) : null,
    worst_trade_pct: r?.worst ? parseFloat(r.worst) : null,
    avg_hold_time_hours: r?.avg_hours ? parseFloat(r.avg_hours) : null,
  };
}

/**
 * Format portfolio summary for Telegram. Concise, one paragraph.
 */
export function formatPortfolioSummary(
  summary: PortfolioSummary,
  openPositions: OpenPosition[],
): string {
  const lines: string[] = ['💼 Portfolio'];

  if (summary.total_open_positions > 0) {
    lines.push(`  Open: ${summary.total_open_positions} position(s)`);
    for (const p of openPositions) {
      const entry = p.entry_price_usd ? `@ $${p.entry_price_usd}` : '';
      const conviction = p.conviction_at_open ? ` (conviction ${p.conviction_at_open})` : '';
      const pnl =
        p.unrealized_pnl_pct !== null
          ? ` · ${p.unrealized_pnl_pct >= 0 ? '+' : ''}${p.unrealized_pnl_pct.toFixed(1)}%`
          : '';
      lines.push(`    ${p.asset} ${p.direction} ${entry}${conviction}${pnl}`);
    }
  } else {
    lines.push(`  No open positions`);
  }

  if (summary.total_closed_positions > 0) {
    const rp = summary.realized_pnl_usd;
    const sign = rp >= 0 ? '+' : '';
    const wr = summary.win_rate !== null ? ` · ${summary.win_rate.toFixed(0)}% win rate` : '';
    lines.push(
      `  Closed: ${summary.total_closed_positions} trade(s) · ${sign}$${rp.toFixed(4)} realized${wr}`,
    );
    if (summary.best_trade_pct !== null && summary.worst_trade_pct !== null) {
      lines.push(
        `  Best: ${summary.best_trade_pct.toFixed(1)}% · Worst: ${summary.worst_trade_pct.toFixed(1)}%`,
      );
    }
    if (summary.avg_hold_time_hours !== null) {
      const h = Math.round(summary.avg_hold_time_hours);
      lines.push(`  Avg hold: ${h}h`);
    }
  }

  return lines.join('\n');
}
