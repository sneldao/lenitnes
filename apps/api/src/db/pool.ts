import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Supabase / Railway typically require SSL in production.
  ssl: config.env === 'production' ? { rejectUnauthorized: false } : undefined,
  // Parse JSONB columns so screenshot_urls, action_config, etc. come back as objects.
  types: {
    getTypeParser: (oid: number) => {
      // 114 is JSONB's OID in PostgreSQL.
      if (oid === 114) return (val: string) => (val ? JSON.parse(val) : val);
      return null;
    },
  },
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}
