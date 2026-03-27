import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

const isProd = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/mint_clone',
  // Azure PostgreSQL requires SSL
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
  // Pool sizing: 5 in dev, 20 in prod
  max: isProd ? 20 : 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export default pool;
