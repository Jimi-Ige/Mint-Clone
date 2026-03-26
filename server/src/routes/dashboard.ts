import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Total balance
  const balanceResult = await pool.query(
    'SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE user_id = $1', [req.userId]
  );

  // This month's income
  const incomeResult = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = $1 AND type = 'income' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
  `, [req.userId, currentMonth, currentYear]);

  // This month's expenses
  const expenseResult = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE user_id = $1 AND type = 'expense' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
  `, [req.userId, currentMonth, currentYear]);

  // Spending by category
  const { rows: spendingByCategory } = await pool.query(`
    SELECT c.name, c.color, c.icon, COALESCE(SUM(t.amount), 0) as amount
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = $1 AND t.type = 'expense' AND EXTRACT(MONTH FROM t.date) = $2 AND EXTRACT(YEAR FROM t.date) = $3
    GROUP BY c.id, c.name, c.color, c.icon
    ORDER BY amount DESC
  `, [req.userId, currentMonth, currentYear]);

  // Monthly trend (last 6 months)
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    const income = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions
      WHERE user_id = $1 AND type = 'income' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
    `, [req.userId, m, y]);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions
      WHERE user_id = $1 AND type = 'expense' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
    `, [req.userId, m, y]);

    monthlyTrend.push({
      month: label,
      income: parseFloat(income.rows[0].total),
      expenses: parseFloat(expenses.rows[0].total),
    });
  }

  // Recent transactions
  const { rows: recentTransactions } = await pool.query(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = $1
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT 8
  `, [req.userId]);

  // Active savings goals
  const { rows: goals } = await pool.query(
    "SELECT * FROM savings_goals WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 3",
    [req.userId]
  );

  const monthIncome = parseFloat(incomeResult.rows[0].total);
  const monthExpenses = parseFloat(expenseResult.rows[0].total);
  const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpenses) / monthIncome) * 100) : 0;

  res.json({
    totalBalance: parseFloat(balanceResult.rows[0].total),
    monthIncome,
    monthExpenses,
    savingsRate,
    spendingByCategory: spendingByCategory.map(r => ({ ...r, amount: parseFloat(r.amount) })),
    monthlyTrend,
    recentTransactions,
    goals,
  });
});

export default router;
