import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/categories — flat list with parent info
router.get('/', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, p.name as parent_name
     FROM categories c
     LEFT JOIN categories p ON c.parent_id = p.id
     WHERE c.user_id = $1
     ORDER BY c.type, COALESCE(p.name, c.name), c.parent_id NULLS FIRST, c.name`,
    [req.userId]
  );
  res.json(rows);
});

// GET /api/categories/tree — nested tree structure
router.get('/tree', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM categories WHERE user_id = $1 ORDER BY type, name',
    [req.userId]
  );

  // Build tree: parents first, then attach children
  const parents = rows.filter((c: any) => !c.parent_id);
  const children = rows.filter((c: any) => c.parent_id);

  const tree = parents.map((p: any) => ({
    ...p,
    subcategories: children.filter((c: any) => c.parent_id === p.id),
  }));

  res.json(tree);
});

// POST /api/categories
router.post('/', async (req: AuthRequest, res) => {
  const { name, type, icon = 'circle', color = '#6b7280', parent_id } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Type must be income or expense' });

  // Validate parent if provided
  if (parent_id) {
    const parent = await pool.query('SELECT id, type FROM categories WHERE id = $1 AND user_id = $2 AND parent_id IS NULL', [parent_id, req.userId]);
    if (parent.rows.length === 0) return res.status(400).json({ error: 'Parent category not found or is itself a subcategory' });
    if (parent.rows[0].type !== type) return res.status(400).json({ error: 'Subcategory type must match parent type' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (user_id, parent_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.userId, parent_id || null, name, type, icon, color]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.constraint) return res.status(409).json({ error: 'Category already exists' });
    throw err;
  }
});

// PUT /api/categories/:id
router.put('/:id', async (req: AuthRequest, res) => {
  const { name, type, icon, color, parent_id } = req.body;
  const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Category not found' });

  // Prevent circular: can't set parent to self
  if (parent_id !== undefined && parent_id === Number(req.params.id)) {
    return res.status(400).json({ error: 'Category cannot be its own parent' });
  }

  // Validate parent if provided
  if (parent_id) {
    const parent = await pool.query('SELECT id, type FROM categories WHERE id = $1 AND user_id = $2 AND parent_id IS NULL', [parent_id, req.userId]);
    if (parent.rows.length === 0) return res.status(400).json({ error: 'Parent category not found or is itself a subcategory' });
    // Don't allow a parent category to become a subcategory if it has children
    const children = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = $1', [req.params.id]);
    if (parseInt(children.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot make a parent category into a subcategory while it has children' });
  }

  const result = await pool.query(
    `UPDATE categories SET
      name = COALESCE($1, name), type = COALESCE($2, type),
      icon = COALESCE($3, icon), color = COALESCE($4, color),
      parent_id = $5
    WHERE id = $6 AND user_id = $7 RETURNING *`,
    [name, type, icon, color, parent_id !== undefined ? (parent_id || null) : rows[0].parent_id, req.params.id, req.userId]
  );
  res.json(result.rows[0]);
});

// DELETE /api/categories/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  // When deleting a parent, promote children to top-level
  await pool.query(
    'UPDATE categories SET parent_id = NULL WHERE parent_id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );

  const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

// GET /api/categories/:id/subcategories — get IDs of category + all its subcategories
router.get('/:id/subcategories', async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    'SELECT id FROM categories WHERE (id = $1 OR parent_id = $1) AND user_id = $2',
    [req.params.id, req.userId]
  );
  res.json(rows.map((r: any) => r.id));
});

export default router;
