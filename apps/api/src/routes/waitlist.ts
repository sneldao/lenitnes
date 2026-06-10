import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { waitlistSchema } from '../validation/index.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../logger.js';

export const waitlistRouter = Router();

// POST /waitlist — join the early access waitlist (no auth required)
waitlistRouter.post('/', validate(waitlistSchema), async (req: Request, res: Response) => {
  const { email, source } = req.body as { email: string; source?: string };

  try {
    await query(
      `INSERT INTO waitlist (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [email.toLowerCase().trim(), source ?? 'web'],
    );
    return res.json({ ok: true, message: 'You are on the list. We will be in touch.' });
  } catch (err) {
    logger.error({ err, email }, 'waitlist insert failed');
    return res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// GET /waitlist/count — public count for social proof
waitlistRouter.get('/count', async (_req: Request, res: Response) => {
  try {
    const { rows } = await query<{ count: string }>(`SELECT count(*)::text AS count FROM waitlist`);
    return res.json({ count: Number(rows[0]?.count ?? 0) });
  } catch (err) {
    logger.error({ err }, 'waitlist count failed');
    return res.status(500).json({ error: 'Failed to count waitlist' });
  }
});
