import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAccountSchema, updateAccountSchema } from '../schemas';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
  res.json(rows);
});

router.post('/', validate(createAccountSchema), async (req: AuthRequest, res) => {
  const { name, type, balance, currency } = req.body;

  const { rows } = await pool.query(
    'INSERT INTO accounts (user_id, name, type, balance, currency) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [req.userId, name, type, balance, currency]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', validate(updateAccountSchema), async (req: AuthRequest, res) => {
  const { name, type, currency } = req.body;
  const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });

  const result = await pool.query(
    'UPDATE accounts SET name = COALESCE($1, name), type = COALESCE($2, type), currency = COALESCE($3, currency) WHERE id = $4 AND user_id = $5 RETURNING *',
    [name, type, currency, req.params.id, req.userId]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { rowCount } = await pool.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Account not found' });
  res.json({ success: true });
});

export default router;
