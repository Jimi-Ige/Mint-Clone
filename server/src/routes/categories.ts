import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM categories WHERE user_id = $1 ORDER BY type, name', [req.userId]);
  res.json(rows);
});

router.post('/', async (req: AuthRequest, res) => {
  const { name, type, icon = 'circle', color = '#6b7280' } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Type must be income or expense' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (user_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, name, type, icon, color]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.constraint) return res.status(409).json({ error: 'Category already exists' });
    throw err;
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  const { name, type, icon, color } = req.body;
  const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Category not found' });

  const result = await pool.query(
    'UPDATE categories SET name = COALESCE($1, name), type = COALESCE($2, type), icon = COALESCE($3, icon), color = COALESCE($4, color) WHERE id = $5 AND user_id = $6 RETURNING *',
    [name, type, icon, color, req.params.id, req.userId]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

export default router;
