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
        base_currency TEXT NOT NULL DEFAULT 'USD',
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
        parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
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

      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#6b7280',
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS transaction_tags (
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (transaction_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS filter_presets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        filters JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_filter_presets_user ON filter_presets(user_id);
      CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_tags_tx ON transaction_tags(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);

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

      -- Exchange rates cache for multi-currency
      CREATE TABLE IF NOT EXISTS exchange_rates (
        id SERIAL PRIMARY KEY,
        base_currency TEXT NOT NULL,
        target_currency TEXT NOT NULL,
        rate NUMERIC(16,8) NOT NULL,
        date DATE NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(base_currency, target_currency, date)
      );

      CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON exchange_rates(base_currency, date);

      -- Multi-currency: add base_currency to users
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'base_currency') THEN
          ALTER TABLE users ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'USD';
        END IF;
      END $$;

      -- Hierarchical categories: add parent_id column
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'parent_id') THEN
          ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

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
      CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
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

    // Parent categories (no parent_id)
    const parentCategories: [string, string, string, string][] = [
      ['Income', 'income', 'wallet', '#10b981'],
      ['Food & Drink', 'expense', 'utensils', '#f59e0b'],
      ['Housing', 'expense', 'home', '#ef4444'],
      ['Transportation', 'expense', 'car', '#8b5cf6'],
      ['Entertainment', 'expense', 'film', '#ec4899'],
      ['Health', 'expense', 'heart-pulse', '#14b8a6'],
      ['Shopping', 'expense', 'shopping-bag', '#a855f7'],
      ['Education', 'expense', 'book-open', '#3b82f6'],
      ['Bills & Subscriptions', 'expense', 'repeat', '#6366f1'],
      ['Travel', 'expense', 'plane', '#0ea5e9'],
    ];

    const parentMap: Record<string, number> = {};
    for (const [name, type, icon, color] of parentCategories) {
      const result = await client.query(
        'INSERT INTO categories (user_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [userId, name, type, icon, color]
      );
      parentMap[name] = result.rows[0].id;
    }

    // Subcategories: [name, type, icon, color, parentName]
    const subcategories: [string, string, string, string, string][] = [
      ['Salary', 'income', 'banknote', '#10b981', 'Income'],
      ['Freelance', 'income', 'laptop', '#8b5cf6', 'Income'],
      ['Investments', 'income', 'trending-up', '#3b82f6', 'Income'],
      ['Other Income', 'income', 'plus-circle', '#6366f1', 'Income'],
      ['Groceries', 'expense', 'shopping-cart', '#f59e0b', 'Food & Drink'],
      ['Dining Out', 'expense', 'utensils', '#f43f5e', 'Food & Drink'],
      ['Coffee', 'expense', 'coffee', '#92400e', 'Food & Drink'],
      ['Rent', 'expense', 'home', '#ef4444', 'Housing'],
      ['Utilities', 'expense', 'zap', '#f97316', 'Housing'],
      ['Home Insurance', 'expense', 'shield', '#dc2626', 'Housing'],
      ['Gas', 'expense', 'fuel', '#7c3aed', 'Transportation'],
      ['Public Transit', 'expense', 'train', '#6d28d9', 'Transportation'],
      ['Parking', 'expense', 'square', '#5b21b6', 'Transportation'],
      ['Movies & Games', 'expense', 'gamepad-2', '#ec4899', 'Entertainment'],
      ['Streaming', 'expense', 'tv', '#db2777', 'Entertainment'],
      ['Concerts & Events', 'expense', 'music', '#be185d', 'Entertainment'],
      ['Doctor', 'expense', 'stethoscope', '#14b8a6', 'Health'],
      ['Pharmacy', 'expense', 'pill', '#0d9488', 'Health'],
      ['Gym', 'expense', 'dumbbell', '#0f766e', 'Health'],
      ['Clothing', 'expense', 'shirt', '#a855f7', 'Shopping'],
      ['Electronics', 'expense', 'smartphone', '#9333ea', 'Shopping'],
      ['General Shopping', 'expense', 'shopping-bag', '#7e22ce', 'Shopping'],
      ['Tuition', 'expense', 'graduation-cap', '#3b82f6', 'Education'],
      ['Books & Courses', 'expense', 'book-open', '#2563eb', 'Education'],
      ['Subscriptions', 'expense', 'repeat', '#6366f1', 'Bills & Subscriptions'],
      ['Phone & Internet', 'expense', 'wifi', '#4f46e5', 'Bills & Subscriptions'],
      ['Insurance', 'expense', 'shield-check', '#4338ca', 'Bills & Subscriptions'],
      ['Flights', 'expense', 'plane', '#0ea5e9', 'Travel'],
      ['Hotels', 'expense', 'bed', '#0284c7', 'Travel'],
      ['Travel Activities', 'expense', 'map', '#0369a1', 'Travel'],
    ];

    for (const [name, type, icon, color, parentName] of subcategories) {
      await client.query(
        'INSERT INTO categories (user_id, parent_id, name, type, icon, color) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [userId, parentMap[parentName], name, type, icon, color]
      );
    }

    // Seed default tags
    const defaultTags = [
      ['recurring', '#6366f1'],
      ['transfer', '#3b82f6'],
      ['refund', '#10b981'],
      ['tax-deductible', '#f59e0b'],
      ['travel', '#0ea5e9'],
      ['business', '#8b5cf6'],
      ['one-time', '#ec4899'],
      ['essential', '#ef4444'],
    ];
    for (const [name, color] of defaultTags) {
      await client.query(
        'INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, name, color]
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
