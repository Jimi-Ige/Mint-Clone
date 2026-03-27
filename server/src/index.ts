import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './db/schema';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
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

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use(limiter);
app.use(cors());
app.use(express.json());

// Public auth routes (login, register)
app.use('/api/auth', authRouter);

// Protected: get current user (also captures daily balance snapshot)
app.get('/api/auth/me', authMiddleware, async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    const result = await pool.query('SELECT id, email, name, base_currency, created_at FROM users WHERE id = $1', [req.userId]);
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

// Protected API routes
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/categories', authMiddleware, categoriesRouter);
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
