import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/../../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/mint_clone',
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export default pool;
