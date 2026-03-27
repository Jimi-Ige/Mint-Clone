import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/notifications — list recent notifications for the user
router.get('/', async (req: AuthRequest, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const { rows } = await pool.query(
      `SELECT id, type, reference_id, subject, sent_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY sent_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    const { rows: countResult } = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      notifications: rows,
      total: parseInt(countResult[0].count),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

export default router;
