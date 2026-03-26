import { Router, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ── List all detected transfers ───────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM transactions WHERE user_id = $1 AND is_transfer = TRUE AND type = 'expense'`,
      [req.userId]
    );

    // Show transfers as pairs: the expense side with its matching income
    const { rows } = await pool.query(`
      SELECT t.id, t.description, t.amount, t.date, t.type,
             t.transfer_pair_id, t.account_id,
             a.name AS from_account,
             t2.account_id AS to_account_id,
             a2.name AS to_account
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN transactions t2 ON t.transfer_pair_id = t2.id
      LEFT JOIN accounts a2 ON t2.account_id = a2.id
      WHERE t.user_id = $1 AND t.is_transfer = TRUE AND t.type = 'expense'
      ORDER BY t.date DESC
      LIMIT $2 OFFSET $3
    `, [req.userId, Number(limit), offset]);

    res.json({
      transfers: rows,
      total: parseInt(countResult.rows[0].total),
      page: Number(page),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// ── Auto-detect transfers ─────────────────────────────────────────
router.post('/detect', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find potential transfer pairs:
    // - Same user, different accounts
    // - One expense, one income
    // - Same or very similar amounts
    // - Within 3 days of each other
    // - Neither already marked as a transfer
    const { rows: pairs } = await client.query(`
      SELECT
        e.id AS expense_id, e.amount AS expense_amount, e.date AS expense_date,
        e.description AS expense_desc, e.account_id AS expense_account_id,
        ea.name AS expense_account,
        i.id AS income_id, i.amount AS income_amount, i.date AS income_date,
        i.description AS income_desc, i.account_id AS income_account_id,
        ia.name AS income_account,
        ABS(e.amount - i.amount) AS amount_diff,
        ABS(e.date - i.date) AS date_diff
      FROM transactions e
      JOIN transactions i ON e.user_id = i.user_id
        AND e.type = 'expense' AND i.type = 'income'
        AND e.account_id != i.account_id
        AND ABS(e.amount - i.amount) <= GREATEST(e.amount * 0.02, 1)
        AND ABS(e.date - i.date) <= 3
        AND e.is_transfer = FALSE AND i.is_transfer = FALSE
      LEFT JOIN accounts ea ON e.account_id = ea.id
      LEFT JOIN accounts ia ON i.account_id = ia.id
      WHERE e.user_id = $1
      ORDER BY e.date DESC
    `, [req.userId]);

    // Deduplicate: each transaction can only be in one pair
    const usedIds = new Set<number>();
    let detected = 0;

    for (const pair of pairs) {
      if (usedIds.has(pair.expense_id) || usedIds.has(pair.income_id)) continue;

      // Mark both as transfers and link them
      await client.query(
        `UPDATE transactions SET is_transfer = TRUE, transfer_pair_id = $1 WHERE id = $2`,
        [pair.income_id, pair.expense_id]
      );
      await client.query(
        `UPDATE transactions SET is_transfer = TRUE, transfer_pair_id = $1 WHERE id = $2`,
        [pair.expense_id, pair.income_id]
      );

      usedIds.add(pair.expense_id);
      usedIds.add(pair.income_id);
      detected++;
    }

    await client.query('COMMIT');
    res.json({ detected, message: `Found ${detected} transfer pair${detected !== 1 ? 's' : ''}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transfer detection error:', err);
    res.status(500).json({ error: 'Failed to detect transfers' });
  } finally {
    client.release();
  }
});

// ── Manually mark a pair as a transfer ────────────────────────────
router.post('/mark', async (req: AuthRequest, res: Response) => {
  const { expense_id, income_id } = req.body;
  if (!expense_id || !income_id) {
    return res.status(400).json({ error: 'expense_id and income_id are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify both belong to user and are correct types
    const expense = await client.query(
      `SELECT id, type, account_id FROM transactions WHERE id = $1 AND user_id = $2`,
      [expense_id, req.userId]
    );
    const income = await client.query(
      `SELECT id, type, account_id FROM transactions WHERE id = $1 AND user_id = $2`,
      [income_id, req.userId]
    );

    if (expense.rows.length === 0 || income.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (expense.rows[0].type !== 'expense' || income.rows[0].type !== 'income') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Must provide one expense and one income transaction' });
    }

    if (expense.rows[0].account_id === income.rows[0].account_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfers must be between different accounts' });
    }

    await client.query(
      `UPDATE transactions SET is_transfer = TRUE, transfer_pair_id = $1 WHERE id = $2`,
      [income_id, expense_id]
    );
    await client.query(
      `UPDATE transactions SET is_transfer = TRUE, transfer_pair_id = $1 WHERE id = $2`,
      [expense_id, income_id]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to mark transfer' });
  } finally {
    client.release();
  }
});

// ── Unmark a transfer ─────────────────────────────────────────────
router.post('/unmark/:id', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tx = await client.query(
      `SELECT id, transfer_pair_id FROM transactions WHERE id = $1 AND user_id = $2 AND is_transfer = TRUE`,
      [req.params.id, req.userId]
    );
    if (tx.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const pairId = tx.rows[0].transfer_pair_id;

    // Unmark both sides
    await client.query(
      `UPDATE transactions SET is_transfer = FALSE, transfer_pair_id = NULL WHERE id = $1`,
      [req.params.id]
    );
    if (pairId) {
      await client.query(
        `UPDATE transactions SET is_transfer = FALSE, transfer_pair_id = NULL WHERE id = $1 AND user_id = $2`,
        [pairId, req.userId]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to unmark transfer' });
  } finally {
    client.release();
  }
});

export default router;
