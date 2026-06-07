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
