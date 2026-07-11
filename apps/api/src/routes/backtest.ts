import { Router, type Request, type Response } from 'express';
import {
  getBacktestStats,
  getSignalOutcomes,
  processSignalOutcomes,
} from '../services/domain/backtest.service.js';
import { describeReplay, replay, HALO2_REPLAY } from '../services/replay.js';
import {
  ensureResponsivenessSweep,
  getResponsivenessSweepState,
  type SweepMode,
  type SweepTierFilter,
} from '../services/responsiveness-sweep.js';
import { computeTierDrift } from '../services/domain/repo-tier-policy.js';
import { getForwardPaperLog } from '../services/domain/forward-paper.service.js';
import { cacheGet, cacheSet } from '../middleware/cache.js';
import { config } from '../config.js';
import type { RepoTier } from '@lenitnes/types';

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
    const { verdicts, flaggedBatches } = await replay({ ...input, mock: !live });
    const payload = {
      repo,
      from: input.from,
      to: input.to,
      asset: input.asset,
      mode: live ? 'live' : 'mock',
      flaggedBatches,
      verdicts,
    };
    cacheSet(cacheKey, payload, 10 * 60 * 1000);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'replay_failed', detail: (err as Error).message });
  }
});

function sweepModeFromRequest(req: Request): SweepMode {
  const adminKey = req.header('x-admin-key') ?? '';
  const live = config.admin.apiKey !== '' && adminKey === config.admin.apiKey;
  return live ? 'live' : 'mock';
}

function isAdminRequest(req: Request): boolean {
  const adminKey = req.header('x-admin-key') ?? '';
  return config.admin.apiKey !== '' && adminKey === config.admin.apiKey;
}

function tierFromQuery(req: Request): SweepTierFilter | undefined {
  const raw = req.query.tier ? String(req.query.tier).toUpperCase() : undefined;
  if (raw === 'A' || raw === 'B' || raw === 'C') return raw as RepoTier;
  return undefined;
}

// GET /backtest/responsiveness?from=...&to=...&tier=A
// Background sweep — returns 202 while running, 200 when cached.
// tier= requires X-Admin-Key (live agent, scoped to mock tier labels).
backtestRouter.get('/responsiveness', async (req: Request, res: Response) => {
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;
  const mode = sweepModeFromRequest(req);
  const tier = tierFromQuery(req);

  if (tier && !isAdminRequest(req)) {
    res.status(403).json({
      error: 'tier_filter_requires_admin',
      message: 'tier=A|B|C requires X-Admin-Key for live scoped sweeps',
    });
    return;
  }

  const sweepOptions = { from, to, tier };
  const state = await getResponsivenessSweepState(mode, from, to, tier);
  if (state.status === 'ready' && state.payload) {
    res.json({ ...state.payload, status: 'ready' });
    return;
  }
  if (state.status === 'pending') {
    res.status(202).json({
      status: 'pending',
      mode,
      tierFilter: tier,
      startedAt: state.startedAt,
      message: 'Responsiveness sweep in progress — retry in 30–60s',
    });
    return;
  }
  if (state.status === 'error') {
    res.status(500).json({ error: 'responsiveness_failed', detail: state.error });
    return;
  }

  const next = await ensureResponsivenessSweep(mode, sweepOptions);
  if (next.status === 'ready' && next.payload) {
    res.json({ ...next.payload, status: 'ready' });
    return;
  }
  res.status(202).json({
    status: 'pending',
    mode,
    tierFilter: tier,
    startedAt: next.startedAt,
    message: 'Responsiveness sweep started — retry in 30–60s',
  });
});

// GET /backtest/responsiveness/compare — mock vs cached live A-tier + drift
backtestRouter.get('/responsiveness/compare', async (_req: Request, res: Response) => {
  const mockState = await getResponsivenessSweepState('mock');
  const liveState = await getResponsivenessSweepState('live', undefined, undefined, 'A');

  if (mockState.status !== 'ready' || !mockState.payload) {
    res.status(202).json({
      status: 'pending',
      message: 'Mock sweep required before compare view',
    });
    return;
  }

  const drift = computeTierDrift(mockState.payload.profiles, liveState.payload?.profiles);
  res.json({
    status: 'ready',
    mock: mockState.payload,
    live: liveState.status === 'ready' ? liveState.payload : null,
    liveStatus: liveState.status,
    drift,
  });
});

// GET /backtest/forward-paper?days=7 — live agent forward paper log
backtestRouter.get('/forward-paper', async (req: Request, res: Response) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 7) || 7));
  const summary = await getForwardPaperLog(days);
  res.json(summary);
});

// GET /backtest/tiers — repo A/B/C tier list from latest sweep
backtestRouter.get('/tiers', async (req: Request, res: Response) => {
  const mode = sweepModeFromRequest(req);
  const state = await getResponsivenessSweepState(mode);
  if (state.status !== 'ready' || !state.payload) {
    res.status(202).json({
      status: state.status === 'pending' ? 'pending' : 'idle',
      message: 'Tier list requires a completed responsiveness sweep',
    });
    return;
  }
  res.json({
    mode,
    completedAt: state.payload.completedAt,
    tiers: state.payload.profiles.map((p) => ({
      repo: p.repo,
      asset: p.asset,
      tier: p.tier,
      tierReason: p.tierReason,
      hitRateT7d: p.hitRateT7d,
      hitRateT1d: p.hitRateT1d,
    })),
  });
});

// GET /backtest/replay/halo2 — the canonical example. Public.
backtestRouter.get('/replay/halo2', async (_req: Request, res: Response) => {
  res.json({ repo: 'zcash/halo2', verdicts: [HALO2_REPLAY] });
});
