import { createApp } from '../app';
import { generateToken } from '../middleware/auth';
import pool from '../db/connection';
import { runMigrations } from '../db/migrate';
import bcrypt from 'bcrypt';

/** Create a test-ready Express app (no rate limits, no logging) */
export function getTestApp() {
  return createApp({ skipRateLimit: true, skipLogging: true });
}

/** Run migrations against the test database */
export async function setupDatabase() {
  await runMigrations(pool);
}

/** Create a test user and return their id + auth token */
export async function createTestUser(overrides: { email?: string; name?: string; password?: string } = {}) {
  const email = overrides.email || `test-${Date.now()}@test.com`;
  const name = overrides.name || 'Test User';
  const password = overrides.password || 'Test1234';
  const passwordHash = await bcrypt.hash(password, 4); // Low rounds for speed

  const result = await pool.query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, passwordHash, name]
  );
  const user = result.rows[0];
  const token = generateToken(user.id);

  return { user, token, password };
}

/** Clean up all test data (run after each test suite) */
export async function cleanDatabase() {
  await pool.query('DELETE FROM balance_snapshots');
  await pool.query('DELETE FROM notification_log');
  await pool.query('DELETE FROM split_categories');
  await pool.query('DELETE FROM transactions_tags');
  await pool.query('DELETE FROM tags');
  await pool.query('DELETE FROM transactions');
  await pool.query('DELETE FROM budgets');
  await pool.query('DELETE FROM savings_goals');
  await pool.query('DELETE FROM accounts');
  await pool.query('DELETE FROM categories');
  await pool.query('DELETE FROM filter_presets');
  await pool.query('DELETE FROM users');
}

/** Close the database pool (run after all tests) */
export async function closeDatabase() {
  await pool.end();
}

/** Create a test account for a user */
export async function createTestAccount(userId: number, overrides: { name?: string; type?: string; balance?: number } = {}) {
  const result = await pool.query(
    'INSERT INTO accounts (user_id, name, type, balance, currency) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [userId, overrides.name || 'Test Checking', overrides.type || 'checking', overrides.balance ?? 1000, 'USD']
  );
  return result.rows[0];
}

/** Create a test category for a user */
export async function createTestCategory(userId: number, overrides: { name?: string; type?: string } = {}) {
  const result = await pool.query(
    'INSERT INTO categories (user_id, name, type) VALUES ($1, $2, $3) RETURNING *',
    [userId, overrides.name || 'Test Category', overrides.type || 'expense']
  );
  return result.rows[0];
}

/** Create a test transaction */
export async function createTestTransaction(userId: number, accountId: number, categoryId: number, overrides: { amount?: number; type?: string; description?: string; date?: string } = {}) {
  const result = await pool.query(
    `INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date, merchant)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      userId, accountId, categoryId,
      overrides.amount ?? 50,
      overrides.type || 'expense',
      overrides.description || 'Test transaction',
      overrides.date || new Date().toISOString().split('T')[0],
      'Test Merchant',
    ]
  );
  return result.rows[0];
}
