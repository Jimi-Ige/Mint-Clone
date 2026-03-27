import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createBudgetSchema, updateBudgetSchema } from '../schemas';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { month, year } = req.query;
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();

  // Split-aware: count split allocations when a transaction is split
  const { rows } = await pool.query(`
    SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
      c.parent_id,
      COALESCE((
        -- Non-split transactions
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id IN (SELECT id FROM categories WHERE id = b.category_id OR parent_id = b.category_id)
        AND t.type = 'expense'
        AND EXTRACT(MONTH FROM t.date) = b.month
        AND EXTRACT(YEAR FROM t.date) = b.year
        AND NOT EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id)
      ), 0) + COALESCE((
        -- Split allocations matching this budget's category
        SELECT SUM(s.amount) FROM transaction_splits s
        JOIN transactions t ON s.transaction_id = t.id
        WHERE s.category_id IN (SELECT id FROM categories WHERE id = b.category_id OR parent_id = b.category_id)
        AND t.type = 'expense'
        AND EXTRACT(MONTH FROM t.date) = b.month
        AND EXTRACT(YEAR FROM t.date) = b.year
        AND t.user_id = $1
      ), 0) as spent
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
    ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.name
  `, [req.userId, m, y]);

  res.json(rows);
});

router.post('/', validate(createBudgetSchema), async (req: AuthRequest, res) => {
  const { category_id, amount, month, year } = req.body;

  try {
    const { rows } = await pool.query(
      'INSERT INTO budgets (user_id, category_id, amount, month, year) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, category_id, amount, month, year]
    );

    const result = await pool.query(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.id = $1
    `, [rows[0].id]);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.constraint) return res.status(409).json({ error: 'Budget already exists for this category and period' });
    throw err;
  }
});

router.put('/:id', validate(updateBudgetSchema), async (req: AuthRequest, res) => {
  const { amount } = req.body;
  const { rows } = await pool.query('SELECT * FROM budgets WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Budget not found' });

  const result = await pool.query(`
    UPDATE budgets SET amount = $1 WHERE id = $2 AND user_id = $3 RETURNING *
  `, [amount, req.params.id, req.userId]);

  const full = await pool.query(`
    SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.id = $1
  `, [result.rows[0].id]);
  res.json(full.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query('DELETE FROM budgets WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Budget not found' });
  res.json({ success: true });
});

export default router;
