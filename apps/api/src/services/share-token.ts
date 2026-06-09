import crypto from 'node:crypto';
import { config } from '../config.js';

const SIGNAL_PROOF_SCOPE = 'signal-proof';

export function createSignalShareToken(signalId: string): string {
  return crypto
    .createHmac('sha256', config.jwtSecret)
    .update(`${SIGNAL_PROOF_SCOPE}:${signalId}`)
    .digest('hex');
}

export function verifySignalShareToken(signalId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = createSignalShareToken(signalId);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(token, 'hex');

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}
