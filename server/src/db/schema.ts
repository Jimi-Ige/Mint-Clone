import pool from './connection';

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS institutions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        plaid_access_token TEXT NOT NULL,
        plaid_item_id TEXT UNIQUE NOT NULL,
        cursor TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'error', 'login_required')),
        last_sync TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'checking',
        balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        plaid_account_id TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        icon TEXT NOT NULL DEFAULT 'circle',
        color TEXT NOT NULL DEFAULT '#6b7280',
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        amount NUMERIC(12,2) NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        description TEXT NOT NULL DEFAULT '',
        date DATE NOT NULL,
        merchant_name TEXT,
        plaid_transaction_id TEXT UNIQUE,
        plaid_category TEXT,
        pending BOOLEAN NOT NULL DEFAULT FALSE,
        ai_category TEXT,
        ai_reason TEXT,
        manual_category TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
        year INTEGER NOT NULL,
        UNIQUE(category_id, month, year)
      );

      CREATE TABLE IF NOT EXISTS savings_goals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_amount NUMERIC(12,2) NOT NULL,
        current_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        deadline DATE,
        icon TEXT NOT NULL DEFAULT 'target',
        color TEXT NOT NULL DEFAULT '#10b981',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recurring_patterns (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        merchant_name TEXT,
        amount NUMERIC(12,2) NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
        avg_amount NUMERIC(12,2) NOT NULL,
        last_date DATE NOT NULL,
        next_expected DATE NOT NULL,
        confidence NUMERIC(4,2) NOT NULL DEFAULT 0,
        occurrence_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'dismissed')),
        auto_detected BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS balance_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        total_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_assets NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_liabilities NUMERIC(12,2) NOT NULL DEFAULT 0,
        account_balances JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON balance_snapshots(user_id, date);

      -- Transfer detection columns on transactions
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'is_transfer') THEN
          ALTER TABLE transactions ADD COLUMN is_transfer BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'transfer_pair_id') THEN
          ALTER TABLE transactions ADD COLUMN transfer_pair_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(user_id, is_transfer) WHERE is_transfer = TRUE;

      CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_patterns(user_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring_patterns(next_expected);
      CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_patterns(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_institutions_user ON institutions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_plaid_id ON transactions(plaid_transaction_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
      CREATE INDEX IF NOT EXISTS idx_goals_user ON savings_goals(user_id);
    `);

    console.log('Database schema initialized');
  } finally {
    client.release();
  }
}

export async function seedUserData(userId: number) {
  const client = await pool.connect();
  try {
    // Check if user already has categories
    const { rows } = await client.query('SELECT COUNT(*) as count FROM categories WHERE user_id = $1', [userId]);
    if (parseInt(rows[0].count) > 0) return;

    const categories = [
      ['Salary', 'income', 'banknote', '#10b981'],
      ['Freelance', 'income', 'laptop', '#8b5cf6'],
      ['Investments', 'income', 'trending-up', '#3b82f6'],
      ['Other Income', 'income', 'plus-circle', '#6366f1'],
      ['Groceries', 'expense', 'shopping-cart', '#f59e0b'],
      ['Rent', 'expense', 'home', '#ef4444'],
      ['Utilities', 'expense', 'zap', '#f97316'],
      ['Transportation', 'expense', 'car', '#8b5cf6'],
      ['Entertainment', 'expense', 'film', '#ec4899'],
      ['Dining Out', 'expense', 'utensils', '#f43f5e'],
      ['Healthcare', 'expense', 'heart-pulse', '#14b8a6'],
      ['Shopping', 'expense', 'shopping-bag', '#a855f7'],
      ['Education', 'expense', 'book-open', '#3b82f6'],
      ['Subscriptions', 'expense', 'repeat', '#6366f1'],
      ['Travel', 'expense', 'plane', '#0ea5e9'],
    ];

    for (const [name, type, icon, color] of categories) {
      await client.query(
        'INSERT INTO categories (user_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [userId, name, type, icon, color]
      );
    }

    // Seed a default account
    const accResult = await client.query(
      'INSERT INTO accounts (user_id, name, type, balance) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, 'Main Checking', 'checking', 5000]
    );
    const accountId = accResult.rows[0].id;

    // Get category IDs for seeding transactions
    const catRows = await client.query('SELECT id, name FROM categories WHERE user_id = $1', [userId]);
    const catMap: Record<string, number> = {};
    catRows.rows.forEach((r: any) => { catMap[r.name] = r.id; });

    // Seed sample transactions
    const now = new Date();
    let totalBalance = 0;

    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = (m: Date, day: number) => {
        const d = new Date(m.getFullYear(), m.getMonth(), day);
        return d.toISOString().split('T')[0];
      };

      const txns: [number, number, string, string, string][] = [
        [catMap['Salary'], 5000, 'income', 'Monthly Salary', monthStr(month, 1)],
        [catMap['Groceries'], 320 + Math.round(Math.random() * 80), 'expense', 'Grocery Shopping', monthStr(month, 3)],
        [catMap['Rent'], 1500, 'expense', 'Monthly Rent', monthStr(month, 1)],
        [catMap['Utilities'], 120 + Math.round(Math.random() * 30), 'expense', 'Electric & Water', monthStr(month, 5)],
        [catMap['Transportation'], 80 + Math.round(Math.random() * 40), 'expense', 'Gas & Transit', monthStr(month, 8)],
        [catMap['Entertainment'], 50 + Math.round(Math.random() * 50), 'expense', 'Movies & Games', monthStr(month, 12)],
        [catMap['Dining Out'], 60 + Math.round(Math.random() * 40), 'expense', 'Restaurant', monthStr(month, 18)],
        [catMap['Subscriptions'], 45, 'expense', 'Netflix & Spotify', monthStr(month, 1)],
      ];

      if (i % 2 === 0) txns.push([catMap['Freelance'], 1200, 'income', 'Freelance Project', monthStr(month, 15)]);
      if (i < 3) txns.push([catMap['Shopping'], 200, 'expense', 'New Shoes', monthStr(month, 20)]);

      for (const [catId, amount, type, desc, date] of txns) {
        await client.query(
          'INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [userId, accountId, catId, amount, type, desc, date]
        );
        totalBalance += type === 'income' ? amount : -amount;
      }
    }

    await client.query('UPDATE accounts SET balance = $1 WHERE id = $2', [totalBalance, accountId]);
    console.log(`Seeded data for user ${userId}`);
  } finally {
    client.release();
  }
}
