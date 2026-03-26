import db from './connection';

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'checking',
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      icon TEXT NOT NULL DEFAULT 'circle',
      color TEXT NOT NULL DEFAULT '#6b7280'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
      year INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, month, year)
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      icon TEXT NOT NULL DEFAULT 'target',
      color TEXT NOT NULL DEFAULT '#10b981',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  `);

  seedData();
}

function seedData() {
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as any;
  if (categoryCount.count > 0) return;

  const insertCategory = db.prepare('INSERT INTO categories (name, type, icon, color) VALUES (?, ?, ?, ?)');

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

  const insertMany = db.transaction(() => {
    for (const [name, type, icon, color] of categories) {
      insertCategory.run(name, type, icon, color);
    }
  });
  insertMany();

  // Seed a default account
  const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as any;
  if (accountCount.count === 0) {
    db.prepare('INSERT INTO accounts (name, type, balance) VALUES (?, ?, ?)').run('Main Checking', 'checking', 5000);
  }

  // Seed sample transactions for demo
  const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as any;
  if (txCount.count > 0) return;

  const insertTx = db.prepare('INSERT INTO transactions (account_id, category_id, amount, type, description, date) VALUES (?, ?, ?, ?, ?, ?)');
  const now = new Date();

  const sampleTransactions = db.transaction(() => {
    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = (m: Date, day: number) => {
        const d = new Date(m.getFullYear(), m.getMonth(), day);
        return d.toISOString().split('T')[0];
      };

      // Salary
      insertTx.run(1, 1, 5000, 'income', 'Monthly Salary', monthStr(month, 1));
      // Freelance (some months)
      if (i % 2 === 0) insertTx.run(1, 2, 1200, 'income', 'Freelance Project', monthStr(month, 15));

      // Expenses
      insertTx.run(1, 5, 320 + Math.round(Math.random() * 80), 'expense', 'Grocery Shopping', monthStr(month, 3));
      insertTx.run(1, 6, 1500, 'expense', 'Monthly Rent', monthStr(month, 1));
      insertTx.run(1, 7, 120 + Math.round(Math.random() * 30), 'expense', 'Electric & Water', monthStr(month, 5));
      insertTx.run(1, 8, 80 + Math.round(Math.random() * 40), 'expense', 'Gas & Transit', monthStr(month, 8));
      insertTx.run(1, 9, 50 + Math.round(Math.random() * 50), 'expense', 'Movies & Games', monthStr(month, 12));
      insertTx.run(1, 10, 60 + Math.round(Math.random() * 40), 'expense', 'Restaurant', monthStr(month, 18));
      insertTx.run(1, 14, 45, 'expense', 'Netflix & Spotify', monthStr(month, 1));
      if (i < 3) insertTx.run(1, 12, 200, 'expense', 'New Shoes', monthStr(month, 20));
    }
  });
  sampleTransactions();

  // Update account balance based on seeded transactions
  const balance = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) as balance
    FROM transactions WHERE account_id = 1
  `).get() as any;
  db.prepare('UPDATE accounts SET balance = ? WHERE id = 1').run(balance.balance);
}
