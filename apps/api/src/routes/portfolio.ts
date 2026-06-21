import { Router, type Request, type Response } from 'express';
import {
  getOpenPositions,
  getClosedPositions,
  getPortfolioSummary,
} from '../services/portfolio.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';

export const portfolioRouter = Router();

// GET /portfolio — full portfolio snapshot (public, cached 60s)
portfolioRouter.get('/', async (req: Request, res: Response) => {
  const cacheKey = 'portfolio:full';
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.json(cached);
    return;
  }
  const [summary, openPositions, closedPositions] = await Promise.all([
    getPortfolioSummary(),
    getOpenPositions(),
    getClosedPositions(),
  ]);
  const result = { summary, open: openPositions, closed: closedPositions };
  cacheSet(cacheKey, result, 60_000);
  res.setHeader('X-Cache', 'MISS');
  res.json(result);
});

// GET /portfolio/summary — concise summary for Telegram/widgets
portfolioRouter.get('/summary', async (_req: Request, res: Response) => {
  const [summary, openPositions] = await Promise.all([getPortfolioSummary(), getOpenPositions()]);
  res.json({ summary, openPositions });
});
