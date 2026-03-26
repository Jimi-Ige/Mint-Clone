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
  created_at: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  account_name?: string;
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

export interface DashboardData {
  totalBalance: number;
  monthIncome: number;
  monthExpenses: number;
  savingsRate: number;
  spendingByCategory: { name: string; amount: number; color: string; icon: string }[];
  monthlyTrend: { month: string; income: number; expenses: number }[];
  recentTransactions: Transaction[];
  goals: SavingsGoal[];
}
