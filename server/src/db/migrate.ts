import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Simple migration runner.
 * - Creates a `_migrations` table to track applied migrations.
 * - Scans `migrations/` for `.sql` files sorted by filename (NNN_name.sql).
 * - Runs each unapplied migration in a transaction.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query(
      'SELECT name FROM _migrations ORDER BY name'
    );
    const appliedSet = new Set(applied.map(r => r.name));

    // Detect pre-migration databases: if tables exist but no migrations recorded,
    // mark the initial schema migration as already applied
    if (appliedSet.size === 0) {
      const { rows: tables } = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'`
      );
      if (tables.length > 0) {
        console.log('[MIGRATE] Existing database detected — marking 001_initial_schema.sql as applied');
        await client.query(
          "INSERT INTO _migrations (name) VALUES ('001_initial_schema.sql') ON CONFLICT DO NOTHING"
        );
        appliedSet.add('001_initial_schema.sql');
      }
    }

    // Read migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let ranCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      console.log(`[MIGRATE] Running: ${file}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        ranCount++;
        console.log(`[MIGRATE] ✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE] ✗ ${file} failed:`, err);
        throw err;
      }
    }

    if (ranCount === 0) {
      console.log('[MIGRATE] Database is up to date');
    } else {
      console.log(`[MIGRATE] Applied ${ranCount} migration(s)`);
    }
  } finally {
    client.release();
  }
}
