import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { DashboardData, Category, Account, RecurringPattern, BalanceSnapshot } from '../types';
import { useApi } from '../hooks/useApi';
import { formatCurrency as formatCurrencyRaw } from '../lib/formatters';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, ArrowUpRight, ArrowDownRight, Wallet, Filter, CalendarClock } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, LineChart, Line, Legend, Area, AreaChart,
} from 'recharts';

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { start, end };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = getDefaultDateRange();

  // Currency-aware formatter: uses dashboard baseCurrency or user preference
  const formatCurrency = useMemo(() => {
    const currency = user?.base_currency || 'USD';
    return (amount: number) => formatCurrencyRaw(amount, currency);
  }, [user?.base_currency]);

  const [startDate, setStartDate] = useState(searchParams.get('startDate') || defaults.start);
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || defaults.end);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    searchParams.get('accountIds')?.split(',').filter(Boolean) || []
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get('categoryIds')?.split(',').filter(Boolean) || []
  );
  const [showFilters, setShowFilters] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingBills, setUpcomingBills] = useState<RecurringPattern[]>([]);
  const [netWorthHistory, setNetWorthHistory] = useState<BalanceSnapshot[]>([]);

  const { data: categories } = useApi<Category[]>('/categories');
  const { data: accounts } = useApi<Account[]>('/accounts');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (selectedAccounts.length > 0) params.set('accountIds', selectedAccounts.join(','));
    if (selectedCategories.length > 0) params.set('categoryIds', selectedCategories.join(','));

    try {
      const result = await api.get<DashboardData>(`/dashboard?${params}`);
      setData(result);
    } catch {
      // Keep previous data on error
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedAccounts, selectedCategories]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Fetch upcoming bills and net worth history independently
  useEffect(() => {
    api.get<RecurringPattern[]>('/recurring/upcoming?days=14').then(setUpcomingBills).catch(() => {});
    api.get<BalanceSnapshot[]>('/snapshots/history?months=12').then(setNetWorthHistory).catch(() => {});
  }, []);

  // Persist filters in URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate !== defaults.start) params.set('startDate', startDate);
    if (endDate !== defaults.end) params.set('endDate', endDate);
    if (selectedAccounts.length > 0) params.set('accountIds', selectedAccounts.join(','));
    if (selectedCategories.length > 0) params.set('categoryIds', selectedCategories.join(','));
    setSearchParams(params, { replace: true });
  }, [startDate, endDate, selectedAccounts, selectedCategories]);

  const toggleAccount = (id: string) => {
    setSelectedAccounts(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const clearFilters = () => {
    setStartDate(defaults.start);
    setEndDate(defaults.end);
    setSelectedAccounts([]);
    setSelectedCategories([]);
  };

  const hasActiveFilters = startDate !== defaults.start || endDate !== defaults.end || selectedAccounts.length > 0 || selectedCategories.length > 0;

  if (loading && !data) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 md:p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-3" />
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    { label: 'Net Worth', value: formatCurrency(data.totalBalance), icon: DollarSign, color: 'text-primary-500', bg: 'bg-primary-50 dark:bg-primary-500/10' },
    { label: 'Income', value: formatCurrency(data.monthIncome), icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Expenses', value: formatCurrency(data.monthExpenses), icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' },
    { label: 'Net Flow', value: formatCurrency(data.netFlow), icon: Wallet, color: data.netFlow >= 0 ? 'text-emerald-500' : 'text-rose-500', bg: data.netFlow >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10' },
    { label: 'Savings Rate', value: `${data.savingsRate}%`, icon: PiggyBank, color: 'text-accent-500', bg: 'bg-accent-50 dark:bg-accent-500/10' },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Clear
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary flex items-center gap-1.5 text-sm ${hasActiveFilters ? 'ring-2 ring-primary-500/30' : ''}`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card p-3 md:p-4 space-y-3 md:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
            </div>
          </div>
          {accounts && accounts.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block">Accounts</label>
              <div className="flex flex-wrap gap-2">
                {accounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(String(a.id))}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedAccounts.includes(String(a.id))
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {categories && categories.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block">Categories</label>
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {categories.filter(c => c.type === 'expense').map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleCategory(String(c.id))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedCategories.includes(String(c.id))
                        ? 'text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                    style={selectedCategories.includes(String(c.id)) ? { backgroundColor: c.color } : undefined}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
                <p className="text-lg md:text-xl font-bold mt-0.5 md:mt-1 truncate">{value}</p>
              </div>
              <div className={`p-2 md:p-2.5 rounded-xl ${bg} flex-shrink-0`}>
                <Icon className={`w-4 h-4 md:w-5 md:h-5 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Net Worth Trend */}
      {netWorthHistory.length >= 2 && (
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="text-base md:text-lg font-semibold">Net Worth Over Time</h2>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-primary-500" /> Net Worth
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Assets
              </span>
              <span className="flex items-center gap-1 hidden sm:flex">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Liabilities
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={netWorthHistory.map(s => ({
              date: new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              'Net Worth': s.total_balance,
              Assets: s.total_assets,
              Liabilities: s.total_liabilities,
            }))}>
              <defs>
                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={(value: number) => [formatCurrency(value)]}
              />
              <Area type="monotone" dataKey="Net Worth" stroke="#10b981" strokeWidth={2.5} fill="url(#netWorthGrad)" />
              <Line type="monotone" dataKey="Assets" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="Liabilities" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        {/* Income vs Expenses Bar Chart */}
        <div className="card p-4 md:p-5 lg:col-span-3">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Income vs Expenses</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthlyTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="month" className="text-xs" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis className="text-xs" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={(value: number) => [formatCurrency(value)]}
              />
              <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} name="Income" />
              <Bar dataKey="expenses" fill="#f43f5e" radius={[6, 6, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Spending by Category Pie */}
        <div className="card p-4 md:p-5 lg:col-span-2">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Spending by Category</h2>
          {data.spendingByCategory.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.spendingByCategory} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3}>
                    {data.spendingByCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {data.spendingByCategory.slice(0, 5).map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-gray-600 dark:text-gray-400 truncate">{cat.name}</span>
                    </div>
                    <span className="font-medium flex-shrink-0 ml-2">{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-center py-10">No expenses in this period</p>
          )}
        </div>
      </div>

      {/* Net Flow Trend + Top Merchants */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        {/* Net Flow Trend Line */}
        <div className="card p-4 md:p-5 lg:col-span-3">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Net Flow Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="month" className="text-xs" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis className="text-xs" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={(value: number) => [formatCurrency(value)]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} name="Net Flow" />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Expenses" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Merchants */}
        <div className="card p-4 md:p-5 lg:col-span-2">
          <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Top Merchants</h2>
          {data.topMerchants.length > 0 ? (
            <div className="space-y-3">
              {data.topMerchants.map((m, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{m.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.count} transaction{m.count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="font-semibold text-sm text-rose-500 flex-shrink-0 ml-2">{formatCurrency(m.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-10">No merchant data yet</p>
          )}
        </div>
      </div>

      {/* Upcoming Bills */}
      {upcomingBills.length > 0 && (
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-500" /> Upcoming Bills
            </h2>
            <Link to="/recurring" className="text-xs text-primary-500 hover:text-primary-600 font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingBills.slice(0, 5).map(bill => {
              const daysUntil = Math.ceil((new Date(bill.next_expected).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              const urgency = daysUntil < 0 ? 'text-rose-500 font-semibold' : daysUntil <= 3 ? 'text-amber-500 font-semibold' : 'text-gray-500 dark:text-gray-400';
              const label = daysUntil < 0 ? 'Overdue' : daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`;
              return (
                <div key={bill.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs w-12 text-center ${urgency}`}>{label}</span>
                    <span className="text-sm truncate">{bill.description}</span>
                  </div>
                  <span className={`font-semibold text-sm flex-shrink-0 ml-2 ${bill.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {bill.type === 'income' ? '+' : '-'}{formatCurrency(bill.avg_amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Recent Transactions</h2>
        <div className="space-y-2 md:space-y-3">
          {data.recentTransactions.length > 0 ? data.recentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: `${tx.category_color || '#6b7280'}15` }}
                >
                  {tx.type === 'income' ? (
                    <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" style={{ color: tx.category_color || '#10b981' }} />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 md:w-5 md:h-5" style={{ color: tx.category_color || '#ef4444' }} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{tx.description || tx.merchant_name || 'Untitled'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{tx.category_name || 'Uncategorized'} &middot; {new Date(tx.date).toLocaleDateString()}</p>
                </div>
              </div>
              <span className={`font-semibold text-sm flex-shrink-0 ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
              </span>
            </div>
          )) : (
            <p className="text-gray-400 text-center py-6">No transactions in this period</p>
          )}
        </div>
      </div>
    </div>
  );
}
