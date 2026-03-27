import { Router, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ── List all recurring patterns ───────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status || 'active';
    const result = await pool.query(
      `SELECT rp.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
              a.name AS account_name
       FROM recurring_patterns rp
       LEFT JOIN categories c ON rp.category_id = c.id
       LEFT JOIN accounts a ON rp.account_id = a.id
       WHERE rp.user_id = $1 AND rp.status = $2
       ORDER BY rp.next_expected ASC`,
      [req.userId, status]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recurring patterns' });
  }
});

// ── Get upcoming bills (next N days) ──────────────────────────────
router.get('/upcoming', async (req: AuthRequest, res: Response) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const result = await pool.query(
      `SELECT rp.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
              a.name AS account_name
       FROM recurring_patterns rp
       LEFT JOIN categories c ON rp.category_id = c.id
       LEFT JOIN accounts a ON rp.account_id = a.id
       WHERE rp.user_id = $1
         AND rp.status = 'active'
         AND rp.next_expected <= CURRENT_DATE + $2 * INTERVAL '1 day'
       ORDER BY rp.next_expected ASC`,
      [req.userId, days]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch upcoming bills' });
  }
});

// ── Detect recurring patterns from transaction history ────────────
router.post('/detect', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all transactions for user, grouped by normalized description
    const txResult = await client.query(
      `SELECT description, merchant_name, type, category_id, account_id,
              amount, date
       FROM transactions
       WHERE user_id = $1 AND pending = FALSE
       ORDER BY description, date`,
      [req.userId]
    );

    const transactions = txResult.rows;

    // Group transactions by normalized key (description + type)
    const groups = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      const key = normalizeKey(tx.description, tx.merchant_name, tx.type);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }

    let detected = 0;
    let updated = 0;

    for (const [, txns] of groups) {
      if (txns.length < 2) continue;

      // Sort by date
      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate intervals between consecutive transactions
      const intervals: number[] = [];
      for (let i = 1; i < txns.length; i++) {
        const diff = Math.round(
          (new Date(txns[i].date).getTime() - new Date(txns[i - 1].date).getTime()) / (1000 * 60 * 60 * 24)
        );
        intervals.push(diff);
      }

      if (intervals.length === 0) continue;

      // Detect frequency
      const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;
      const frequency = detectFrequency(avgInterval);
      if (!frequency) continue;

      // Calculate amount consistency (standard deviation)
      const amounts = txns.map(t => parseFloat(t.amount));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const variance = amounts.reduce((s, a) => s + Math.pow(a - avgAmount, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      const amountConsistency = avgAmount > 0 ? 1 - Math.min(stdDev / avgAmount, 1) : 0;

      // Calculate interval consistency
      const expectedInterval = getExpectedInterval(frequency);
      const intervalVariance = intervals.reduce((s, i) => s + Math.pow(i - expectedInterval, 2), 0) / intervals.length;
      const intervalConsistency = 1 - Math.min(Math.sqrt(intervalVariance) / expectedInterval, 1);

      // Confidence score (0-1): weighted combo of count, amount consistency, interval consistency
      const countScore = Math.min(txns.length / 6, 1); // max at 6 occurrences
      const confidence = Math.round(
        (countScore * 0.3 + amountConsistency * 0.35 + intervalConsistency * 0.35) * 100
      ) / 100;

      // Only save patterns with >40% confidence
      if (confidence < 0.4) continue;

      const lastTx = txns[txns.length - 1];
      const nextExpected = calculateNextDate(new Date(lastTx.date), frequency);

      // Check if pattern already exists
      const existing = await client.query(
        `SELECT id FROM recurring_patterns
         WHERE user_id = $1 AND LOWER(description) = LOWER($2) AND type = $3 AND status != 'dismissed'`,
        [req.userId, lastTx.description, lastTx.type]
      );

      if (existing.rows.length > 0) {
        // Update existing pattern
        await client.query(
          `UPDATE recurring_patterns
           SET amount = $1, avg_amount = $2, frequency = $3, last_date = $4,
               next_expected = $5, confidence = $6, occurrence_count = $7,
               category_id = $8, account_id = $9, merchant_name = $10,
               updated_at = NOW()
           WHERE id = $11`,
          [
            parseFloat(lastTx.amount), avgAmount, frequency,
            lastTx.date, nextExpected.toISOString().split('T')[0],
            confidence, txns.length,
            lastTx.category_id, lastTx.account_id,
            lastTx.merchant_name,
            existing.rows[0].id,
          ]
        );
        updated++;
      } else {
        // Insert new pattern
        await client.query(
          `INSERT INTO recurring_patterns
           (user_id, description, merchant_name, amount, type, category_id, account_id,
            frequency, avg_amount, last_date, next_expected, confidence, occurrence_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            req.userId, lastTx.description, lastTx.merchant_name,
            parseFloat(lastTx.amount), lastTx.type,
            lastTx.category_id, lastTx.account_id,
            frequency, avgAmount,
            lastTx.date, nextExpected.toISOString().split('T')[0],
            confidence, txns.length,
          ]
        );
        detected++;
      }
    }

    await client.query('COMMIT');
    res.json({ detected, updated, message: `Found ${detected} new patterns, updated ${updated} existing` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Detection error:', err);
    res.status(500).json({ error: 'Failed to detect recurring patterns' });
  } finally {
    client.release();
  }
});

// ── Create a manual recurring pattern ─────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { description, amount, type, category_id, account_id, frequency, next_expected } = req.body;
    if (!description || !amount || !type || !frequency || !next_expected) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO recurring_patterns
       (user_id, description, amount, type, category_id, account_id, frequency,
        avg_amount, last_date, next_expected, confidence, occurrence_count, auto_detected)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $3, $8, $8, 1.0, 0, FALSE)
       RETURNING *`,
      [req.userId, description, amount, type, category_id || null, account_id || null, frequency, next_expected]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create recurring pattern' });
  }
});

// ── Update a recurring pattern (edit, pause, dismiss) ─────────────
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    const allowedFields = ['description', 'amount', 'frequency', 'next_expected', 'status', 'category_id', 'account_id'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(req.body[field]);
        paramIdx++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, req.userId);

    const result = await pool.query(
      `UPDATE recurring_patterns SET ${updates.join(', ')}
       WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pattern' });
  }
});

// ── Delete a recurring pattern ────────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM recurring_patterns WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete pattern' });
  }
});

// ── Record a payment from a recurring pattern ────────────────────
router.post('/:id/record', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM recurring_patterns WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active pattern not found' });
    }

    const pattern = result.rows[0];
    const amount = req.body.amount ? parseFloat(req.body.amount) : parseFloat(pattern.avg_amount);
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const accountId = pattern.account_id;

    if (!accountId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Pattern has no linked account. Edit the pattern to add one.' });
    }

    // Verify account belongs to user
    const acc = await client.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [accountId, req.userId]);
    if (acc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Account not found' });
    }

    // Create the transaction
    const txResult = await client.query(
      `INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, accountId, pattern.category_id, amount, pattern.type, pattern.description, date]
    );

    // Update account balance
    const balanceChange = pattern.type === 'income' ? amount : -amount;
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [balanceChange, accountId]);

    // Advance pattern to next occurrence
    const nextDate = calculateNextDate(new Date(pattern.next_expected), pattern.frequency);
    await client.query(
      `UPDATE recurring_patterns
       SET last_date = $1, next_expected = $2, occurrence_count = occurrence_count + 1, updated_at = NOW()
       WHERE id = $3`,
      [date, nextDate.toISOString().split('T')[0], pattern.id]
    );

    await client.query('COMMIT');

    // Return transaction with category/account info
    const { rows } = await pool.query(`
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = $1
    `, [txResult.rows[0].id]);

    res.status(201).json({
      transaction: rows[0],
      nextExpected: nextDate.toISOString().split('T')[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Record payment error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  } finally {
    client.release();
  }
});

// ── Skip an occurrence (advance without creating transaction) ────
router.post('/:id/skip', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM recurring_patterns WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Active pattern not found' });
    }

    const pattern = result.rows[0];
    const nextDate = calculateNextDate(new Date(pattern.next_expected), pattern.frequency);

    await pool.query(
      `UPDATE recurring_patterns SET next_expected = $1, updated_at = NOW() WHERE id = $2`,
      [nextDate.toISOString().split('T')[0], pattern.id]
    );

    res.json({ nextExpected: nextDate.toISOString().split('T')[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to skip occurrence' });
  }
});

// ── Process all overdue patterns (batch auto-create) ─────────────
router.post('/process-due', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all active patterns where next_expected is in the past
    const { rows: duePatterns } = await client.query(
      `SELECT * FROM recurring_patterns
       WHERE user_id = $1 AND status = 'active' AND next_expected <= CURRENT_DATE AND account_id IS NOT NULL`,
      [req.userId]
    );

    let created = 0;
    let skipped = 0;
    const results: { description: string; amount: number; date: string }[] = [];

    for (const pattern of duePatterns) {
      // Only process if account exists
      const acc = await client.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [pattern.account_id, req.userId]);
      if (acc.rows.length === 0) {
        skipped++;
        continue;
      }

      // Create transaction for the due date
      const amount = parseFloat(pattern.avg_amount);
      const date = pattern.next_expected;

      await client.query(
        `INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.userId, pattern.account_id, pattern.category_id, amount, pattern.type, pattern.description, date]
      );

      // Update account balance
      const balanceChange = pattern.type === 'income' ? amount : -amount;
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [balanceChange, pattern.account_id]);

      // Advance to next occurrence
      const nextDate = calculateNextDate(new Date(pattern.next_expected), pattern.frequency);
      await client.query(
        `UPDATE recurring_patterns
         SET last_date = $1, next_expected = $2, occurrence_count = occurrence_count + 1, updated_at = NOW()
         WHERE id = $3`,
        [date, nextDate.toISOString().split('T')[0], pattern.id]
      );

      created++;
      results.push({ description: pattern.description, amount, date });
    }

    await client.query('COMMIT');
    res.json({
      processed: created,
      skipped,
      total: duePatterns.length,
      transactions: results,
      message: created > 0
        ? `Auto-created ${created} transaction${created !== 1 ? 's' : ''} from overdue bills`
        : 'No overdue bills to process',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Process due error:', err);
    res.status(500).json({ error: 'Failed to process overdue patterns' });
  } finally {
    client.release();
  }
});

// ── Helper functions ──────────────────────────────────────────────

function normalizeKey(description: string, merchantName: string | null, type: string): string {
  const text = (description || merchantName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${text}:${type}`;
}

function detectFrequency(avgDays: number): string | null {
  if (avgDays >= 5 && avgDays <= 10) return 'weekly';
  if (avgDays >= 11 && avgDays <= 18) return 'biweekly';
  if (avgDays >= 25 && avgDays <= 38) return 'monthly';
  if (avgDays >= 80 && avgDays <= 105) return 'quarterly';
  if (avgDays >= 340 && avgDays <= 395) return 'yearly';
  return null;
}

function getExpectedInterval(frequency: string): number {
  switch (frequency) {
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'monthly': return 30;
    case 'quarterly': return 91;
    case 'yearly': return 365;
    default: return 30;
  }
}

function calculateNextDate(lastDate: Date, frequency: string): Date {
  const next = new Date(lastDate);
  switch (frequency) {
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  // If next date is in the past, advance to future
  const now = new Date();
  while (next < now) {
    switch (frequency) {
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'biweekly': next.setDate(next.getDate() + 14); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'quarterly': next.setMonth(next.getMonth() + 3); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    }
  }
  return next;
}

export default router;
