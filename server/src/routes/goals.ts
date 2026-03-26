import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM savings_goals WHERE user_id = $1 ORDER BY status, created_at DESC', [req.userId]);
  res.json(rows);
});

router.post('/', async (req: AuthRequest, res) => {
  const { name, target_amount, deadline, icon = 'target', color = '#10b981' } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: 'Name and target_amount are required' });

  const { rows } = await pool.query(
    'INSERT INTO savings_goals (user_id, name, target_amount, deadline, icon, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [req.userId, name, target_amount, deadline || null, icon, color]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Goal not found' });

  const { name, target_amount, deadline, icon, color, status } = req.body;
  const result = await pool.query(`
    UPDATE savings_goals SET
      name = COALESCE($1, name), target_amount = COALESCE($2, target_amount),
      deadline = COALESCE($3, deadline), icon = COALESCE($4, icon),
      color = COALESCE($5, color), status = COALESCE($6, status)
    WHERE id = $7 AND user_id = $8 RETURNING *
  `, [name, target_amount, deadline, icon, color, status, req.params.id, req.userId]);
  res.json(result.rows[0]);
});

router.patch('/:id/contribute', async (req: AuthRequest, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Positive amount is required' });

  const { rows } = await pool.query('SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Goal not found' });

  const goal = rows[0];
  const newAmount = Number(goal.current_amount) + amount;
  const newStatus = newAmount >= Number(goal.target_amount) ? 'completed' : 'active';

  const result = await pool.query(
    'UPDATE savings_goals SET current_amount = $1, status = $2 WHERE id = $3 RETURNING *',
    [newAmount, newStatus, req.params.id]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query('DELETE FROM savings_goals WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' });
  res.json({ success: true });
});

export default router;
