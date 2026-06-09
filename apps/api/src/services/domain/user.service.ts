import { query } from '../../db/pool.js';
import { encrypt, decrypt } from '../crypto.js';
import type { KrakenCredentials } from '../kraken.js';

/**
 * User domain service — pure business logic, no Express.
 * Tested in isolation.
 */

export async function getKrakenCredentials(userId: string): Promise<KrakenCredentials | null> {
  const { rows } = await query<{ k: string | null; s: string | null }>(
    `SELECT kraken_api_key_encrypted AS k, kraken_api_secret_encrypted AS s
     FROM users WHERE id = $1`,
    [userId],
  );
  const enc = rows[0];
  if (!enc?.k || !enc?.s) return null;
  return { apiKey: decrypt(enc.k), apiSecret: decrypt(enc.s) };
}

export async function saveKrakenCredentials(
  userId: string,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  await query(
    `UPDATE users SET kraken_api_key_encrypted = $1, kraken_api_secret_encrypted = $2 WHERE id = $3`,
    [encrypt(apiKey), encrypt(apiSecret), userId],
  );
}

export async function deleteKrakenCredentials(userId: string): Promise<void> {
  await query(
    `UPDATE users SET kraken_api_key_encrypted = NULL, kraken_api_secret_encrypted = NULL WHERE id = $1`,
    [userId],
  );
}
