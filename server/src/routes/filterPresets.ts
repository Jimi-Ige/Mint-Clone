import { Router, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/filter-presets — list all presets
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM filter_presets WHERE user_id = $1 ORDER BY name ASC',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch filter presets' });
  }
});

// POST /api/filter-presets — create a preset
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, filters } = req.body;
    if (!name) return res.status(400).json({ error: 'Preset name is required' });

    const { rows } = await pool.query(
      'INSERT INTO filter_presets (user_id, name, filters) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, name.trim(), JSON.stringify(filters || {})]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Preset name already exists' });
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

// PUT /api/filter-presets/:id — update a preset
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, filters } = req.body;
    const result = await pool.query(
      `UPDATE filter_presets SET name = COALESCE($1, name), filters = COALESCE($2, filters)
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [name?.trim(), filters ? JSON.stringify(filters) : null, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Preset not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Preset name already exists' });
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

// DELETE /api/filter-presets/:id — delete a preset
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM filter_presets WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Preset not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

export default router;
