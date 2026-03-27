import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './db/schema';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { validateEnv } from './middleware/envCheck';
import { validate } from './middleware/validate';
import { profileUpdateSchema, preferencesSchema } from './schemas';
import authRouter from './routes/auth';
import accountsRouter from './routes/accounts';
import categoriesRouter from './routes/categories';
import transactionsRouter from './routes/transactions';
import budgetsRouter from './routes/budgets';
import goalsRouter from './routes/goals';
import dashboardRouter from './routes/dashboard';
import plaidRouter from './routes/plaid';
import recurringRouter from './routes/recurring';
import transfersRouter from './routes/transfers';
import snapshotsRouter from './routes/snapshots';
import tagsRouter from './routes/tags';
import currencyRouter from './routes/currency';
import filterPresetsRouter from './routes/filterPresets';
import analyticsRouter from './routes/analytics';
import splitsRouter from './routes/splits';
import reportsRouter from './routes/reports';
import webhooksRouter from './routes/webhooks';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Validate required env vars before doing anything else
validateEnv();

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Trust Azure App Service reverse proxy
if (isProd) {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // CSP handled by frontend build
  crossOriginEmbedderPolicy: false,
}));

// Global rate limiting — 200 req / 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict rate limit on auth endpoints — 10 attempts / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// Rate limit for AI categorization — 5 bulk requests / 15 min per IP
const categorizeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Categorization rate limit reached, please try again later' },
});

app.use(limiter);
app.use(cors({
  origin: isProd ? process.env.CORS_ORIGIN || true : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Health & version (no auth, no rate limit)
app.get('/api/health', async (_req, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unhealthy', timestamp: new Date().toISOString() });
  }
});

app.get('/api/version', (_req, res) => {
  res.json({
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    env: process.env.NODE_ENV || 'development',
  });
});

// Public routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/webhooks', webhooksRouter);

// Protected: get current user (also captures daily balance snapshot)
app.get('/api/auth/me', authMiddleware, async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    const result = await pool.query('SELECT id, email, name, base_currency, preferences, onboarding_completed, created_at FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);

    // Fire-and-forget: capture daily balance snapshot
    const today = new Date().toISOString().split('T')[0];
    const existing = await pool.query(
      'SELECT id FROM balance_snapshots WHERE user_id = $1 AND date = $2', [req.userId, today]
    );
    if (existing.rows.length === 0) {
      const { rows: accounts } = await pool.query(
        'SELECT id, name, type, balance FROM accounts WHERE user_id = $1', [req.userId]
      );
      const balances = accounts.map((a: any) => ({ id: a.id, name: a.name, type: a.type, balance: parseFloat(a.balance) }));
      let assets = 0, liabilities = 0;
      balances.forEach((a: any) => { if (a.type === 'credit') liabilities += Math.abs(a.balance); else assets += a.balance; });
      await pool.query(
        `INSERT INTO balance_snapshots (user_id, date, total_balance, total_assets, total_liabilities, account_balances)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [req.userId, today, assets - liabilities, assets, liabilities, JSON.stringify(balances)]
      ).catch(() => {}); // Silently ignore snapshot errors
    }
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Profile & preferences (protected)
app.put('/api/auth/profile', authMiddleware, validate(profileUpdateSchema), async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    const { name, currentPassword, newPassword } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }

    if (newPassword) {
      const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
      const bcrypt = (await import('bcrypt')).default;
      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      const hash = await bcrypt.hash(newPassword, 12);
      updates.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.userId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);

    const result = await pool.query('SELECT id, email, name, base_currency, preferences, onboarding_completed FROM users WHERE id = $1', [req.userId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/auth/preferences', authMiddleware, async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    const result = await pool.query('SELECT preferences FROM users WHERE id = $1', [req.userId]);
    res.json(result.rows[0]?.preferences || {});
  } catch {
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

app.put('/api/auth/preferences', authMiddleware, validate(preferencesSchema), async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    const { preferences } = req.body;
    // Merge with existing preferences
    await pool.query(
      `UPDATE users SET preferences = preferences || $1::jsonb WHERE id = $2`,
      [JSON.stringify(preferences), req.userId]
    );
    const result = await pool.query('SELECT preferences FROM users WHERE id = $1', [req.userId]);
    res.json(result.rows[0].preferences);
  } catch {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

app.put('/api/auth/onboarding', authMiddleware, async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    await pool.query('UPDATE users SET onboarding_completed = TRUE WHERE id = $1', [req.userId]);
    res.json({ onboarding_completed: true });
  } catch {
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
});

// Protected API routes
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/transactions/categorize-bulk', authMiddleware, categorizeLimiter);
app.use('/api/transactions', authMiddleware, transactionsRouter);
app.use('/api/budgets', authMiddleware, budgetsRouter);
app.use('/api/goals', authMiddleware, goalsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/plaid', authMiddleware, plaidRouter);
app.use('/api/recurring', authMiddleware, recurringRouter);
app.use('/api/transfers', authMiddleware, transfersRouter);
app.use('/api/snapshots', authMiddleware, snapshotsRouter);
app.use('/api/tags', authMiddleware, tagsRouter);
app.use('/api/currency', authMiddleware, currencyRouter);
app.use('/api/filter-presets', authMiddleware, filterPresetsRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/splits', authMiddleware, splitsRouter);
app.use('/api/reports', authMiddleware, reportsRouter);

// Serve static files in production
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use(errorHandler);

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
