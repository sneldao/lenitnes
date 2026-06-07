import type { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { config } from '../config.js';
import { query } from '../db/pool.js';

// ─────────────────────────────────────────────────────────────
// Auth middleware — verifies a JWT Bearer token and attaches
// the decoded user to req.user.
// ─────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    wallet_address: string;
    email: string | null;
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.lenitnes_token;
  const header = req.headers.authorization ?? '';
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = cookieToken ?? headerToken;

  if (!token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }

  verifyToken(token)
    .then((payload) => {
      (req as AuthenticatedRequest).user = {
        id: payload.sub as string,
        wallet_address: payload.wallet_address as string,
        email: (payload.email as string) ?? null,
      };
      next();
    })
    .catch(() => res.status(401).json({ error: 'invalid_token' }));
}

// ── JWT verification ────────────────────────────────────────────

async function verifyToken(token: string) {
  // In production, use a JWKS endpoint (e.g. Auth0, Clerk, or a self-hosted JWKS).
  // For now, verify with a symmetric secret from config.
  const secret = new TextEncoder().encode(config.jwtSecret);
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

// ── Token generation (used by the /auth/login route) ──────────

export async function generateToken(userId: string, walletAddress: string, email?: string) {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const alg = 'HS256';
  const payload = {
    sub: userId,
    wallet_address: walletAddress,
    ...(email ? { email } : {}),
  };
  const { SignJWT } = await import('jose');
  return new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

// ── Upsert user by wallet address ──────────────────────────────

export async function upsertUserByWallet(walletAddress: string, email?: string) {
  const { rows } = await query<{ id: string; wallet_address: string; email: string | null }>(
    `INSERT INTO users (wallet_address, email)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE SET email = COALESCE($2, users.email)
     RETURNING id, wallet_address, email`,
    [walletAddress, email ?? null],
  );
  return rows[0];
}
