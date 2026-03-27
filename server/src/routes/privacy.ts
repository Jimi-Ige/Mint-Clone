import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

const router = Router();

/**
 * GET /api/privacy/export — export all user data as JSON
 */
router.get('/export', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;

    const [
      user,
      accounts,
      categories,
      transactions,
      budgets,
      goals,
      tags,
      transactionTags,
      recurringPatterns,
      balanceSnapshots,
      filterPresets,
      transactionSplits,
      notifications,
    ] = await Promise.all([
      pool.query('SELECT id, email, name, base_currency, preferences, onboarding_completed, created_at FROM users WHERE id = $1', [userId]),
      pool.query('SELECT id, name, type, balance, currency, created_at FROM accounts WHERE user_id = $1', [userId]),
      pool.query('SELECT id, name, type, icon, color, parent_id FROM categories WHERE user_id = $1', [userId]),
      pool.query('SELECT id, account_id, category_id, amount, type, description, date, merchant_name, pending, is_transfer, created_at FROM transactions WHERE user_id = $1 ORDER BY date DESC', [userId]),
      pool.query('SELECT id, category_id, amount, month, year FROM budgets WHERE user_id = $1', [userId]),
      pool.query('SELECT id, name, target_amount, current_amount, deadline, icon, color, created_at FROM savings_goals WHERE user_id = $1', [userId]),
      pool.query('SELECT id, name, color, usage_count FROM tags WHERE user_id = $1', [userId]),
      pool.query('SELECT tt.tag_id, tt.transaction_id FROM transaction_tags tt JOIN transactions t ON tt.transaction_id = t.id WHERE t.user_id = $1', [userId]),
      pool.query('SELECT id, description, merchant_name, amount, frequency, next_expected, confidence, status FROM recurring_patterns WHERE user_id = $1', [userId]),
      pool.query('SELECT date, total_balance, total_assets, total_liabilities FROM balance_snapshots WHERE user_id = $1 ORDER BY date DESC', [userId]),
      pool.query('SELECT id, name, filters FROM filter_presets WHERE user_id = $1', [userId]),
      pool.query('SELECT ts.transaction_id, ts.category_id, ts.amount, ts.description FROM transaction_splits ts JOIN transactions t ON ts.transaction_id = t.id WHERE t.user_id = $1', [userId]),
      pool.query('SELECT type, subject, sent_at FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC', [userId]),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: user.rows[0],
      accounts: accounts.rows,
      categories: categories.rows,
      transactions: transactions.rows,
      budgets: budgets.rows,
      goals: goals.rows,
      tags: tags.rows,
      transaction_tags: transactionTags.rows,
      recurring_patterns: recurringPatterns.rows,
      balance_snapshots: balanceSnapshots.rows,
      filter_presets: filterPresets.rows,
      transaction_splits: transactionSplits.rows,
      notifications: notifications.rows,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mint-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(exportData);

    logger.info('Data export completed', { userId });
  } catch (err) {
    logger.error('Data export failed', { userId: req.userId, error: (err as Error).message });
    res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * DELETE /api/privacy/account — permanently delete user account and all data
 * Requires password confirmation in body: { password: string }
 */
router.delete('/account', async (req: AuthRequest, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password confirmation required' });

  const userId = req.userId;

  try {
    // Verify password
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const bcrypt = (await import('bcrypt')).default;
    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!valid) return res.status(403).json({ error: 'Incorrect password' });

    // Delete user — CASCADE handles all related data
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    logger.info('Account deleted', { userId });
    res.json({ success: true, message: 'Account and all data permanently deleted' });
  } catch (err) {
    logger.error('Account deletion failed', { userId, error: (err as Error).message });
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
