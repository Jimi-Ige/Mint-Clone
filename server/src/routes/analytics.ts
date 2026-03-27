import { Router } from 'express';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /spending-trends
 * Monthly spending by top categories over last N months
 * Query: ?months=12
 */
router.get('/spending-trends', async (req: AuthRequest, res) => {
  const months = Math.min(parseInt(req.query.months as string) || 12, 24);

  // Get monthly totals per top-level category (subcategories rolled up)
  const { rows } = await pool.query(`
    WITH monthly AS (
      SELECT
        TO_CHAR(t.date, 'YYYY-MM') as month,
        COALESCE(p.id, c.id) as cat_id,
        COALESCE(p.name, c.name) as category_name,
        COALESCE(p.color, c.color) as category_color,
        SUM(t.amount) as amount
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE t.user_id = $1
        AND t.type = 'expense'
        AND t.is_transfer = FALSE
        AND t.date >= (CURRENT_DATE - ($2 || ' months')::INTERVAL)
      GROUP BY TO_CHAR(t.date, 'YYYY-MM'), COALESCE(p.id, c.id), COALESCE(p.name, c.name), COALESCE(p.color, c.color)
    ),
    top_cats AS (
      SELECT cat_id, category_name, category_color, SUM(amount) as total
      FROM monthly
      GROUP BY cat_id, category_name, category_color
      ORDER BY total DESC
      LIMIT 8
    )
    SELECT m.month, m.category_name, m.category_color, m.amount
    FROM monthly m
    JOIN top_cats tc ON m.cat_id = tc.cat_id
    ORDER BY m.month ASC, m.amount DESC
  `, [req.userId, months]);

  // Pivot into { month, categories: [...] } structure
  const monthMap = new Map<string, { month: string; categories: { name: string; color: string; amount: number }[] }>();
  for (const row of rows) {
    if (!monthMap.has(row.month)) {
      monthMap.set(row.month, { month: row.month, categories: [] });
    }
    monthMap.get(row.month)!.categories.push({
      name: row.category_name,
      color: row.category_color,
      amount: parseFloat(row.amount),
    });
  }

  res.json(Array.from(monthMap.values()));
});

/**
 * GET /period-comparison
 * Compare spending between two periods
 * Query: ?currentStart=&currentEnd=&previousStart=&previousEnd=
 * Defaults to current month vs previous month
 */
router.get('/period-comparison', async (req: AuthRequest, res) => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  const cs = (req.query.currentStart as string) || currentMonthStart;
  const ce = (req.query.currentEnd as string) || currentMonthEnd;
  const ps = (req.query.previousStart as string) || prevMonthStart;
  const pe = (req.query.previousEnd as string) || prevMonthEnd;

  // Category-level comparison
  const { rows: categoryComparison } = await pool.query(`
    SELECT
      COALESCE(p.name, c.name) as category_name,
      COALESCE(p.color, c.color) as category_color,
      COALESCE(p.icon, c.icon) as category_icon,
      COALESCE(SUM(CASE WHEN t.date >= $2 AND t.date <= $3 THEN t.amount END), 0) as current_amount,
      COALESCE(SUM(CASE WHEN t.date >= $4 AND t.date <= $5 THEN t.amount END), 0) as previous_amount
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories p ON c.parent_id = p.id
    WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.is_transfer = FALSE
      AND ((t.date >= $2 AND t.date <= $3) OR (t.date >= $4 AND t.date <= $5))
    GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name), COALESCE(p.color, c.color), COALESCE(p.icon, c.icon)
    ORDER BY current_amount DESC
  `, [req.userId, cs, ce, ps, pe]);

  // Totals
  const { rows: totals } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 AND type = 'expense' THEN amount END), 0) as current_expenses,
      COALESCE(SUM(CASE WHEN date >= $4 AND date <= $5 AND type = 'expense' THEN amount END), 0) as previous_expenses,
      COALESCE(SUM(CASE WHEN date >= $2 AND date <= $3 AND type = 'income' THEN amount END), 0) as current_income,
      COALESCE(SUM(CASE WHEN date >= $4 AND date <= $5 AND type = 'income' THEN amount END), 0) as previous_income
    FROM transactions
    WHERE user_id = $1 AND is_transfer = FALSE
      AND ((date >= $2 AND date <= $3) OR (date >= $4 AND date <= $5))
  `, [req.userId, cs, ce, ps, pe]);

  const t = totals[0];

  res.json({
    currentPeriod: { start: cs, end: ce },
    previousPeriod: { start: ps, end: pe },
    totals: {
      currentExpenses: parseFloat(t.current_expenses),
      previousExpenses: parseFloat(t.previous_expenses),
      currentIncome: parseFloat(t.current_income),
      previousIncome: parseFloat(t.previous_income),
    },
    categories: categoryComparison.map(r => ({
      name: r.category_name,
      color: r.category_color,
      icon: r.category_icon,
      currentAmount: parseFloat(r.current_amount),
      previousAmount: parseFloat(r.previous_amount),
      change: parseFloat(r.previous_amount) > 0
        ? ((parseFloat(r.current_amount) - parseFloat(r.previous_amount)) / parseFloat(r.previous_amount)) * 100
        : parseFloat(r.current_amount) > 0 ? 100 : 0,
    })),
  });
});

/**
 * GET /anomalies
 * Transactions significantly above the category average (> 2x mean)
 * Query: ?months=3&threshold=2
 */
router.get('/anomalies', async (req: AuthRequest, res) => {
  const months = Math.min(parseInt(req.query.months as string) || 3, 12);
  const threshold = Math.max(parseFloat(req.query.threshold as string) || 2, 1.5);

  const { rows } = await pool.query(`
    WITH category_stats AS (
      SELECT
        category_id,
        AVG(amount) as avg_amount,
        STDDEV(amount) as std_amount,
        COUNT(*) as tx_count
      FROM transactions
      WHERE user_id = $1
        AND type = 'expense'
        AND is_transfer = FALSE
        AND date >= (CURRENT_DATE - ($2 || ' months')::INTERVAL)
      GROUP BY category_id
      HAVING COUNT(*) >= 3
    )
    SELECT
      t.id, t.description, t.merchant_name, t.amount, t.date, t.type,
      c.name as category_name, c.color as category_color, c.icon as category_icon,
      cs.avg_amount, cs.std_amount,
      a.name as account_name,
      ROUND((t.amount / cs.avg_amount)::NUMERIC, 1) as multiple
    FROM transactions t
    JOIN category_stats cs ON t.category_id = cs.category_id
    JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.is_transfer = FALSE
      AND t.date >= (CURRENT_DATE - ($2 || ' months')::INTERVAL)
      AND t.amount > cs.avg_amount * $3
    ORDER BY t.amount DESC
    LIMIT 20
  `, [req.userId, months, threshold]);

  res.json(rows.map(r => ({
    id: r.id,
    description: r.description,
    merchantName: r.merchant_name,
    amount: parseFloat(r.amount),
    date: r.date,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    categoryIcon: r.category_icon,
    accountName: r.account_name,
    avgAmount: parseFloat(r.avg_amount),
    multiple: parseFloat(r.multiple),
  })));
});

/**
 * GET /daily-spending
 * Daily spending totals for a given month
 * Query: ?month=2026-03
 */
router.get('/daily-spending', async (req: AuthRequest, res) => {
  const now = new Date();
  const monthParam = (req.query.month as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, month] = monthParam.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { rows } = await pool.query(`
    SELECT
      t.date::TEXT as date,
      SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) as expenses,
      SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) as income,
      COUNT(*) as transaction_count
    FROM transactions t
    WHERE t.user_id = $1
      AND t.is_transfer = FALSE
      AND t.date >= $2 AND t.date <= $3
    GROUP BY t.date
    ORDER BY t.date ASC
  `, [req.userId, startDate, endDate]);

  // Fill in missing days with zeros
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyData: {
    date: string; day: number; dayOfWeek: string;
    expenses: number; income: number; transactionCount: number;
    runningTotal?: number; dailyAverage?: number;
  }[] = [];
  const dataMap = new Map(rows.map(r => [r.date, r]));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const row = dataMap.get(dateStr);
    dailyData.push({
      date: dateStr,
      day: d,
      dayOfWeek: new Date(year, month - 1, d).toLocaleDateString('en-US', { weekday: 'short' }),
      expenses: row ? parseFloat(row.expenses) : 0,
      income: row ? parseFloat(row.income) : 0,
      transactionCount: row ? parseInt(row.transaction_count) : 0,
    });
  }

  // Calculate running total and average
  let runningTotal = 0;
  const today = new Date().toISOString().split('T')[0];
  for (const day of dailyData) {
    runningTotal += day.expenses;
    day.runningTotal = runningTotal;
    if (day.date <= today) {
      day.dailyAverage = runningTotal / day.day;
    }
  }

  res.json({
    month: monthParam,
    days: dailyData,
    totalExpenses: runningTotal,
    avgDailySpend: daysInMonth > 0 ? runningTotal / Math.min(new Date().getDate(), daysInMonth) : 0,
  });
});

/**
 * GET /category-breakdown
 * Deep dive into spending within a category over time
 * Query: ?categoryId=5&months=6
 */
router.get('/category-breakdown', async (req: AuthRequest, res) => {
  const categoryId = parseInt(req.query.categoryId as string);
  const months = Math.min(parseInt(req.query.months as string) || 6, 24);

  if (!categoryId || isNaN(categoryId)) {
    return res.status(400).json({ error: 'categoryId is required' });
  }

  // Monthly totals for this category (including subcategories)
  const { rows: monthlyTotals } = await pool.query(`
    SELECT
      TO_CHAR(t.date, 'YYYY-MM') as month,
      SUM(t.amount) as amount,
      COUNT(*) as transaction_count
    FROM transactions t
    WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.is_transfer = FALSE
      AND t.category_id IN (SELECT id FROM categories WHERE (id = $2 OR parent_id = $2) AND user_id = $1)
      AND t.date >= (CURRENT_DATE - ($3 || ' months')::INTERVAL)
    GROUP BY TO_CHAR(t.date, 'YYYY-MM')
    ORDER BY month ASC
  `, [req.userId, categoryId, months]);

  // Top merchants in this category
  const { rows: topMerchants } = await pool.query(`
    SELECT
      COALESCE(t.merchant_name, t.description) as name,
      SUM(t.amount) as amount,
      COUNT(*) as count
    FROM transactions t
    WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.is_transfer = FALSE
      AND t.category_id IN (SELECT id FROM categories WHERE (id = $2 OR parent_id = $2) AND user_id = $1)
      AND t.date >= (CURRENT_DATE - ($3 || ' months')::INTERVAL)
    GROUP BY COALESCE(t.merchant_name, t.description)
    ORDER BY amount DESC
    LIMIT 10
  `, [req.userId, categoryId, months]);

  // Subcategory breakdown (if parent category)
  const { rows: subcategoryBreakdown } = await pool.query(`
    SELECT
      c.name, c.color, c.icon,
      SUM(t.amount) as amount,
      COUNT(*) as transaction_count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = $1
      AND t.type = 'expense'
      AND t.is_transfer = FALSE
      AND t.category_id IN (SELECT id FROM categories WHERE (id = $2 OR parent_id = $2) AND user_id = $1)
      AND t.date >= (CURRENT_DATE - ($3 || ' months')::INTERVAL)
    GROUP BY c.id, c.name, c.color, c.icon
    ORDER BY amount DESC
  `, [req.userId, categoryId, months]);

  // Category info
  const { rows: catInfo } = await pool.query(
    'SELECT name, color, icon FROM categories WHERE id = $1 AND user_id = $2',
    [categoryId, req.userId]
  );

  res.json({
    category: catInfo[0] || { name: 'Unknown', color: '#6b7280', icon: 'circle' },
    monthlyTotals: monthlyTotals.map(r => ({
      month: r.month,
      amount: parseFloat(r.amount),
      transactionCount: parseInt(r.transaction_count),
    })),
    topMerchants: topMerchants.map(r => ({
      name: r.name,
      amount: parseFloat(r.amount),
      count: parseInt(r.count),
    })),
    subcategories: subcategoryBreakdown.map(r => ({
      name: r.name,
      color: r.color,
      icon: r.icon,
      amount: parseFloat(r.amount),
      transactionCount: parseInt(r.transaction_count),
    })),
  });
});

export default router;
