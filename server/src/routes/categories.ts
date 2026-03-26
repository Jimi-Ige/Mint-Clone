import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY type, name').all();
  res.json(categories);
});

router.post('/', (req, res) => {
  const { name, type, icon = 'circle', color = '#6b7280' } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  if (!['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Type must be income or expense' });

  const result = db.prepare('INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)').run(name, type, icon, color);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, type, icon, color } = req.body;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  db.prepare('UPDATE categories SET name = COALESCE(?, name), type = COALESCE(?, type), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ?')
    .run(name, type, icon, color, req.params.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

export default router;
