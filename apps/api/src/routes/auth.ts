import { Router } from 'express';
import { z } from 'zod';
import { upsertUserByWallet, generateToken } from '../middleware/auth.js';
import { verifyEd25519, isRecentAuthMessage } from '../services/signature.js';

export const authRouter = Router();

// POST /auth/login — verify an Ed25519 signature from HashConnect, then issue JWT.
const loginSchema = z.object({
  walletAddress: z.string().min(1),
  publicKey: z.string().min(1), // hex-encoded Ed25519 public key
  message: z.string().min(1), // e.g. "lenitnes:auth:1717700000000"
  signature: z.string().min(1), // hex-encoded Ed25519 signature
  email: z.string().email().optional(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { walletAddress, publicKey, message, signature, email } = parsed.data;

  // 1) Message must be a recent LENITNES auth nonce.
  if (!isRecentAuthMessage(message)) {
    return res.status(401).json({ error: 'invalid_or_expired_message' });
  }

  // 2) Verify Ed25519 signature.
  if (!verifyEd25519(message, signature, publicKey)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const user = await upsertUserByWallet(walletAddress, email);
  const token = await generateToken(user.id, user.wallet_address, user.email ?? undefined);

  res.json({
    token,
    user: { id: user.id, wallet_address: user.wallet_address, email: user.email },
  });
});
