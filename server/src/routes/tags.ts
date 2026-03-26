import { Router, Response } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ── List all tags ─────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, COUNT(tt.transaction_id) AS usage_count
       FROM tags t
       LEFT JOIN transaction_tags tt ON t.id = tt.tag_id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY t.name ASC`,
      [req.userId]
    );
    res.json(rows.map((r: any) => ({ ...r, usage_count: parseInt(r.usage_count) })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// ── Create a tag ──────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Tag name is required' });

    const result = await pool.query(
      `INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING *`,
      [req.userId, name.toLowerCase().trim(), color || '#6b7280']
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Tag already exists' });
    }
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// ── Update a tag ──────────────────────────────────────────────────
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    const result = await pool.query(
      `UPDATE tags SET name = COALESCE($1, name), color = COALESCE($2, color)
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [name?.toLowerCase().trim(), color, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Tag name already exists' });
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// ── Delete a tag ──────────────────────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ── Get tags for a transaction ────────────────────────────────────
router.get('/transaction/:txId', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.* FROM tags t
       JOIN transaction_tags tt ON t.id = tt.tag_id
       JOIN transactions tx ON tt.transaction_id = tx.id
       WHERE tt.transaction_id = $1 AND tx.user_id = $2
       ORDER BY t.name`,
      [req.params.txId, req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction tags' });
  }
});

// ── Add a tag to a transaction ────────────────────────────────────
router.post('/transaction/:txId', async (req: AuthRequest, res: Response) => {
  try {
    const { tag_id } = req.body;
    if (!tag_id) return res.status(400).json({ error: 'tag_id is required' });

    // Verify transaction and tag belong to user
    const tx = await pool.query('SELECT id FROM transactions WHERE id = $1 AND user_id = $2', [req.params.txId, req.userId]);
    if (tx.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

    const tag = await pool.query('SELECT id FROM tags WHERE id = $1 AND user_id = $2', [tag_id, req.userId]);
    if (tag.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });

    await pool.query(
      'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.txId, tag_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// ── Remove a tag from a transaction ───────────────────────────────
router.delete('/transaction/:txId/:tagId', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      `DELETE FROM transaction_tags
       WHERE transaction_id = $1 AND tag_id = $2
       AND EXISTS (SELECT 1 FROM transactions WHERE id = $1 AND user_id = $3)`,
      [req.params.txId, req.params.tagId, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// ── Bulk tag: add a tag to multiple transactions ──────────────────
router.post('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { tag_id, transaction_ids } = req.body;
    if (!tag_id || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ error: 'tag_id and transaction_ids[] are required' });
    }

    // Verify tag belongs to user
    const tag = await pool.query('SELECT id FROM tags WHERE id = $1 AND user_id = $2', [tag_id, req.userId]);
    if (tag.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });

    let added = 0;
    for (const txId of transaction_ids) {
      const tx = await pool.query('SELECT id FROM transactions WHERE id = $1 AND user_id = $2', [txId, req.userId]);
      if (tx.rows.length === 0) continue;
      const result = await pool.query(
        'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [txId, tag_id]
      );
      if (result.rowCount && result.rowCount > 0) added++;
    }
    res.json({ added, total: transaction_ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk tag' });
  }
});

export default router;
