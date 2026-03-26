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

// Protected: get current user
app.get('/api/auth/me', authMiddleware, async (req: any, res) => {
  try {
    const pool = (await import('./db/connection')).default;
    const result = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
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
