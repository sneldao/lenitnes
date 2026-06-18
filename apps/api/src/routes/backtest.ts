import { Router, type Request, type Response } from 'express';
import {
  getBacktestStats,
  getSignalOutcomes,
  processSignalOutcomes,
} from '../services/domain/backtest.service.js';
import { describeReplay, replay, HALO2_REPLAY } from '../services/replay.js';

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
// Day 9: the founding-myth replay. v1 returns the canonical
// halo2 example for /halo2; other repos return []. Public,
// uncached — replays are rare and the data is small.
backtestRouter.get('/replay', async (req: Request, res: Response) => {
  const repo = String(req.query.repo ?? 'zcash/halo2');
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const asset = req.query.asset ? String(req.query.asset) : undefined;
  try {
    const verdicts = await replay(describeReplay({ repo, from, to, asset }));
    res.json({ repo, from, to, asset, verdicts });
  } catch (err) {
    res.status(500).json({ error: 'replay_failed', detail: (err as Error).message });
  }
});

// GET /backtest/replay/halo2 — the canonical example. Public.
backtestRouter.get('/replay/halo2', async (_req: Request, res: Response) => {
  res.json({ repo: 'zcash/halo2', verdicts: [HALO2_REPLAY] });
});
