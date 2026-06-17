import { Router, type Request, type Response } from 'express';
import { getDlqDepth, listDlqJobs, replayDlqJob, discardDlqJob } from '../queue/dlq.js';
import { logger } from '../logger.js';

export const dlqRouter = Router();

// GET /dlq — list DLQ jobs and depth
dlqRouter.get('/', async (req: Request, res: Response) => {
  const depth = await getDlqDepth();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const jobs = await listDlqJobs(limit);
  res.json({ depth, jobs });
});

// POST /dlq/:jobId/replay — re-enqueue the monitor check on the main queue
dlqRouter.post('/:jobId/replay', async (req: Request, res: Response) => {
  const ok = await replayDlqJob(req.params.jobId);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  logger.info({ jobId: req.params.jobId }, 'DLQ job replayed via admin route');
  res.json({ ok: true });
});

// DELETE /dlq/:jobId — permanently discard a DLQ job
dlqRouter.delete('/:jobId', async (req: Request, res: Response) => {
  const ok = await discardDlqJob(req.params.jobId);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  logger.info({ jobId: req.params.jobId }, 'DLQ job discarded via admin route');
  res.json({ ok: true });
});
