import { query } from '../db/pool.js';
import { priceData } from './data-providers/registry.js';
import { logger } from '../logger.js';
import { classifySignalSource, explainSignalSource } from './domain/signal-source.js';

export interface PositionReasoning {
  signalId: string | null;
  thesis: string | null;
  recommendedAction: 'long' | 'short' | 'none' | null;
  conviction: number | null;
  detectorTypes: string[];
  sourceCategory: string;
  sourceLabel: string;
  sourceExplanation: string;
  repo: string | null;
}

export interface OpenPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  venue: string;
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
  /** The reasoning chain behind this position (signal source + thesis). */
  reasoning: PositionReasoning | null;
}

export interface ClosedPosition {
  id: string;
  asset: string;
  chain: string;
  direction: string;
  venue: string;
  entry_amount: number;
  entry_price_usd: number | null;
  exit_amount: number;
  exit_price_usd: number | null;
  pnl_usd: number;
  pnl_pct: number;
  opened_at: string;
  closed_at: string;
  conviction_at_open: number | null;
  reasoning: PositionReasoning | null;
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

/**
 * Backfill entry_price_usd for positions opened before the
 * "capture entry price at trade time" change landed. Looks up
 * the historical CoinGecko price for the asset at opened_at
 * and writes it back. Best-effort: a failed lookup is logged
 * and the field stays null so PnL just shows '—' for that row.
 */
async function backfillEntryPrice(
  positionId: string,
  asset: string,
  openedAt: string,
): Promise<number | null> {
  try {
    const price = await priceData.getPriceAt(asset, new Date(openedAt));
    if (price == null) return null;
    await query(`UPDATE positions SET entry_price_usd = $2 WHERE id = $1`, [positionId, price]);
    logger.info({ positionId, asset, openedAt, price }, 'portfolio: backfilled entry_price_usd');
    return price;
  } catch (err) {
    logger.warn({ err, positionId, asset }, 'portfolio: entry price backfill failed');
    return null;
  }
}

/**
 * Fetch the current spot price for a set of CoinGecko asset
 * IDs. Uses the same /simple/price-style backend the price.ts
 * service exposes (one HTTP call per asset, but cached for 24h
 * so the hot path stays fast).
 *
 * Returns a partial map — missing entries mean the price was
 * unavailable for that asset.
 */
async function fetchCurrentPrices(assets: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(assets));
  const now = new Date();
  const entries = await Promise.all(
    unique.map(async (a) => {
      try {
        const p = await priceData.getPriceAt(a, now);
        return [a, p] as const;
      } catch (err) {
        logger.warn({ err, asset: a }, 'portfolio: current price fetch failed');
        return [a, null] as const;
      }
    }),
  );
  const out: Record<string, number> = {};
  for (const [a, p] of entries) {
    if (p != null) out[a] = p;
  }
  return out;
}

/**
 * Fetch the reasoning chain behind positions: the originating
 * signal's thesis, the agent's verdict, the detectors that fired,
 * and the signal's source category (commit / narrative / thesis /
 * proactive). Joins positions → signals → agent_scores +
 * signal_classifications + monitors. Returns a map keyed by
 * position_id.
 */
async function fetchPositionReasoning(
  positionIds: string[],
): Promise<Map<string, PositionReasoning>> {
  const map = new Map<string, PositionReasoning>();
  if (positionIds.length === 0) return map;

  const { rows } = await query<{
    position_id: string;
    signal_id: string;
    thesis: string | null;
    recommended_action: 'long' | 'short' | 'none' | null;
    conviction: number | null;
    detector_types: string[] | null;
    detector_metadata: Record<string, unknown> | null;
    monitor_url: string | null;
  }>(
    `SELECT p.id AS position_id,
            p.signal_id,
            ag.thesis,
            ag.recommended_action,
            ag.conviction,
            ARRAY_AGG(sc.detector_type) FILTER (WHERE sc.detector_type IS NOT NULL) AS detector_types,
            (ARRAY_AGG(sc.metadata ORDER BY sc.score DESC) FILTER (WHERE sc.metadata IS NOT NULL))[1] AS detector_metadata,
            m.url AS monitor_url
       FROM positions p
       LEFT JOIN agent_scores ag ON ag.signal_id = p.signal_id
       LEFT JOIN signal_classifications sc ON sc.signal_id = p.signal_id
       LEFT JOIN signals s ON s.id = p.signal_id
       LEFT JOIN monitors m ON m.id = s.monitor_id
      WHERE p.id = ANY($1::uuid[])
      GROUP BY p.id, ag.thesis, ag.recommended_action, ag.conviction, m.url`,
    [positionIds],
  );

  for (const r of rows) {
    const detectorTypes = (r.detector_types ?? []).filter(Boolean);
    const source = classifySignalSource(r.monitor_url, detectorTypes);
    map.set(r.position_id, {
      signalId: r.signal_id,
      thesis: r.thesis,
      recommendedAction: r.recommended_action,
      conviction: r.conviction,
      detectorTypes,
      sourceCategory: source.category,
      sourceLabel: source.label,
      sourceExplanation: explainSignalSource(r.monitor_url, detectorTypes, r.detector_metadata),
      repo: r.monitor_url ? r.monitor_url.replace(/^https?:\/\/github\.com\//, '') : null,
    });
  }
  return map;
}

export async function getOpenPositions(): Promise<OpenPosition[]> {
  const { rows } = await query<{
    id: string;
    asset: string;
    chain: string;
    direction: string;
    venue: string;
    entry_amount: string;
    entry_price_usd: string | null;
    entry_tx_hash: string | null;
    opened_at: string;
    take_profit_price: string | null;
    stop_loss_price: string | null;
    conviction_at_open: number | null;
  }>(
    `SELECT id, asset, chain, direction, venue, entry_amount::text,
            entry_price_usd::text, entry_tx_hash,
            opened_at::text, take_profit_price::text,
            stop_loss_price::text, conviction_at_open
       FROM positions
      WHERE status = 'open'
      ORDER BY opened_at DESC`,
  );

  if (rows.length === 0) return [];

  // Lazy backfill — for positions opened before entry-price
  // capture landed, fill in the historical price now.
  const enriched = await Promise.all(
    rows.map(async (r) => {
      let entryPrice = r.entry_price_usd ? parseFloat(r.entry_price_usd) : null;
      if (entryPrice == null) {
        entryPrice = await backfillEntryPrice(r.id, r.asset, r.opened_at);
      }
      return { ...r, _entryPrice: entryPrice };
    }),
  );

  const [currentPrices, reasoningMap] = await Promise.all([
    fetchCurrentPrices(enriched.map((r) => r.asset)),
    fetchPositionReasoning(enriched.map((r) => r.id)),
  ]);

  return enriched.map((r) => {
    const entryAmount = parseFloat(r.entry_amount);
    const currentPrice = currentPrices[r.asset] ?? null;
    const entryPrice = r._entryPrice;
    let unrealizedPnlUsd: number | null = null;
    let unrealizedPnlPct: number | null = null;
    if (currentPrice != null && entryPrice != null && entryAmount > 0) {
      // Shorts profit when price falls.
      const sign = r.direction === 'short' ? -1 : 1;
      unrealizedPnlUsd = sign * (currentPrice - entryPrice) * entryAmount;
      unrealizedPnlPct = sign * ((currentPrice - entryPrice) / entryPrice) * 100;
    }
    return {
      id: r.id,
      asset: r.asset,
      chain: r.chain,
      direction: r.direction,
      venue: r.venue,
      entry_amount: entryAmount,
      entry_price_usd: entryPrice,
      entry_tx_hash: r.entry_tx_hash,
      opened_at: r.opened_at,
      take_profit_price: r.take_profit_price ? parseFloat(r.take_profit_price) : null,
      stop_loss_price: r.stop_loss_price ? parseFloat(r.stop_loss_price) : null,
      conviction_at_open: r.conviction_at_open,
      current_price_usd: currentPrice,
      unrealized_pnl_usd: unrealizedPnlUsd,
      unrealized_pnl_pct: unrealizedPnlPct,
      reasoning: reasoningMap.get(r.id) ?? null,
    };
  });
}

export async function getClosedPositions(limit = 20): Promise<ClosedPosition[]> {
  const { rows } = await query<{
    id: string;
    asset: string;
    chain: string;
    direction: string;
    venue: string;
    entry_amount: string;
    entry_price_usd: string | null;
    exit_amount: string;
    exit_price_usd: string | null;
    pnl_usd: string;
    pnl_pct: string;
    opened_at: string;
    closed_at: string;
    conviction_at_open: number | null;
  }>(
    `SELECT id, asset, chain, direction, venue,
            entry_amount::text, entry_price_usd::text,
            exit_amount::text, exit_price_usd::text,
            pnl_usd::text, pnl_pct::text,
            opened_at::text, closed_at::text,
            conviction_at_open
       FROM positions
      WHERE status = 'closed'
      ORDER BY closed_at DESC
      LIMIT $1`,
    [limit],
  );

  const reasoningMap = await fetchPositionReasoning(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    asset: r.asset,
    chain: r.chain,
    direction: r.direction,
    venue: r.venue,
    entry_amount: parseFloat(r.entry_amount),
    entry_price_usd: r.entry_price_usd ? parseFloat(r.entry_price_usd) : null,
    exit_amount: parseFloat(r.exit_amount),
    exit_price_usd: r.exit_price_usd ? parseFloat(r.exit_price_usd) : null,
    pnl_usd: parseFloat(r.pnl_usd),
    pnl_pct: parseFloat(r.pnl_pct),
    opened_at: r.opened_at,
    closed_at: r.closed_at,
    conviction_at_open: r.conviction_at_open,
    reasoning: reasoningMap.get(r.id) ?? null,
  }));
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const [openPositions, { rows: closed }, { rows: pnlData }] = await Promise.all([
    getOpenPositions(),
    query<{ c: string }>("SELECT COUNT(*)::text AS c FROM positions WHERE status = 'closed'"),
    query<{
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
    ),
  ]);

  // Aggregate unrealized PnL from the already-enriched open
  // positions — avoids a second pass over the price oracle.
  let totalInvestedUsd = 0;
  let currentValueUsd = 0;
  let unrealizedPnlUsd = 0;
  for (const p of openPositions) {
    if (p.entry_price_usd != null) {
      totalInvestedUsd += p.entry_price_usd * p.entry_amount;
    }
    if (p.current_price_usd != null) {
      currentValueUsd += p.current_price_usd * p.entry_amount;
    }
    if (p.unrealized_pnl_usd != null) {
      unrealizedPnlUsd += p.unrealized_pnl_usd;
    }
  }

  const closedCount = parseInt(closed[0]?.c ?? '0', 10);
  const r = pnlData[0];

  return {
    total_open_positions: openPositions.length,
    total_closed_positions: closedCount,
    total_invested_usd: totalInvestedUsd,
    current_value_usd: currentValueUsd,
    unrealized_pnl_usd: unrealizedPnlUsd,
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
      const entry = p.entry_price_usd ? `@ $${p.entry_price_usd.toFixed(2)}` : '';
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
