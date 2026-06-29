import { Router } from 'express';
import { FEATURES } from '../features.js';
import { logger } from '../logger.js';

export const sosovalueRouter = Router();

sosovalueRouter.get('/news', async (req, res) => {
  if (!FEATURES.sosovalue) {
    res.status(502).json({ error: 'sosovalue_not_configured' });
    return;
  }
  try {
    const { getNewsFeed } = await import('../services/data-providers/sosovalue/index.js');
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const result = await getNewsFeed({ pageSize: limit });
    if (!result) {
      res.status(502).json({ error: 'sosovalue_api_error' });
      return;
    }
    res.json({ items: result.list ?? [], total: result.total ?? 0 });
  } catch (err) {
    logger.error({ err }, 'sosovalue/news failed');
    res.status(502).json({ error: 'sosovalue_api_error' });
  }
});

sosovalueRouter.get('/news/search', async (req, res) => {
  if (!FEATURES.sosovalue) {
    res.status(502).json({ error: 'sosovalue_not_configured' });
    return;
  }
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  if (!keyword) {
    res.status(400).json({ error: 'keyword_required' });
    return;
  }
  try {
    const { searchNews } = await import('../services/data-providers/sosovalue/index.js');
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const items = await searchNews(keyword);
    res.json({ items: items.slice(0, limit), total: items.length });
  } catch (err) {
    logger.error({ err }, 'sosovalue/news/search failed');
    res.status(502).json({ error: 'sosovalue_api_error' });
  }
});

sosovalueRouter.get('/macro', async (req, res) => {
  if (!FEATURES.sosovalue) {
    res.status(502).json({ error: 'sosovalue_not_configured' });
    return;
  }
  try {
    const { getMacroEvents } = await import('../services/data-providers/sosovalue/index.js');
    const events = await getMacroEvents();
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    res.json({ items: events.slice(0, limit), total: events.length });
  } catch (err) {
    logger.error({ err }, 'sosovalue/macro failed');
    res.status(502).json({ error: 'sosovalue_api_error' });
  }
});

sosovalueRouter.get('/index/snapshots', async (_req, res) => {
  if (!FEATURES.sosovalue) {
    res.status(502).json({ error: 'sosovalue_not_configured' });
    return;
  }
  try {
    const { getIndexList, getIndexSnapshot } =
      await import('../services/data-providers/sosovalue/index.js');
    const tickers = await getIndexList();
    const snapshots = (
      await Promise.all(tickers.map((t) => getIndexSnapshot(t).catch(() => null)))
    ).filter(Boolean);
    res.json({ snapshots });
  } catch (err) {
    logger.error({ err }, 'sosovalue/index/snapshots failed');
    res.status(502).json({ error: 'sosovalue_api_error' });
  }
});
