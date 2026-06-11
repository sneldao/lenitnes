import { Router, type Request, type Response } from 'express';
import { jwtVerify } from 'jose';
import { upsertUserByWallet, generateToken } from '../middleware/auth.js';
import { verifyWalletSignature, isRecentAuthMessage } from '../services/signature.js';
import { config } from '../config.js';
import { authSchema } from '../validation/index.js';
import { validate } from '../middleware/validate.js';

export const authRouter = Router();

const COOKIE_NAME = 'lenitnes_token';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  };
}

// POST /auth/login — verify an Ed25519 wallet signature, then issue JWT.
authRouter.post('/login', validate(authSchema), async (req, res) => {
  const { walletAddress, publicKey, message, signature, email } = req.body as {
    walletAddress: string;
    publicKey: string;
    message: string;
    signature: string;
    email?: string;
  };

  if (!isRecentAuthMessage(message)) {
    return res.status(401).json({ error: 'invalid_or_expired_message' });
  }

  if (!verifyWalletSignature(message, signature, publicKey)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const user = await upsertUserByWallet(walletAddress, email);
  const token = await generateToken(user.id, user.wallet_address, user.email ?? undefined);

  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({
    user: { id: user.id, wallet_address: user.wallet_address, email: user.email },
  });
});

// GET /auth/me — lightweight check if the user has a valid cookie.
authRouter.get('/me', async (req: Request, res: Response) => {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    COOKIE_NAME
  ];
  if (!cookieToken) return res.status(401).json({ error: 'not_authenticated' });

  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jwtVerify(cookieToken, secret, { clockTolerance: 60 });
    res.json({
      id: payload.sub as string,
      wallet_address: payload.wallet_address as string,
      email: (payload.email as string) ?? null,
    });
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
});

// POST /auth/logout — clear the auth cookie.
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// POST /auth/refresh — validate existing cookie and issue a fresh 24h JWT.
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    COOKIE_NAME
  ];
  if (!cookieToken) {
    return res.status(401).json({ error: 'missing_token' });
  }
  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jwtVerify(cookieToken, secret, { clockTolerance: 60 });
    const userId = payload.sub as string;
    const walletAddress = payload.wallet_address as string;
    const email = (payload.email as string) ?? undefined;
    const newToken = await generateToken(userId, walletAddress, email);
    res.cookie(COOKIE_NAME, newToken, cookieOptions());
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
});
