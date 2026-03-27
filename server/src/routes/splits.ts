import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { splitSchema } from '../schemas';

const router = Router();

/**
 * GET /api/splits/:transactionId
 * Get all splits for a transaction
 */
router.get('/:transactionId', async (req: AuthRequest, res) => {
  // Verify transaction belongs to user
  const tx = await pool.query(
    'SELECT id, amount FROM transactions WHERE id = $1 AND user_id = $2',
    [req.params.transactionId, req.userId]
  );
  if (tx.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

  const { rows } = await pool.query(`
    SELECT s.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM transaction_splits s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.transaction_id = $1
    ORDER BY s.amount DESC
  `, [req.params.transactionId]);

  res.json({
    transactionId: Number(req.params.transactionId),
    transactionAmount: parseFloat(tx.rows[0].amount),
    splits: rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
    })),
  });
});

/**
 * PUT /api/splits/:transactionId
 * Replace all splits for a transaction (atomic operation)
 * Body: { splits: [{ category_id, amount, description? }] }
 *
 * Rules:
 * - Sum of splits must equal transaction amount
 * - Minimum 2 splits
 * - Each split amount must be > 0
 * - To unsplit, send empty splits array
 */
router.put('/:transactionId', validate(splitSchema), async (req: AuthRequest, res) => {
  const { splits } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify transaction belongs to user
    const tx = await client.query(
      'SELECT id, amount, type FROM transactions WHERE id = $1 AND user_id = $2',
      [req.params.transactionId, req.userId]
    );
    if (tx.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transactionAmount = parseFloat(tx.rows[0].amount);

    // Unsplit: remove all splits
    if (splits.length === 0) {
      await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [req.params.transactionId]);
      await client.query('COMMIT');
      return res.json({ transactionId: Number(req.params.transactionId), splits: [] });
    }

    // Validate: minimum 2 splits
    if (splits.length < 2) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Must have at least 2 splits (or 0 to unsplit)' });
    }

    // Validate: all amounts > 0
    for (const split of splits) {
      if (!split.amount || parseFloat(split.amount) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'All split amounts must be greater than 0' });
      }
    }

    // Validate: sum matches transaction amount (allow tiny float tolerance)
    const splitSum = splits.reduce((sum: number, s: any) => sum + parseFloat(s.amount), 0);
    if (Math.abs(splitSum - transactionAmount) > 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Split sum (${splitSum.toFixed(2)}) must equal transaction amount (${transactionAmount.toFixed(2)})`,
      });
    }

    // Validate: categories belong to user (if provided)
    for (const split of splits) {
      if (split.category_id) {
        const cat = await client.query(
          'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
          [split.category_id, req.userId]
        );
        if (cat.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Category ${split.category_id} not found` });
        }
      }
    }

    // Delete existing splits and insert new ones
    await client.query('DELETE FROM transaction_splits WHERE transaction_id = $1', [req.params.transactionId]);

    const insertedSplits = [];
    for (const split of splits) {
      const result = await client.query(
        `INSERT INTO transaction_splits (transaction_id, category_id, amount, description)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.transactionId, split.category_id || null, split.amount, split.description || '']
      );
      insertedSplits.push(result.rows[0]);
    }

    await client.query('COMMIT');

    // Fetch with category details
    const { rows } = await pool.query(`
      SELECT s.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM transaction_splits s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.transaction_id = $1
      ORDER BY s.amount DESC
    `, [req.params.transactionId]);

    res.json({
      transactionId: Number(req.params.transactionId),
      splits: rows.map(r => ({ ...r, amount: parseFloat(r.amount) })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
