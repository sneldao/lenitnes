import { Router } from 'express';
import { z } from 'zod';
import { jwtVerify } from 'jose';
import { upsertUserByWallet, generateToken } from '../middleware/auth.js';
import { verifyEd25519, isRecentAuthMessage } from '../services/signature.js';
import { config } from '../config.js';

export const authRouter = Router();

// POST /auth/login — verify an Ed25519 signature from HashConnect, then issue JWT.
const loginSchema = z.object({
  walletAddress: z.string().min(1).max(100),
  publicKey: z.string().min(1).max(200), // hex-encoded Ed25519 public key
  message: z
    .string()
    .min(1)
    .max(200)
    .refine((m) => m.startsWith('lenitnes:auth:'), {
      message: 'Message must be a lenitnes auth nonce',
    }),
  signature: z.string().min(1).max(500), // hex-encoded Ed25519 signature
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

// POST /auth/refresh — validate existing (non-expired) token and issue a fresh 24h JWT.
authRouter.post('/refresh', async (req, res) => {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }
  const token = header.slice(7);
  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });
    const userId = payload.sub as string;
    const walletAddress = payload.wallet_address as string;
    const email = (payload.email as string) ?? undefined;
    const newToken = await generateToken(userId, walletAddress, email);
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
});
