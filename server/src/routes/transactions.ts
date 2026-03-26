import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (req, res) => {
  const { startDate, endDate, categoryId, type, search, page = '1', limit = '20' } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) { where += ' AND t.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND t.date <= ?'; params.push(endDate); }
  if (categoryId) { where += ' AND t.category_id = ?'; params.push(categoryId); }
  if (type) { where += ' AND t.type = ?'; params.push(type); }
  if (search) { where += ' AND t.description LIKE ?'; params.push(`%${search}%`); }

  const offset = (Number(page) - 1) * Number(limit);
  const countResult = db.prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`).get(...params) as any;

  const transactions = db.prepare(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    ${where}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ transactions, total: countResult.total, page: Number(page), limit: Number(limit) });
});

router.post('/', (req, res) => {
  const { account_id, category_id, amount, type, description = '', date } = req.body;
  if (!account_id || !amount || !type || !date) {
    return res.status(400).json({ error: 'account_id, amount, type, and date are required' });
  }

  const updateBalance = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO transactions (account_id, category_id, amount, type, description, date) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(account_id, category_id || null, amount, type, description, date);

    const balanceChange = type === 'income' ? amount : -amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(balanceChange, account_id);

    return result;
  });

  const result = updateBalance();
  const transaction = db.prepare(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(transaction);
});

router.put('/:id', (req, res) => {
  const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as any;
  if (!old) return res.status(404).json({ error: 'Transaction not found' });

  const { account_id, category_id, amount, type, description, date } = req.body;

  const updateTx = db.transaction(() => {
    // Reverse old balance effect
    const oldEffect = old.type === 'income' ? old.amount : -old.amount;
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(oldEffect, old.account_id);

    db.prepare(`
      UPDATE transactions SET
        account_id = COALESCE(?, account_id),
        category_id = COALESCE(?, category_id),
        amount = COALESCE(?, amount),
        type = COALESCE(?, type),
        description = COALESCE(?, description),
        date = COALESCE(?, date)
      WHERE id = ?
    `).run(account_id, category_id, amount, type, description, date, req.params.id);

    // Apply new balance effect
    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as any;
    const newEffect = updated.type === 'income' ? updated.amount : -updated.amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(newEffect, updated.account_id);
  });

  updateTx();

  const transaction = db.prepare(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(req.params.id);
  res.json(transaction);
});

router.delete('/:id', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id) as any;
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });

  const deleteTx = db.transaction(() => {
    const effect = tx.type === 'income' ? tx.amount : -tx.amount;
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(effect, tx.account_id);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  });

  deleteTx();
  res.json({ success: true });
});

export default router;
