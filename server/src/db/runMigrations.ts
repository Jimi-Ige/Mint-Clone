import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import pool from './connection';
import { runMigrations } from './migrate';

async function main() {
  try {
    await runMigrations(pool);
  } catch (err) {
    console.error('[MIGRATE] Failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
