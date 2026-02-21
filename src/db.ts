import pg from 'pg';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export default pool;
