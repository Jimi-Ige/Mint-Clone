import { Router } from 'express';
import { Parser } from 'json2csv';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';
import { categorizeTransactions, CATEGORIES } from '../services/categorization';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { startDate, endDate, categoryId, type, search, page = '1', limit = '20' } = req.query;

  let where = 'WHERE t.user_id = $1';
  const params: any[] = [req.userId];
  let paramIdx = 2;

  if (startDate) { where += ` AND t.date >= $${paramIdx++}`; params.push(startDate); }
  if (endDate) { where += ` AND t.date <= $${paramIdx++}`; params.push(endDate); }
  if (categoryId) { where += ` AND t.category_id = $${paramIdx++}`; params.push(categoryId); }
  if (type) { where += ` AND t.type = $${paramIdx++}`; params.push(type); }
  if (search) { where += ` AND t.description ILIKE $${paramIdx++}`; params.push(`%${search}%`); }

  const offset = (Number(page) - 1) * Number(limit);

  const countResult = await pool.query(`SELECT COUNT(*) as total FROM transactions t ${where}`, params);

  const txParams = [...params, Number(limit), offset];
  const { rows: transactions } = await pool.query(`
    SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    ${where}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `, txParams);

  res.json({ transactions, total: parseInt(countResult.rows[0].total), page: Number(page), limit: Number(limit) });
});

router.post('/', async (req: AuthRequest, res) => {
  const { account_id, category_id, amount, type, description = '', date } = req.body;
  if (!account_id || !amount || !type || !date) {
    return res.status(400).json({ error: 'account_id, amount, type, and date are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify account belongs to user
    const acc = await client.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [account_id, req.userId]);
    if (acc.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Account not found' }); }

    const result = await client.query(
      'INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.userId, account_id, category_id || null, amount, type, description, date]
    );

    const balanceChange = type === 'income' ? amount : -amount;
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [balanceChange, account_id]);

    await client.query('COMMIT');

    const { rows } = await pool.query(`
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = $1
    `, [result.rows[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const old = await client.query('SELECT * FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (old.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaction not found' }); }
    const prev = old.rows[0];

    const { account_id, category_id, amount, type, description, date } = req.body;

    // Reverse old balance
    const oldEffect = prev.type === 'income' ? Number(prev.amount) : -Number(prev.amount);
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [oldEffect, prev.account_id]);

    await client.query(`
      UPDATE transactions SET
        account_id = COALESCE($1, account_id), category_id = COALESCE($2, category_id),
        amount = COALESCE($3, amount), type = COALESCE($4, type),
        description = COALESCE($5, description), date = COALESCE($6, date)
      WHERE id = $7 AND user_id = $8
    `, [account_id, category_id, amount, type, description, date, req.params.id, req.userId]);

    // Apply new balance
    const updated = await client.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    const u = updated.rows[0];
    const newEffect = u.type === 'income' ? Number(u.amount) : -Number(u.amount);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [newEffect, u.account_id]);

    await client.query('COMMIT');

    const { rows } = await pool.query(`
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = $1
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tx = await client.query('SELECT * FROM transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (tx.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaction not found' }); }

    const t = tx.rows[0];
    const effect = t.type === 'income' ? Number(t.amount) : -Number(t.amount);
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [effect, t.account_id]);
    await client.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/transactions/export — export transactions as CSV
router.get('/export', async (req: AuthRequest, res) => {
  const { startDate, endDate, categoryId, type } = req.query;

  let where = 'WHERE t.user_id = $1';
  const params: any[] = [req.userId];
  let paramIdx = 2;

  if (startDate) { where += ` AND t.date >= $${paramIdx++}`; params.push(startDate); }
  if (endDate) { where += ` AND t.date <= $${paramIdx++}`; params.push(endDate); }
  if (categoryId) { where += ` AND t.category_id = $${paramIdx++}`; params.push(categoryId); }
  if (type) { where += ` AND t.type = $${paramIdx++}`; params.push(type); }

  const { rows } = await pool.query(`
    SELECT t.date, t.description, t.amount, t.type, c.name as category, a.name as account,
           t.merchant_name, COALESCE(t.manual_category, t.ai_category) as ai_category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    ${where}
    ORDER BY t.date DESC
  `, params);

  const parser = new Parser({ fields: ['date', 'description', 'amount', 'type', 'category', 'account', 'merchant_name', 'ai_category'] });
  const csv = parser.parse(rows);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
  res.send(csv);
});

// POST /api/transactions/import — import transactions from CSV
router.post('/import', async (req: AuthRequest, res) => {
  const { transactions: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No transactions provided' });
  }

  // Get user's accounts and categories for matching
  const { rows: userAccounts } = await pool.query('SELECT id, name FROM accounts WHERE user_id = $1', [req.userId]);
  const { rows: userCategories } = await pool.query('SELECT id, name, type FROM categories WHERE user_id = $1', [req.userId]);

  const accountMap: Record<string, number> = {};
  userAccounts.forEach((a: any) => { accountMap[a.name.toLowerCase()] = a.id; });
  const categoryMap: Record<string, { id: number; type: string }> = {};
  userCategories.forEach((c: any) => { categoryMap[c.name.toLowerCase()] = { id: c.id, type: c.type }; });

  const defaultAccountId = userAccounts[0]?.id;
  if (!defaultAccountId) return res.status(400).json({ error: 'No accounts found. Create an account first.' });

  let imported = 0;
  let duplicates = 0;
  const errors: string[] = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { date, description, amount, type, category, account } = row;

      if (!date || !amount) {
        errors.push(`Row ${i + 1}: missing date or amount`);
        continue;
      }

      const parsedAmount = Math.abs(parseFloat(amount));
      if (isNaN(parsedAmount)) {
        errors.push(`Row ${i + 1}: invalid amount "${amount}"`);
        continue;
      }

      // Determine type: explicit, or infer from negative amount
      const txType = type?.toLowerCase() === 'income' ? 'income'
        : type?.toLowerCase() === 'expense' ? 'expense'
        : parseFloat(amount) < 0 ? 'expense' : 'income';

      // Match account
      const accountId = account ? (accountMap[account.toLowerCase()] || defaultAccountId) : defaultAccountId;

      // Match category
      const catMatch = category ? categoryMap[category.toLowerCase()] : null;
      const categoryId = catMatch ? catMatch.id : null;

      // Duplicate detection: same user, date, description, amount
      const dupCheck = await client.query(
        `SELECT id FROM transactions WHERE user_id = $1 AND date = $2 AND description = $3 AND amount = $4 AND type = $5 LIMIT 1`,
        [req.userId, date, description || '', parsedAmount, txType]
      );
      if (dupCheck.rows.length > 0) {
        duplicates++;
        continue;
      }

      await client.query(
        `INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.userId, accountId, categoryId, parsedAmount, txType, description || '', date]
      );

      // Update account balance
      const balanceChange = txType === 'income' ? parsedAmount : -parsedAmount;
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [balanceChange, accountId]);

      imported++;
    }

    await client.query('COMMIT');
    res.json({ imported, duplicates, errors, total: rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/transactions/categories-ai — list available AI categories
router.get('/categories-ai', (_req: AuthRequest, res) => {
  res.json(CATEGORIES);
});

// POST /api/transactions/:id/categorize — categorize a single transaction
router.post('/:id/categorize', async (req: AuthRequest, res) => {
  const txResult = await pool.query(
    'SELECT id, description, merchant_name, amount, type, date FROM transactions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (txResult.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

  const tx = txResult.rows[0];
  const results = await categorizeTransactions([{
    id: tx.id,
    description: tx.description,
    merchant_name: tx.merchant_name,
    amount: parseFloat(tx.amount),
    type: tx.type,
    date: tx.date,
  }]);

  const result = results[0];
  await pool.query(
    'UPDATE transactions SET ai_category = $1, ai_reason = $2 WHERE id = $3 AND user_id = $4',
    [result.category, result.reason, req.params.id, req.userId]
  );

  res.json({ id: result.id, ai_category: result.category, ai_reason: result.reason });
});

// POST /api/transactions/categorize-bulk — categorize all uncategorized transactions
router.post('/categorize-bulk', async (req: AuthRequest, res) => {
  // Fetch uncategorized transactions (no ai_category and no manual_category)
  const { rows: uncategorized } = await pool.query(
    `SELECT id, description, merchant_name, amount, type, date
     FROM transactions
     WHERE user_id = $1 AND ai_category IS NULL AND manual_category IS NULL
     ORDER BY date DESC
     LIMIT 100`,
    [req.userId]
  );

  if (uncategorized.length === 0) {
    return res.json({ categorized: 0, message: 'No uncategorized transactions found' });
  }

  const txns = uncategorized.map((t: any) => ({
    id: t.id,
    description: t.description,
    merchant_name: t.merchant_name,
    amount: parseFloat(t.amount),
    type: t.type,
    date: t.date,
  }));

  // Process in batches of 10 to stay within rate limits
  const BATCH_SIZE = 10;
  let totalCategorized = 0;

  for (let i = 0; i < txns.length; i += BATCH_SIZE) {
    const batch = txns.slice(i, i + BATCH_SIZE);
    const results = await categorizeTransactions(batch);

    for (const result of results) {
      await pool.query(
        'UPDATE transactions SET ai_category = $1, ai_reason = $2 WHERE id = $3 AND user_id = $4',
        [result.category, result.reason, result.id, req.userId]
      );
      totalCategorized++;
    }

    // Rate limit: pause between batches if more remain
    if (i + BATCH_SIZE < txns.length) {
      await new Promise(resolve => setTimeout(resolve, 6000));
    }
  }

  res.json({ categorized: totalCategorized });
});

// PATCH /api/transactions/:id/manual-category — set manual category override
router.patch('/:id/manual-category', async (req: AuthRequest, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'category is required' });

  const { rowCount } = await pool.query(
    'UPDATE transactions SET manual_category = $1 WHERE id = $2 AND user_id = $3',
    [category, req.params.id, req.userId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Transaction not found' });

  res.json({ id: Number(req.params.id), manual_category: category });
});

export default router;
