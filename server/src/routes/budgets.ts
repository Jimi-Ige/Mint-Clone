import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (req, res) => {
  const { month, year } = req.query;
  const m = month || new Date().getMonth() + 1;
  const y = year || new Date().getFullYear();

  const budgets = db.prepare(`
    SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id = b.category_id AND t.type = 'expense'
        AND CAST(strftime('%m', t.date) AS INTEGER) = b.month
        AND CAST(strftime('%Y', t.date) AS INTEGER) = b.year
      ), 0) as spent
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.month = ? AND b.year = ?
    ORDER BY c.name
  `).all(m, y);

  res.json(budgets);
});

router.post('/', (req, res) => {
  const { category_id, amount, month, year } = req.body;
  if (!category_id || !amount || !month || !year) {
    return res.status(400).json({ error: 'category_id, amount, month, and year are required' });
  }

  try {
    const result = db.prepare('INSERT INTO budgets (category_id, amount, month, year) VALUES (?, ?, ?, ?)').run(category_id, amount, month, year);
    const budget = db.prepare(`
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(budget);
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Budget already exists for this category and period' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const { amount } = req.body;
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  if (!budget) return res.status(404).json({ error: 'Budget not found' });

  db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(amount, req.params.id);
  res.json(db.prepare(`
    SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM budgets b LEFT JOIN categories c ON b.category_id = c.id WHERE b.id = ?
  `).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Budget not found' });
  res.json({ success: true });
});

export default router;
