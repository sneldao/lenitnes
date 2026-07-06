import { Router, type Request, type Response } from 'express';
import {
  getBacktestStats,
  getSignalOutcomes,
  processSignalOutcomes,
} from '../services/domain/backtest.service.js';
import { describeReplay, replay, HALO2_REPLAY } from '../services/replay.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { config } from '../config.js';

export const backtestRouter = Router();

// GET /backtest/stats?detector=emergency_patch&asset=zcash
backtestRouter.get('/stats', async (req: Request, res: Response) => {
  const detectorType = req.query.detector ? String(req.query.detector) : undefined;
  const asset = req.query.asset ? String(req.query.asset) : undefined;
  const stats = await getBacktestStats({ detectorType, asset });
  res.json(stats);
});

// GET /backtest/signals/:id/outcomes
backtestRouter.get('/signals/:id/outcomes', async (req: Request, res: Response) => {
  const outcomes = await getSignalOutcomes(req.params.id);
  res.json(outcomes);
});

// POST /backtest/process — trigger on-demand backtest processing
backtestRouter.post('/process', async (_req: Request, res: Response) => {
  const result = await processSignalOutcomes();
  res.json({ ok: true, ...result });
});

// GET /backtest/replay?repo=zcash/halo2&from=...&to=...&asset=zcash
// Real repo-range scan: fetches actual commit history, batches by
// day, runs the live detectors, scores firing batches. PUBLIC calls
// run in mock mode (deterministic detector-max conviction — zero
// LLM cost, still a real leak-scan). A valid X-Admin-Key unlocks
// live agent reasoning for paid/demo scans. 10-min cache bounds
// GitHub API pressure from repeat lookups.
backtestRouter.get('/replay', async (req: Request, res: Response) => {
  const repo = String(req.query.repo ?? 'zcash/halo2');
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const asset = req.query.asset ? String(req.query.asset) : undefined;

  const adminKey = req.header('x-admin-key') ?? '';
  const live = config.admin.apiKey !== '' && adminKey === config.admin.apiKey;

  const cacheKey = `replay:${repo}:${from ?? ''}:${to ?? ''}:${asset ?? ''}:${live ? 'live' : 'mock'}`;
  const cached = cacheGet<object>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const input = describeReplay({ repo, from, to, asset });
    const verdicts = await replay({ ...input, mock: !live });
    const payload = {
      repo,
      from: input.from,
      to: input.to,
      asset: input.asset,
      mode: live ? 'live' : 'mock',
      verdicts,
    };
    cacheSet(cacheKey, payload, 10 * 60 * 1000);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'replay_failed', detail: (err as Error).message });
  }
});

// GET /backtest/replay/halo2 — the canonical example. Public.
backtestRouter.get('/replay/halo2', async (_req: Request, res: Response) => {
  res.json({ repo: 'zcash/halo2', verdicts: [HALO2_REPLAY] });
});
