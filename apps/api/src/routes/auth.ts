import { Router } from 'express';
import { z } from 'zod';
import { upsertUserByWallet, generateToken } from '../middleware/auth.js';

export const authRouter = Router();

// POST /auth/login — upsert user by wallet address, return JWT.
// In production this would verify a HashConnect signature proof.
// For now, accepts wallet_address directly (demo/dev path).
const loginSchema = z.object({
  walletAddress: z.string().min(1),
  email: z.string().email().optional(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { walletAddress, email } = parsed.data;
  const user = await upsertUserByWallet(walletAddress, email);
  const token = await generateToken(user.id, user.wallet_address, user.email ?? undefined);

  res.json({
    token,
    user: { id: user.id, wallet_address: user.wallet_address, email: user.email },
  });
});
