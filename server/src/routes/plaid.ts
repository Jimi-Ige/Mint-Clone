import { Router } from 'express';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import pool from '../db/connection';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
      'PLAID-SECRET': process.env.PLAID_SECRET || '',
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

// GET /api/plaid/institutions — list user's linked institutions
router.get('/institutions', async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, status, last_sync, created_at FROM institutions WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    // Also fetch accounts per institution
    for (const inst of rows) {
      const accts = await pool.query(
        'SELECT id, name, type, balance, currency, plaid_account_id FROM accounts WHERE institution_id = $1 AND user_id = $2',
        [inst.id, req.userId]
      );
      inst.accounts = accts.rows;
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch institutions' });
  }
});

// POST /api/plaid/create-link-token
router.post('/create-link-token', async (req: AuthRequest, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.userId) },
      client_name: 'Mint Clone',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    res.json({ link_token: response.data.link_token });
  } catch (err: any) {
    console.error('Plaid link token error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/plaid/exchange-token — exchange public token after Plaid Link success
router.post('/exchange-token', async (req: AuthRequest, res) => {
  const { public_token, institution: institutionMeta } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token is required' });

  const client = await pool.connect();
  try {
    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResponse.data;

    await client.query('BEGIN');

    // Store institution
    const instResult = await client.query(
      `INSERT INTO institutions (user_id, name, plaid_access_token, plaid_item_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.userId, institutionMeta?.name || 'Bank Account', access_token, item_id]
    );
    const institutionId = instResult.rows[0].id;

    // Fetch accounts from Plaid
    const accountsResponse = await plaidClient.accountsGet({ access_token });
    const plaidAccounts = accountsResponse.data.accounts;

    // Create local accounts linked to this institution
    for (const acct of plaidAccounts) {
      await client.query(
        `INSERT INTO accounts (user_id, institution_id, name, type, balance, currency, plaid_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (plaid_account_id) DO UPDATE SET balance = $5, name = $3`,
        [
          req.userId,
          institutionId,
          acct.name,
          mapPlaidAccountType(acct.type),
          acct.balances.current || 0,
          acct.balances.iso_currency_code || 'USD',
          acct.account_id,
        ]
      );
    }

    await client.query('COMMIT');

    res.json({ institution_id: institutionId, accounts_linked: plaidAccounts.length });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Plaid exchange error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to link bank account' });
  } finally {
    client.release();
  }
});

// POST /api/plaid/sync/:institutionId — cursor-based transaction sync
router.post('/sync/:institutionId', async (req: AuthRequest, res) => {
  const { institutionId } = req.params;

  try {
    // Verify ownership and get access token
    const instResult = await pool.query(
      'SELECT * FROM institutions WHERE id = $1 AND user_id = $2',
      [institutionId, req.userId]
    );
    if (instResult.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });

    const institution = instResult.rows[0];
    const accessToken = institution.plaid_access_token;

    // Build account_id → local account ID map
    const acctResult = await pool.query(
      'SELECT id, plaid_account_id FROM accounts WHERE institution_id = $1 AND user_id = $2',
      [institutionId, req.userId]
    );
    const accountMap: Record<string, number> = {};
    for (const row of acctResult.rows) {
      if (row.plaid_account_id) accountMap[row.plaid_account_id] = row.id;
    }

    let cursor = institution.cursor || undefined;
    let added = 0, modified = 0, removed = 0;
    let hasMore = true;
    let pages = 0;
    const MAX_PAGES = 50;

    while (hasMore && pages < MAX_PAGES) {
      const syncResponse = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor,
      });

      const data = syncResponse.data;

      // Process added transactions
      for (const txn of data.added) {
        const localAccountId = accountMap[txn.account_id];
        if (!localAccountId) continue;

        const amount = Math.abs(txn.amount);
        const type = txn.amount < 0 ? 'income' : 'expense'; // Plaid: negative = income

        await pool.query(
          `INSERT INTO transactions (user_id, account_id, amount, type, description, date, merchant_name, plaid_transaction_id, plaid_category, pending)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (plaid_transaction_id) DO UPDATE SET
             amount = $3, type = $4, description = $5, date = $6, merchant_name = $7, plaid_category = $9, pending = $10`,
          [
            req.userId,
            localAccountId,
            amount,
            type,
            txn.name || txn.merchant_name || '',
            txn.date,
            txn.merchant_name || null,
            txn.transaction_id,
            txn.personal_finance_category?.primary || null,
            txn.pending,
          ]
        );
        added++;
      }

      // Process modified transactions
      for (const txn of data.modified) {
        const amount = Math.abs(txn.amount);
        const type = txn.amount < 0 ? 'income' : 'expense';

        await pool.query(
          `UPDATE transactions SET amount = $1, type = $2, description = $3, date = $4, merchant_name = $5, plaid_category = $6, pending = $7
           WHERE plaid_transaction_id = $8 AND user_id = $9`,
          [
            amount,
            type,
            txn.name || txn.merchant_name || '',
            txn.date,
            txn.merchant_name || null,
            txn.personal_finance_category?.primary || null,
            txn.pending,
            txn.transaction_id,
            req.userId,
          ]
        );
        modified++;
      }

      // Process removed transactions
      for (const txn of data.removed) {
        if (txn.transaction_id) {
          await pool.query(
            'DELETE FROM transactions WHERE plaid_transaction_id = $1 AND user_id = $2',
            [txn.transaction_id, req.userId]
          );
          removed++;
        }
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
      pages++;
    }

    // Update cursor and last_sync
    await pool.query(
      'UPDATE institutions SET cursor = $1, last_sync = NOW(), status = $2 WHERE id = $3',
      [cursor, 'active', institutionId]
    );

    // Refresh account balances from Plaid
    try {
      const balanceResponse = await plaidClient.accountsGet({ access_token: accessToken });
      for (const acct of balanceResponse.data.accounts) {
        await pool.query(
          'UPDATE accounts SET balance = $1 WHERE plaid_account_id = $2 AND user_id = $3',
          [acct.balances.current || 0, acct.account_id, req.userId]
        );
      }
    } catch {
      // Non-critical — balance refresh can fail without breaking sync
    }

    res.json({ added, modified, removed, pages });
  } catch (err: any) {
    console.error('Plaid sync error:', err.response?.data || err.message);
    // Flag institution as errored if it's an item error
    if (err.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
      await pool.query('UPDATE institutions SET status = $1 WHERE id = $2', ['login_required', institutionId]);
      return res.status(400).json({ error: 'Bank login required. Please re-link your account.' });
    }
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

// DELETE /api/plaid/institutions/:id — unlink an institution
router.delete('/institutions/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const instResult = await pool.query(
      'SELECT plaid_access_token FROM institutions WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (instResult.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });

    // Remove item from Plaid
    try {
      await plaidClient.itemRemove({ access_token: instResult.rows[0].plaid_access_token });
    } catch {
      // Best-effort — continue even if Plaid removal fails
    }

    await pool.query('DELETE FROM institutions WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to unlink institution' });
  }
});

function mapPlaidAccountType(plaidType: string): string {
  switch (plaidType) {
    case 'depository': return 'checking';
    case 'credit': return 'credit';
    case 'loan': return 'loan';
    case 'investment': return 'investment';
    default: return 'other';
  }
}

export default router;
