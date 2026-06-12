import { Router, type Request, type Response } from 'express';
import {
  getBacktestStats,
  getSignalOutcomes,
  processSignalOutcomes,
} from '../services/domain/backtest.service.js';

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
