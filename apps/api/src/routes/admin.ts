// ─────────────────────────────────────────────────────────────
// Admin surface — single-operator persona. Gated by X-Admin-Key
// (matches ADMIN_API_KEY env). When ADMIN_API_KEY is empty, the
// routes return 503 (don't leak info). Day 8 of the pivot.
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Chain } from '@lenitnes/types';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { cacheInvalidate } from '../middleware/cache.js';
import { _internalDailySpendUsd } from '../services/agent.js';
import { closePositionById } from '../services/treasury.js';
import { evaluateTradeRisk } from '../services/treasury/risk.js';
import { priceData } from '../services/data-providers/registry.js';
import { logger } from '../logger.js';

export const adminRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!config.admin.apiKey) {
    res.status(503).json({ error: 'admin_not_configured', hint: 'set ADMIN_API_KEY' });
    return;
  }
  const provided = req.header('x-admin-key') ?? '';
  if (provided !== config.admin.apiKey) {
    res.status(401).json({ error: 'invalid_admin_key' });
    return;
  }
  next();
}

// GET /admin/status — daily counts, budget, last signal
adminRouter.get('/status', requireAdmin, async (_req, res) => {
  try {
    const [signals24h, signals7d, agentScores24h, tradesAllTime, treasuryWallets, latestSignal] =
      await Promise.all([
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM signals WHERE is_heartbeat = false AND detected_at > now() - interval '24 hours'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM signals WHERE is_heartbeat = false AND detected_at > now() - interval '7 days'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM agent_scores WHERE created_at > now() - interval '24 hours'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM orders WHERE status = 'filled'`,
        ),
        query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM treasury_wallets WHERE is_active = true`,
        ),
        query<{ latest_at: string | null; latest_id: string | null }>(
          `SELECT MAX(detected_at) AS latest_at, MAX(id) AS latest_id FROM signals WHERE is_heartbeat = false`,
        ),
      ]);

    res.json({
      signals: {
        last24h: Number(signals24h.rows[0]?.count ?? 0),
        last7d: Number(signals7d.rows[0]?.count ?? 0),
        latestAt: latestSignal.rows[0]?.latest_at ?? null,
        latestId: latestSignal.rows[0]?.latest_id ?? null,
      },
      agent: {
        scoresLast24h: Number(agentScores24h.rows[0]?.count ?? 0),
        dailySpendUsd: _internalDailySpendUsd(),
        dailyBudgetUsd: config.agent.dailyBudgetUsd,
      },
      trades: {
        filledAllTime: Number(tradesAllTime.rows[0]?.count ?? 0),
      },
      treasury: {
        activeWallets: Number(treasuryWallets.rows[0]?.count ?? 0),
        defaultChain: config.treasury.defaultChain,
        defaultMode: config.treasury.defaultMode,
      },
    });
  } catch (err) {
    logger.error({ err }, 'admin/status query failed');
    res.status(500).json({ error: 'admin_status_failed' });
  }
});

// GET /admin/venues — status of all registered execution venues
adminRouter.get('/venues', requireAdmin, async (_req, res) => {
  try {
    const { getVenueStatuses } = await import('../services/venues/registry.js');
    const statuses = getVenueStatuses();
    res.json(statuses);
  } catch (err) {
    logger.error({ err }, 'admin/venues failed');
    res.status(500).json({ error: 'venue_status_failed' });
  }
});

// POST /admin/cache/invalidate?pattern=scorecard:
// Drop cache entries matching the prefix. Used when a new signal
// commits and the scorecard needs to refresh before its 60s TTL.
adminRouter.post('/cache/invalidate', requireAdmin, (req, res) => {
  const pattern = String(req.query.pattern ?? '');
  if (!pattern) {
    res.status(400).json({ error: 'pattern_required' });
    return;
  }
  cacheInvalidate(pattern);
  res.json({ ok: true, pattern, invalidatedAt: new Date().toISOString() });
});

// POST /admin/cache/invalidate-all — nuke every cache entry
adminRouter.post('/cache/invalidate-all', requireAdmin, (_req, res) => {
  cacheInvalidate('');
  res.json({ ok: true, invalidatedAt: new Date().toISOString() });
});

// GET /admin/risk-check?asset=bitcoin&chain=bnb&side=long
// Dry-runs the risk gate against the given inputs and returns the
// decision WITHOUT firing a trade. Used during the first-live-trade
// dry run + ongoing debugging when an expected trade routes to paper
// and the operator wants to know which gate tripped.
//
// Defaults: chain=bnb, side=long, amount=config.treasury.defaultTradeAmount.
adminRouter.get('/risk-check', requireAdmin, async (req, res) => {
  const asset = req.query.asset ? String(req.query.asset) : undefined;
  const chain = (req.query.chain ? String(req.query.chain) : 'bnb') as Chain;
  const side = (req.query.side === 'short' ? 'short' : 'long') as 'short' | 'long';
  const amountIn = req.query.amount ? String(req.query.amount) : config.treasury.defaultTradeAmount;
  try {
    const decision = await evaluateTradeRisk({
      coingeckoId: asset,
      chain,
      side,
      signalId: 'risk-check-dry-run',
      intendedMode: config.treasury.defaultMode,
      amountIn,
    });
    res.json({
      input: { asset, chain, side, amountIn, intendedMode: config.treasury.defaultMode },
      decision,
      tradingEnabled: config.treasury.tradingEnabled,
    });
  } catch (err) {
    logger.error({ err, asset, chain }, 'admin/risk-check failed');
    res.status(500).json({
      error: 'risk_check_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /admin/positions/:id/close
// Manually close a single open position. Fetches the current
// CoinGecko price for the asset, then calls closePositionById
// which fires a real on-chain swap when TRADING_ENABLED + the
// asset is in the registry, otherwise records a paper close.
// Returns the realized PnL + close tx hash (or null for paper).
//
// Use cases:
//   - First-live-trade dry run (open one, manually close it)
//   - Emergency exit (operator wants to flatten a position now)
//   - Cleaning up paper positions after a model change
adminRouter.post('/positions/:id/close', requireAdmin, async (req, res) => {
  const positionId = String(req.params.id);
  try {
    // Look up the asset so we can fetch the current price.
    const { rows } = await query<{ asset: string; status: string }>(
      `SELECT asset, status FROM positions WHERE id = $1`,
      [positionId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'position_not_found' });
      return;
    }
    if (rows[0].status !== 'open') {
      res.status(409).json({ error: 'position_not_open', status: rows[0].status });
      return;
    }
    const exitPrice = await priceData.getPriceAt(rows[0].asset, new Date());
    const result = await closePositionById(positionId, exitPrice, 'manual');
    res.json({
      ok: result.closed,
      positionId,
      asset: rows[0].asset,
      exitPriceUsd: exitPrice,
      pnlUsd: result.pnlUsd,
      closeTxHash: result.closeTxHash,
    });
  } catch (err) {
    logger.error({ err, positionId }, 'admin/positions/close failed');
    res.status(500).json({
      error: 'close_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
