import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';

export const profileRouter = Router();

// GET /account/profile — returns current user profile fields.
profileRouter.get('/', async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  try {
    const { rows } = await query<{
      id: string;
      wallet_address: string;
      email: string | null;
      display_name: string | null;
      created_at: string;
    }>(`SELECT id, wallet_address, email, display_name, created_at FROM users WHERE id = $1`, [
      userId,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'failed to fetch profile');
    res.status(500).json({ error: 'failed to fetch profile' });
  }
});

// PUT /account/profile — update display_name and email.
profileRouter.put('/', async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const { display_name, email } = req.body as {
    display_name?: string;
    email?: string;
  };

  try {
    const { rows } = await query<{
      id: string;
      wallet_address: string;
      email: string | null;
      display_name: string | null;
    }>(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           email = COALESCE($2, users.email)
       WHERE id = $3
       RETURNING id, wallet_address, email, display_name`,
      [display_name ?? null, email ?? null, userId],
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, 'failed to update profile');
    res.status(500).json({ error: 'failed to update profile' });
  }
});
