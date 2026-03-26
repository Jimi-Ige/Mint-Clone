import { Router, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ── Capture a balance snapshot for today ──────────────────────────
router.post('/capture', async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all account balances for this user
    const { rows: accounts } = await pool.query(
      `SELECT id, name, type, balance FROM accounts WHERE user_id = $1 ORDER BY id`,
      [req.userId]
    );

    const accountBalances = accounts.map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: parseFloat(a.balance),
    }));

    // Calculate totals: credit cards are liabilities (negative net worth)
    let totalAssets = 0;
    let totalLiabilities = 0;
    for (const a of accountBalances) {
      if (a.type === 'credit') {
        totalLiabilities += Math.abs(a.balance);
      } else {
        totalAssets += a.balance;
      }
    }
    const totalBalance = totalAssets - totalLiabilities;

    // Upsert: one snapshot per user per day
    const result = await pool.query(
      `INSERT INTO balance_snapshots (user_id, date, total_balance, total_assets, total_liabilities, account_balances)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, date) DO UPDATE SET
         total_balance = EXCLUDED.total_balance,
         total_assets = EXCLUDED.total_assets,
         total_liabilities = EXCLUDED.total_liabilities,
         account_balances = EXCLUDED.account_balances,
         created_at = NOW()
       RETURNING *`,
      [req.userId, today, totalBalance, totalAssets, totalLiabilities, JSON.stringify(accountBalances)]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Snapshot capture error:', err);
    res.status(500).json({ error: 'Failed to capture snapshot' });
  }
});

// ── Get net worth history ─────────────────────────────────────────
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const months = Math.min(Number(req.query.months) || 12, 60);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { rows } = await pool.query(
      `SELECT date, total_balance, total_assets, total_liabilities, account_balances
       FROM balance_snapshots
       WHERE user_id = $1 AND date >= $2
       ORDER BY date ASC`,
      [req.userId, startDate.toISOString().split('T')[0]]
    );

    // Parse numeric fields
    const history = rows.map((r: any) => ({
      date: r.date,
      total_balance: parseFloat(r.total_balance),
      total_assets: parseFloat(r.total_assets),
      total_liabilities: parseFloat(r.total_liabilities),
      account_balances: r.account_balances,
    }));

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── Get latest snapshot ───────────────────────────────────────────
router.get('/latest', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT date, total_balance, total_assets, total_liabilities, account_balances
       FROM balance_snapshots
       WHERE user_id = $1
       ORDER BY date DESC
       LIMIT 1`,
      [req.userId]
    );

    if (rows.length === 0) {
      return res.json(null);
    }

    const r = rows[0];
    res.json({
      date: r.date,
      total_balance: parseFloat(r.total_balance),
      total_assets: parseFloat(r.total_assets),
      total_liabilities: parseFloat(r.total_liabilities),
      account_balances: r.account_balances,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch latest snapshot' });
  }
});

// ── Backfill historical snapshots from transaction history ────────
router.post('/backfill', async (req: AuthRequest, res: Response) => {
  try {
    // Get the earliest transaction date
    const { rows: earliest } = await pool.query(
      `SELECT MIN(date) as first_date FROM transactions WHERE user_id = $1`,
      [req.userId]
    );

    if (!earliest[0].first_date) {
      return res.json({ filled: 0, message: 'No transactions to backfill from' });
    }

    // Get current account balances as starting point
    const { rows: accounts } = await pool.query(
      `SELECT id, name, type, balance FROM accounts WHERE user_id = $1 ORDER BY id`,
      [req.userId]
    );

    // Get all transactions sorted newest first to "wind back" balances
    const { rows: transactions } = await pool.query(
      `SELECT account_id, amount, type, date FROM transactions
       WHERE user_id = $1 ORDER BY date DESC, created_at DESC`,
      [req.userId]
    );

    // Build a map of running balances per account going backward
    const currentBalances: Record<number, number> = {};
    accounts.forEach((a: any) => { currentBalances[a.id] = parseFloat(a.balance); });

    const accountMeta: Record<number, { name: string; type: string }> = {};
    accounts.forEach((a: any) => { accountMeta[a.id] = { name: a.name, type: a.type }; });

    // Group transactions by date
    const txByDate = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      const d = new Date(tx.date).toISOString().split('T')[0];
      if (!txByDate.has(d)) txByDate.set(d, []);
      txByDate.get(d)!.push(tx);
    }

    // Generate monthly snapshots: start from today, work backward
    const today = new Date();
    const firstDate = new Date(earliest[0].first_date);
    const snapshots: Array<{
      date: string;
      balances: Record<number, number>;
    }> = [];

    // Current state is today's snapshot
    const runningBalances = { ...currentBalances };

    // Walk backward month by month
    const cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor >= firstDate) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const snapshotDate = monthEnd > today ? today.toISOString().split('T')[0] : monthEnd.toISOString().split('T')[0];

      snapshots.push({
        date: snapshotDate,
        balances: { ...runningBalances },
      });

      // Reverse all transactions in this month to get previous month's end balance
      const monthStart = cursor.toISOString().split('T')[0];
      const monthEndStr = monthEnd.toISOString().split('T')[0];

      for (const [dateStr, txns] of txByDate) {
        if (dateStr >= monthStart && dateStr <= monthEndStr) {
          for (const tx of txns) {
            const amt = parseFloat(tx.amount);
            // Reverse the transaction effect
            if (tx.type === 'income') {
              runningBalances[tx.account_id] = (runningBalances[tx.account_id] || 0) - amt;
            } else {
              runningBalances[tx.account_id] = (runningBalances[tx.account_id] || 0) + amt;
            }
          }
        }
      }

      cursor.setMonth(cursor.getMonth() - 1);
    }

    // Insert snapshots (oldest first)
    snapshots.reverse();
    let filled = 0;

    for (const snap of snapshots) {
      const accountBalances = Object.entries(snap.balances).map(([id, balance]) => ({
        id: Number(id),
        name: accountMeta[Number(id)]?.name || 'Unknown',
        type: accountMeta[Number(id)]?.type || 'checking',
        balance,
      }));

      let totalAssets = 0;
      let totalLiabilities = 0;
      for (const a of accountBalances) {
        if (a.type === 'credit') {
          totalLiabilities += Math.abs(a.balance);
        } else {
          totalAssets += a.balance;
        }
      }

      await pool.query(
        `INSERT INTO balance_snapshots (user_id, date, total_balance, total_assets, total_liabilities, account_balances)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, date) DO NOTHING`,
        [req.userId, snap.date, totalAssets - totalLiabilities, totalAssets, totalLiabilities, JSON.stringify(accountBalances)]
      );
      filled++;
    }

    res.json({ filled, message: `Backfilled ${filled} monthly snapshots` });
  } catch (err) {
    console.error('Backfill error:', err);
    res.status(500).json({ error: 'Failed to backfill snapshots' });
  }
});

export default router;
