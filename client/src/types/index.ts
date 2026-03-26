export interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
  currency: string;
  institution_id?: number;
  plaid_account_id?: string;
  created_at: string;
}

export interface Institution {
  id: number;
  name: string;
  status: 'active' | 'error' | 'login_required';
  last_sync: string | null;
  created_at: string;
  accounts: Account[];
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  color: string;
  parent_id?: number | null;
  parent_name?: string;
  subcategories?: Category[];
}

export interface Transaction {
  id: number;
  account_id: number;
  category_id: number | null;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  date: string;
  merchant_name?: string;
  plaid_transaction_id?: string;
  plaid_category?: string;
  pending?: boolean;
  ai_category?: string;
  ai_reason?: string;
  manual_category?: string;
  is_transfer?: boolean;
  transfer_pair_id?: number | null;
  tags?: Tag[];
  created_at: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  account_name?: string;
  account_currency?: string;
}

export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  month: number;
  year: number;
  spent?: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  parent_id?: number | null;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  usage_count?: number;
}

export interface BalanceSnapshot {
  date: string;
  total_balance: number;
  total_assets: number;
  total_liabilities: number;
  account_balances: Array<{ id: number; name: string; type: string; balance: number }>;
}

export interface Transfer {
  id: number;
  description: string;
  amount: number;
  date: string;
  type: string;
  transfer_pair_id: number | null;
  account_id: number;
  from_account: string;
  to_account_id: number;
  to_account: string;
}

export interface RecurringPattern {
  id: number;
  description: string;
  merchant_name?: string;
  amount: number;
  type: 'income' | 'expense';
  category_id: number | null;
  account_id: number | null;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  avg_amount: number;
  last_date: string;
  next_expected: string;
  confidence: number;
  occurrence_count: number;
  status: 'active' | 'paused' | 'dismissed';
  auto_detected: boolean;
  category_name?: string;
  category_color?: string;
  category_icon?: string;
  account_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardData {
  totalBalance: number;
  baseCurrency?: string;
  monthIncome: number;
  monthExpenses: number;
  netFlow: number;
  savingsRate: number;
  spendingByCategory: { name: string; amount: number; color: string; icon: string }[];
  topMerchants: { name: string; amount: number; count: number }[];
  monthlyTrend: { month: string; income: number; expenses: number; net: number }[];
  recentTransactions: Transaction[];
  goals: SavingsGoal[];
  filters: { startDate: string; endDate: string };
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

export interface FilterPreset {
  id: number;
  name: string;
  filters: TransactionFilters;
  created_at: string;
}

export interface TransactionFilters {
  search?: string;
  type?: string;
  categoryId?: string;
  tagId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  amountMin?: string;
  amountMax?: string;
  isTransfer?: string;
  sort?: string;
}
