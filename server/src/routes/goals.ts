import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const goals = db.prepare('SELECT * FROM savings_goals ORDER BY status, created_at DESC').all();
  res.json(goals);
});

router.post('/', (req, res) => {
  const { name, target_amount, deadline, icon = 'target', color = '#10b981' } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: 'Name and target_amount are required' });

  const result = db.prepare(
    'INSERT INTO savings_goals (name, target_amount, deadline, icon, color) VALUES (?, ?, ?, ?, ?)'
  ).run(name, target_amount, deadline || null, icon, color);

  res.status(201).json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const { name, target_amount, deadline, icon, color, status } = req.body;
  db.prepare(`
    UPDATE savings_goals SET
      name = COALESCE(?, name), target_amount = COALESCE(?, target_amount),
      deadline = COALESCE(?, deadline), icon = COALESCE(?, icon),
      color = COALESCE(?, color), status = COALESCE(?, status)
    WHERE id = ?
  `).run(name, target_amount, deadline, icon, color, status, req.params.id);

  res.json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id));
});

router.patch('/:id/contribute', (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Positive amount is required' });

  const goal = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id) as any;
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const newAmount = goal.current_amount + amount;
  const newStatus = newAmount >= goal.target_amount ? 'completed' : 'active';

  db.prepare('UPDATE savings_goals SET current_amount = ?, status = ? WHERE id = ?')
    .run(newAmount, newStatus, req.params.id);

  res.json(db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM savings_goals WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Goal not found' });
  res.json({ success: true });
});

export default router;
