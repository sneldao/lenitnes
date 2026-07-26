import { Router, type Request, type Response } from 'express';
import { getIntelligenceSnapshot } from '../services/intelligence.js';

export const intelligenceRouter = Router();

// GET /intelligence — public snapshot of the synthesis pipeline:
// velocity baselines, PR impact scores, near-miss signals, and
// per-source activity over the last 7 days. Cached 5 minutes.
intelligenceRouter.get('/', async (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === 'true';
    const snapshot = await getIntelligenceSnapshot({ refresh });
    res.json(snapshot);
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'intelligence scan failed' });
  }
});
