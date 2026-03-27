-- Initial schema: all tables as of v3.8
-- This captures the complete database structure built through v1-v3.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  preferences JSONB NOT NULL DEFAULT '{}',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plaid_access_token TEXT NOT NULL,
  plaid_item_id TEXT UNIQUE NOT NULL,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'error', 'login_required', 'pending_sync', 'expiring')),
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
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_pair_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS transaction_splits (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC(16,8) NOT NULL,
  date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(base_currency, target_currency, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_institutions_user ON institutions(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_id ON transactions(plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(user_id, is_transfer) WHERE is_transfer = TRUE;
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tx ON transaction_tags(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_filter_presets_user ON filter_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_splits_transaction ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_category ON transaction_splits(category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring_patterns(next_expected);
CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_patterns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON balance_snapshots(user_id, date);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON exchange_rates(base_currency, date);
