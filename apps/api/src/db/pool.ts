import pg from 'pg';
import { config } from '../config.js';

// Parse JSONB columns so screenshot_urls, action_config, etc. come back as objects.
pg.types.setTypeParser(114, (val: string) => (val ? JSON.parse(val) : val));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Supabase / Railway typically require SSL in production.
  // PGSSLMODE=disable skips SSL (used for Docker-internal postgres).
  ssl:
    process.env.PGSSLMODE === 'disable'
      ? false
      : config.env === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/**
 * Run a callback within a single DB transaction (BEGIN/COMMIT/ROLLBACK).
 * If the callback throws, the transaction is rolled back and the error is
 * re-thrown. The client is always released back to the pool.
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   const { rows } = await client.query('UPDATE ...');
 *   await client.query('INSERT ...');
 *   return rows[0];
 * });
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // ROLLBACK itself can fail if the connection is broken; swallow.
    });
    throw err;
  } finally {
    client.release();
  }
}
