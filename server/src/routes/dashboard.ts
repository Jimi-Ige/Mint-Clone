import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { startDate, endDate, accountIds, categoryIds } = req.query;

  // Default to current month if no date range provided
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const start = (startDate as string) || defaultStart;
  const end = (endDate as string) || defaultEnd;

  // Build optional filters
  let accountFilter = '';
  let categoryFilter = '';
  const baseParams: any[] = [req.userId, start, end];
  let paramIdx = 4;

  if (accountIds) {
    const ids = (accountIds as string).split(',').map(Number).filter(n => !isNaN(n));
    if (ids.length > 0) {
      accountFilter = ` AND t.account_id = ANY($${paramIdx++})`;
      baseParams.push(ids);
    }
  }
  if (categoryIds) {
    const ids = (categoryIds as string).split(',').map(Number).filter(n => !isNaN(n));
    if (ids.length > 0) {
      categoryFilter = ` AND t.category_id = ANY($${paramIdx++})`;
      baseParams.push(ids);
    }
  }

  const dateFilter = `t.date >= $2 AND t.date <= $3`;
  const fullFilter = `t.user_id = $1 AND ${dateFilter}${accountFilter}${categoryFilter}`;

  // Total balance (unfiltered — always shows full net worth)
  const balanceResult = await pool.query(
    'SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = $1', [req.userId]
  );

  // Period income (excluding transfers)
  const incomeResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions t WHERE ${fullFilter} AND t.type = 'income' AND t.is_transfer = FALSE`,
    baseParams
  );

  // Period expenses (excluding transfers)
  const expenseResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions t WHERE ${fullFilter} AND t.type = 'expense' AND t.is_transfer = FALSE`,
    baseParams
  );

  // Spending by category (filtered, excluding transfers) — roll up subcategories into parents
  const { rows: spendingByCategory } = await pool.query(`
    SELECT
      COALESCE(p.name, c.name) as name,
      COALESCE(p.color, c.color) as color,
      COALESCE(p.icon, c.icon) as icon,
      COALESCE(SUM(t.amount), 0) as amount
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories p ON c.parent_id = p.id
    WHERE ${fullFilter} AND t.type = 'expense' AND t.is_transfer = FALSE
    GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name), COALESCE(p.color, c.color), COALESCE(p.icon, c.icon)
    ORDER BY amount DESC
  `, baseParams);

  // Top merchants (filtered, excluding transfers)
  const { rows: topMerchants } = await pool.query(`
    SELECT COALESCE(t.merchant_name, t.description) as name, SUM(t.amount) as amount, COUNT(*) as count
    FROM transactions t
    WHERE ${fullFilter} AND t.type = 'expense' AND t.is_transfer = FALSE AND (t.merchant_name IS NOT NULL OR t.description != '')
    GROUP BY COALESCE(t.merchant_name, t.description)
    ORDER BY amount DESC
    LIMIT 5
  `, baseParams);

  // Monthly trend (last 6 months from end date, ignoring account/category filters for broader context)
  const endD = new Date(end);
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(endD.getFullYear(), endD.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    const income = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions
      WHERE user_id = $1 AND type = 'income' AND is_transfer = FALSE AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
    `, [req.userId, m, y]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions
      WHERE user_id = $1 AND type = 'expense' AND is_transfer = FALSE AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
    `, [req.userId, m, y]);

    monthlyTrend.push({
      month: label,
      income: parseFloat(income.rows[0].total),
      expenses: parseFloat(expenses.rows[0].total),
      net: parseFloat(income.rows[0].total) - parseFloat(expenses.rows[0].total),
    });
  }

  // Recent transactions (filtered)
  const { rows: recentTransactions } = await pool.query(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${fullFilter}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT 8
  `, baseParams);

  // Active savings goals (unfiltered)
  const { rows: goals } = await pool.query(
    "SELECT * FROM savings_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 3",
    [req.userId]
  );

  const monthIncome = parseFloat(incomeResult.rows[0].total);
  const monthExpenses = parseFloat(expenseResult.rows[0].total);
  const netFlow = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpenses) / monthIncome) * 100) : 0;

  res.json({
    totalBalance: parseFloat(balanceResult.rows[0].total),
    monthIncome,
    monthExpenses,
    netFlow,
    savingsRate,
    spendingByCategory: spendingByCategory.map(r => ({ ...r, amount: parseFloat(r.amount) })),
    topMerchants: topMerchants.map(r => ({ name: r.name, amount: parseFloat(r.amount), count: parseInt(r.count) })),
    monthlyTrend,
    recentTransactions,
    goals,
    filters: { startDate: start, endDate: end },
  });
});

export default router;
