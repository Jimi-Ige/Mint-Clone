import { Router } from 'express';
import PDFDocument from 'pdfkit';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Color palette
const COLORS = {
  primary: '#6366f1',
  emerald: '#10b981',
  rose: '#f43f5e',
  gray: '#6b7280',
  lightGray: '#e5e7eb',
  dark: '#111827',
  white: '#ffffff',
};

function formatMoney(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function drawLine(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.lightGray).lineWidth(0.5).stroke();
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fontSize(13).fillColor(COLORS.primary).text(title, 50, y);
  drawLine(doc, y + 18);
  return y + 28;
}

/**
 * GET /api/reports/statement
 * Generate a PDF financial statement
 * Query: ?startDate=&endDate=&type=monthly|custom|annual
 */
router.get('/statement', async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const startDate = (req.query.startDate as string) || defaultStart;
    const endDate = (req.query.endDate as string) || defaultEnd;

    // Fetch user info
    const userResult = await pool.query('SELECT name, email, base_currency FROM users WHERE id = $1', [req.userId]);
    const user = userResult.rows[0];
    const currency = user?.base_currency || 'USD';

    // Fetch summary data
    const { rows: summary } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' AND is_transfer = FALSE THEN amount END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' AND is_transfer = FALSE THEN amount END), 0) as total_expenses,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE user_id = $1 AND date >= $2 AND date <= $3
    `, [req.userId, startDate, endDate]);

    const totalIncome = parseFloat(summary[0].total_income);
    const totalExpenses = parseFloat(summary[0].total_expenses);
    const netFlow = totalIncome - totalExpenses;
    const txCount = parseInt(summary[0].transaction_count);

    // Spending by category
    const { rows: categories } = await pool.query(`
      SELECT
        COALESCE(p.name, c.name) as name,
        COALESCE(p.color, c.color) as color,
        COALESCE(SUM(t.amount), 0) as amount,
        COUNT(*) as count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
        AND t.type = 'expense' AND t.is_transfer = FALSE
      GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name), COALESCE(p.color, c.color)
      ORDER BY amount DESC
    `, [req.userId, startDate, endDate]);

    // Top merchants
    const { rows: merchants } = await pool.query(`
      SELECT COALESCE(merchant_name, description) as name, SUM(amount) as amount, COUNT(*) as count
      FROM transactions
      WHERE user_id = $1 AND date >= $2 AND date <= $3
        AND type = 'expense' AND is_transfer = FALSE
      GROUP BY COALESCE(merchant_name, description)
      ORDER BY amount DESC LIMIT 10
    `, [req.userId, startDate, endDate]);

    // Account balances
    const { rows: accounts } = await pool.query(
      'SELECT name, type, balance, currency FROM accounts WHERE user_id = $1 ORDER BY balance DESC',
      [req.userId]
    );

    // Recent transactions (up to 50)
    const { rows: transactions } = await pool.query(`
      SELECT t.date, t.description, t.amount, t.type, c.name as category_name, a.name as account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
      ORDER BY t.date DESC
      LIMIT 50
    `, [req.userId, startDate, endDate]);

    // Budget progress
    const startD = new Date(startDate);
    const { rows: budgets } = await pool.query(`
      SELECT b.amount as budget_amount, c.name as category_name,
        COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.category_id IN (SELECT id FROM categories WHERE id = b.category_id OR parent_id = b.category_id)
          AND t.type = 'expense' AND EXTRACT(MONTH FROM t.date) = b.month AND EXTRACT(YEAR FROM t.date) = b.year
        ), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
      ORDER BY b.amount DESC
    `, [req.userId, startD.getMonth() + 1, startD.getFullYear()]);

    // ── Build PDF ──
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

    // Set response headers
    const periodLabel = new Date(startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const filename = `statement-${startDate}-to-${endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // ── Header ──
    doc.fontSize(22).fillColor(COLORS.primary).text('Financial Statement', 50, 50);
    doc.fontSize(10).fillColor(COLORS.gray)
      .text(`${user?.name || 'User'} — ${user?.email || ''}`, 50, 78)
      .text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, 50, 92)
      .text(`Generated: ${new Date().toLocaleDateString()}`, 50, 106);

    drawLine(doc, 125);

    // ── Summary Section ──
    let y = drawSectionHeader(doc, 'Summary', 135);

    const summaryItems = [
      { label: 'Total Income', value: formatMoney(totalIncome, currency), color: COLORS.emerald },
      { label: 'Total Expenses', value: formatMoney(totalExpenses, currency), color: COLORS.rose },
      { label: 'Net Flow', value: formatMoney(netFlow, currency), color: netFlow >= 0 ? COLORS.emerald : COLORS.rose },
      { label: 'Savings Rate', value: totalIncome > 0 ? `${Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)}%` : '0%', color: COLORS.primary },
      { label: 'Transactions', value: String(txCount), color: COLORS.gray },
    ];

    for (const item of summaryItems) {
      doc.fontSize(10).fillColor(COLORS.gray).text(item.label, 50, y);
      doc.fontSize(10).fillColor(item.color).text(item.value, 200, y);
      y += 18;
    }

    // ── Account Balances ──
    y = drawSectionHeader(doc, 'Account Balances', y + 10);
    for (const acc of accounts) {
      doc.fontSize(10).fillColor(COLORS.dark).text(acc.name, 50, y);
      doc.fontSize(9).fillColor(COLORS.gray).text(acc.type, 220, y);
      const bal = parseFloat(acc.balance);
      doc.fontSize(10).fillColor(bal >= 0 ? COLORS.emerald : COLORS.rose)
        .text(formatMoney(bal, acc.currency), 350, y, { width: 195, align: 'right' });
      y += 18;
    }

    // ── Spending by Category ──
    if (categories.length > 0) {
      y = drawSectionHeader(doc, 'Spending by Category', y + 10);
      for (const cat of categories.slice(0, 12)) {
        const pct = totalExpenses > 0 ? ((parseFloat(cat.amount) / totalExpenses) * 100).toFixed(1) : '0';
        doc.fontSize(10).fillColor(COLORS.dark).text(cat.name, 50, y);
        doc.fontSize(9).fillColor(COLORS.gray).text(`${pct}%  (${cat.count} txns)`, 220, y);
        doc.fontSize(10).fillColor(COLORS.rose)
          .text(formatMoney(parseFloat(cat.amount), currency), 350, y, { width: 195, align: 'right' });
        y += 18;
        if (y > 720) { doc.addPage(); y = 50; }
      }
    }

    // ── Budget Progress ──
    if (budgets.length > 0) {
      if (y > 600) { doc.addPage(); y = 50; }
      y = drawSectionHeader(doc, 'Budget Progress', y + 10);
      for (const b of budgets) {
        const spent = parseFloat(b.spent);
        const budget = parseFloat(b.budget_amount);
        const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
        const isOver = spent > budget;
        doc.fontSize(10).fillColor(COLORS.dark).text(b.category_name, 50, y);
        doc.fontSize(9).fillColor(isOver ? COLORS.rose : COLORS.gray)
          .text(`${formatMoney(spent, currency)} / ${formatMoney(budget, currency)} (${pct}%)`, 220, y);

        // Mini progress bar
        const barX = 420; const barW = 125; const barH = 8;
        doc.rect(barX, y + 2, barW, barH).fillColor(COLORS.lightGray).fill();
        const fillW = Math.min(pct / 100, 1) * barW;
        doc.rect(barX, y + 2, fillW, barH).fillColor(isOver ? COLORS.rose : COLORS.emerald).fill();

        y += 20;
        if (y > 720) { doc.addPage(); y = 50; }
      }
    }

    // ── Top Merchants ──
    if (merchants.length > 0) {
      if (y > 600) { doc.addPage(); y = 50; }
      y = drawSectionHeader(doc, 'Top Merchants', y + 10);
      for (const m of merchants.slice(0, 10)) {
        doc.fontSize(10).fillColor(COLORS.dark).text(m.name, 50, y, { width: 250 });
        doc.fontSize(9).fillColor(COLORS.gray).text(`${m.count} txns`, 310, y);
        doc.fontSize(10).fillColor(COLORS.rose)
          .text(formatMoney(parseFloat(m.amount), currency), 350, y, { width: 195, align: 'right' });
        y += 18;
        if (y > 720) { doc.addPage(); y = 50; }
      }
    }

    // ── Transaction Detail ──
    if (transactions.length > 0) {
      doc.addPage();
      y = drawSectionHeader(doc, 'Transaction Detail', 50);

      // Table header
      doc.fontSize(8).fillColor(COLORS.gray);
      doc.text('Date', 50, y).text('Description', 120, y).text('Category', 300, y).text('Amount', 420, y, { width: 125, align: 'right' });
      y += 14;
      drawLine(doc, y);
      y += 6;

      for (const tx of transactions) {
        const isIncome = tx.type === 'income';
        doc.fontSize(8).fillColor(COLORS.gray).text(new Date(tx.date).toLocaleDateString(), 50, y);
        doc.fontSize(8).fillColor(COLORS.dark).text(tx.description || '-', 120, y, { width: 170 });
        doc.fontSize(8).fillColor(COLORS.gray).text(tx.category_name || '-', 300, y, { width: 110 });
        doc.fontSize(8).fillColor(isIncome ? COLORS.emerald : COLORS.rose)
          .text(`${isIncome ? '+' : '-'}${formatMoney(parseFloat(tx.amount), currency)}`, 420, y, { width: 125, align: 'right' });
        y += 15;
        if (y > 740) { doc.addPage(); y = 50; }
      }
      if (transactions.length >= 50) {
        doc.fontSize(8).fillColor(COLORS.gray).text('... showing first 50 transactions', 50, y + 5);
      }
    }

    // ── Footer on all pages ──
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor(COLORS.gray)
        .text(
          `Mint Finance — Page ${i + 1} of ${pages.count}`,
          50, 780,
          { width: 495, align: 'center' }
        );
    }

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
});

/**
 * GET /api/reports/summary
 * Get report data as JSON (for preview before download)
 */
router.get('/summary', async (req: AuthRequest, res) => {
  const now = new Date();
  const startDate = (req.query.startDate as string) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const endDate = (req.query.endDate as string) || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const { rows: summary } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' AND is_transfer = FALSE THEN amount END), 0) as total_income,
      COALESCE(SUM(CASE WHEN type = 'expense' AND is_transfer = FALSE THEN amount END), 0) as total_expenses,
      COUNT(*) as transaction_count
    FROM transactions
    WHERE user_id = $1 AND date >= $2 AND date <= $3
  `, [req.userId, startDate, endDate]);

  const { rows: categories } = await pool.query(`
    SELECT COALESCE(p.name, c.name) as name, COALESCE(SUM(t.amount), 0) as amount
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    LEFT JOIN categories p ON c.parent_id = p.id
    WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
      AND t.type = 'expense' AND t.is_transfer = FALSE
    GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name)
    ORDER BY amount DESC LIMIT 5
  `, [req.userId, startDate, endDate]);

  const totalIncome = parseFloat(summary[0].total_income);
  const totalExpenses = parseFloat(summary[0].total_expenses);

  res.json({
    period: { startDate, endDate },
    totalIncome,
    totalExpenses,
    netFlow: totalIncome - totalExpenses,
    savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0,
    transactionCount: parseInt(summary[0].transaction_count),
    topCategories: categories.map(c => ({ name: c.name, amount: parseFloat(c.amount) })),
  });
});

export default router;
