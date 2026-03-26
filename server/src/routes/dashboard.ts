import { Router } from 'express';
import db from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  // Total balance across all accounts
  const balanceResult = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM accounts').get() as any;

  // This month's income
  const incomeResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE type = 'income' AND strftime('%Y-%m', date) = ?
  `).get(monthStr) as any;

  // This month's expenses
  const expenseResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE type = 'expense' AND strftime('%Y-%m', date) = ?
  `).get(monthStr) as any;

  // Spending by category (current month)
  const spendingByCategory = db.prepare(`
    SELECT c.name, c.color, c.icon, COALESCE(SUM(t.amount), 0) as amount
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'expense' AND strftime('%Y-%m', t.date) = ?
    GROUP BY c.id
    ORDER BY amount DESC
  `).all(monthStr);

  // Monthly trend (last 6 months)
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    const income = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND strftime('%Y-%m', date) = ?
    `).get(ms) as any;

    const expenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND strftime('%Y-%m', date) = ?
    `).get(ms) as any;

    monthlyTrend.push({ month: label, income: income.total, expenses: expenses.total });
  }

  // Recent transactions
  const recentTransactions = db.prepare(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT 8
  `).all();

  // Savings goals summary
  const goals = db.prepare("SELECT * FROM savings_goals WHERE status = 'active' ORDER BY created_at DESC LIMIT 3").all();

  const monthIncome = incomeResult.total;
  const monthExpenses = expenseResult.total;
  const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpenses) / monthIncome) * 100) : 0;

  res.json({
    totalBalance: balanceResult.total,
    monthIncome,
    monthExpenses,
    savingsRate,
    spendingByCategory,
    monthlyTrend,
    recentTransactions,
    goals,
  });
});

export default router;
