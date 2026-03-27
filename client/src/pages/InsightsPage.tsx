import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import {
  SpendingTrendMonth, PeriodComparison, SpendingAnomaly,
  DailySpendingData, CategoryBreakdown, Category,
} from '../types';
import { useApi } from '../hooks/useApi';
import { formatCurrency as formatCurrencyRaw } from '../lib/formatters';
import { useAuth } from '../context/AuthContext';
import {
  TrendingUp, TrendingDown, AlertTriangle, BarChart3, CalendarDays,
  ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Minus, Layers,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Cell, Legend, PieChart, Pie, LineChart, Line,
} from 'recharts';

type TabType = 'trends' | 'comparison' | 'daily' | 'anomalies';

export default function InsightsPage() {
  const { user } = useAuth();
  const formatCurrency = useMemo(() => {
    const currency = user?.base_currency || 'USD';
    return (amount: number) => formatCurrencyRaw(amount, currency);
  }, [user?.base_currency]);

  const [activeTab, setActiveTab] = useState<TabType>('trends');

  const tabs: { key: TabType; label: string; icon: typeof BarChart3 }[] = [
    { key: 'trends', label: 'Spending Trends', icon: BarChart3 },
    { key: 'comparison', label: 'Period Compare', icon: Layers },
    { key: 'daily', label: 'Daily Spending', icon: CalendarDays },
    { key: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Insights & Analytics</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-1 justify-center ${
              activeTab === key
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'trends' && <SpendingTrends formatCurrency={formatCurrency} />}
      {activeTab === 'comparison' && <PeriodComparisonPanel formatCurrency={formatCurrency} />}
      {activeTab === 'daily' && <DailySpending formatCurrency={formatCurrency} />}
      {activeTab === 'anomalies' && <AnomalyDetection formatCurrency={formatCurrency} />}
    </div>
  );
}

/* ─── Spending Trends Tab ─── */
function SpendingTrends({ formatCurrency }: { formatCurrency: (n: number) => string }) {
  const [data, setData] = useState<SpendingTrendMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(12);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown | null>(null);
  const { data: categories } = useApi<Category[]>('/categories');

  useEffect(() => {
    setLoading(true);
    api.get<SpendingTrendMonth[]>(`/analytics/spending-trends?months=${months}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [months]);

  // Get all unique category names/colors across all months
  const allCategories = useMemo(() => {
    const catMap = new Map<string, string>();
    data.forEach(m => m.categories.forEach(c => catMap.set(c.name, c.color)));
    return Array.from(catMap.entries()).map(([name, color]) => ({ name, color }));
  }, [data]);

  // Build stacked area chart data
  const chartData = useMemo(() => {
    return data.map(m => {
      const point: Record<string, any> = {
        month: new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
      allCategories.forEach(c => { point[c.name] = 0; });
      m.categories.forEach(c => { point[c.name] = c.amount; });
      return point;
    });
  }, [data, allCategories]);

  const handleCategoryClick = useCallback(async (categoryName: string) => {
    if (selectedCategory === categoryName) {
      setSelectedCategory(null);
      setCategoryBreakdown(null);
      return;
    }
    setSelectedCategory(categoryName);
    const cat = categories?.find(c => c.name === categoryName);
    if (cat) {
      try {
        const breakdown = await api.get<CategoryBreakdown>(`/analytics/category-breakdown?categoryId=${cat.id}&months=${months}`);
        setCategoryBreakdown(breakdown);
      } catch {
        setCategoryBreakdown(null);
      }
    }
  }, [selectedCategory, categories, months]);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Top categories over {months} months
        </p>
        <select
          value={months}
          onChange={e => setMonths(Number(e.target.value))}
          className="input w-auto text-sm"
        >
          <option value={6}>6 months</option>
          <option value={12}>12 months</option>
          <option value={24}>24 months</option>
        </select>
      </div>

      {/* Stacked Area Chart */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-4">Spending by Category Over Time</h2>
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={50} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                {allCategories.map(cat => (
                  <Area
                    key={cat.name}
                    type="monotone"
                    dataKey={cat.name}
                    stackId="1"
                    fill={cat.color}
                    stroke={cat.color}
                    fillOpacity={selectedCategory && selectedCategory !== cat.name ? 0.15 : 0.6}
                    strokeOpacity={selectedCategory && selectedCategory !== cat.name ? 0.3 : 1}
                    strokeWidth={selectedCategory === cat.name ? 2.5 : 1}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>

            {/* Category Legend (clickable) */}
            <div className="flex flex-wrap gap-2 mt-3">
              {allCategories.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => handleCategoryClick(cat.name)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedCategory === cat.name
                      ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500'
                      : selectedCategory ? 'opacity-40' : ''
                  }`}
                  style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-center py-16">No spending data for this period</p>
        )}
      </div>

      {/* Category Deep-Dive */}
      {categoryBreakdown && selectedCategory && (
        <div className="card p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: categoryBreakdown.category.color }} />
              {categoryBreakdown.category.name} Deep Dive
            </h2>
            <button
              onClick={() => { setSelectedCategory(null); setCategoryBreakdown(null); }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly trend for this category */}
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Monthly Spending</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryBreakdown.monthlyTotals.map(m => ({
                  month: new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                  amount: m.amount,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${v}`} width={50} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Spending']} />
                  <Bar dataKey="amount" fill={categoryBreakdown.category.color} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top merchants + subcategories */}
            <div className="space-y-4">
              {categoryBreakdown.subcategories.length > 1 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Subcategories</h3>
                  <div className="space-y-2">
                    {categoryBreakdown.subcategories.map(sub => {
                      const total = categoryBreakdown.subcategories.reduce((s, c) => s + c.amount, 0);
                      const pct = total > 0 ? (sub.amount / total) * 100 : 0;
                      return (
                        <div key={sub.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                          <span className="text-sm truncate flex-1">{sub.name}</span>
                          <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                          <span className="text-sm font-medium">{formatCurrency(sub.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Top Merchants</h3>
                <div className="space-y-2">
                  {categoryBreakdown.topMerchants.slice(0, 5).map((m, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{m.name}</p>
                        <p className="text-xs text-gray-500">{m.count} txn{m.count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="text-sm font-medium flex-shrink-0 ml-2">{formatCurrency(m.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Period Comparison Tab ─── */
function PeriodComparisonPanel({ formatCurrency }: { formatCurrency: (n: number) => string }) {
  const [data, setData] = useState<PeriodComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0); // 0 = current month, 1 = previous month, etc.

  useEffect(() => {
    setLoading(true);
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth() - offset, 1).toISOString().split('T')[0];
    const currentEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0).toISOString().split('T')[0];
    const prevStart = new Date(now.getFullYear(), now.getMonth() - offset - 1, 1).toISOString().split('T')[0];
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - offset, 0).toISOString().split('T')[0];

    api.get<PeriodComparison>(
      `/analytics/period-comparison?currentStart=${currentStart}&currentEnd=${currentEnd}&previousStart=${prevStart}&previousEnd=${prevEnd}`
    )
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [offset]);

  if (loading || !data) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  const expenseChange = data.totals.previousExpenses > 0
    ? ((data.totals.currentExpenses - data.totals.previousExpenses) / data.totals.previousExpenses) * 100
    : 0;
  const incomeChange = data.totals.previousIncome > 0
    ? ((data.totals.currentIncome - data.totals.previousIncome) / data.totals.previousIncome) * 100
    : 0;

  const currentLabel = new Date(data.currentPeriod.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const previousLabel = new Date(data.previousPeriod.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setOffset(o => o + 1)} className="btn-secondary text-sm flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Earlier
        </button>
        <span className="text-sm font-medium">{currentLabel} vs {previousLabel}</span>
        <button
          onClick={() => setOffset(o => Math.max(0, o - 1))}
          disabled={offset === 0}
          className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
        >
          Later <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Expenses</p>
          <p className="text-xl font-bold mt-1">{formatCurrency(data.totals.currentExpenses)}</p>
          <div className={`flex items-center gap-1 mt-1 text-sm ${expenseChange > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {expenseChange > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : expenseChange < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            {Math.abs(expenseChange).toFixed(1)}% vs last
          </div>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Income</p>
          <p className="text-xl font-bold mt-1">{formatCurrency(data.totals.currentIncome)}</p>
          <div className={`flex items-center gap-1 mt-1 text-sm ${incomeChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {incomeChange > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : incomeChange < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            {Math.abs(incomeChange).toFixed(1)}% vs last
          </div>
        </div>
      </div>

      {/* Category Comparison Bar Chart */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-4">Category Comparison</h2>
        {data.categories.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, data.categories.length * 45)}>
            <BarChart data={data.categories} layout="vertical" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="currentAmount" name={currentLabel} fill="#6366f1" radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="previousAmount" name={previousLabel} fill="#d1d5db" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-10">No data for this period</p>
        )}
      </div>

      {/* Category Change List */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-3">Biggest Changes</h2>
        <div className="space-y-2">
          {data.categories
            .filter(c => c.currentAmount > 0 || c.previousAmount > 0)
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
            .slice(0, 8)
            .map(cat => (
              <div key={cat.name} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm truncate">{cat.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm text-gray-500">{formatCurrency(cat.previousAmount)}</span>
                  <span className="text-sm font-medium">{formatCurrency(cat.currentAmount)}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    cat.change > 5 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' :
                    cat.change < -5 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    {cat.change > 0 ? '+' : ''}{cat.change.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Daily Spending Tab ─── */
function DailySpending({ formatCurrency }: { formatCurrency: (n: number) => string }) {
  const [data, setData] = useState<DailySpendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0);

  const monthParam = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [monthOffset]);

  useEffect(() => {
    setLoading(true);
    api.get<DailySpendingData>(`/analytics/daily-spending?month=${monthParam}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [monthParam]);

  if (loading || !data) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  const monthLabel = new Date(data.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Find max spending day
  const maxDay = data.days.reduce((max, d) => d.expenses > max.expenses ? d : max, data.days[0]);

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setMonthOffset(o => o + 1)} className="btn-secondary text-sm flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Earlier
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          onClick={() => setMonthOffset(o => Math.max(0, o - 1))}
          disabled={monthOffset === 0}
          className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
        >
          Later <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 md:p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Spent</p>
          <p className="text-lg md:text-xl font-bold mt-1">{formatCurrency(data.totalExpenses)}</p>
        </div>
        <div className="card p-3 md:p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Daily Average</p>
          <p className="text-lg md:text-xl font-bold mt-1">{formatCurrency(data.avgDailySpend)}</p>
        </div>
        <div className="card p-3 md:p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Peak Day</p>
          <p className="text-lg md:text-xl font-bold mt-1">{maxDay ? formatCurrency(maxDay.expenses) : '--'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{maxDay ? `Day ${maxDay.day} (${maxDay.dayOfWeek})` : ''}</p>
        </div>
      </div>

      {/* Daily Bar Chart */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-4">Daily Expenses</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.days}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${v}`} width={50} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'expenses' ? 'Expenses' : name]}
              labelFormatter={l => `Day ${l}`}
            />
            <Bar dataKey="expenses" fill="#f43f5e" radius={[3, 3, 0, 0]} name="expenses">
              {data.days.map((d, i) => (
                <Cell key={i} fill={d.dayOfWeek === 'Sat' || d.dayOfWeek === 'Sun' ? '#fb923c' : '#f43f5e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-400 mt-2 text-center">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500 mr-1 align-middle" /> Weekdays
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-400 ml-3 mr-1 align-middle" /> Weekends
        </p>
      </div>

      {/* Running Total + Daily Average Line */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-4">Cumulative Spending</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.days.filter(d => d.runningTotal !== undefined)}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${v}`} width={55} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: 'none', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="runningTotal" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Running Total" />
            <Line type="monotone" dataKey="dailyAverage" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Daily Avg Pace" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Day-of-week breakdown */}
      <div className="card p-4 md:p-5">
        <h2 className="text-base md:text-lg font-semibold mb-3">Spending by Day of Week</h2>
        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dow => {
            const dayData = data.days.filter(d => d.dayOfWeek === dow);
            const total = dayData.reduce((s, d) => s + d.expenses, 0);
            const avg = dayData.length > 0 ? total / dayData.length : 0;
            const maxTotal = Math.max(...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d2 => {
              const dd = data.days.filter(dd2 => dd2.dayOfWeek === d2);
              return dd.reduce((s, d3) => s + d3.expenses, 0) / (dd.length || 1);
            }));
            const pct = maxTotal > 0 ? (avg / maxTotal) * 100 : 0;
            return (
              <div key={dow} className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{dow}</p>
                <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg relative overflow-hidden">
                  <div
                    className="absolute bottom-0 w-full rounded-lg transition-all"
                    style={{ height: `${pct}%`, backgroundColor: dow === 'Sat' || dow === 'Sun' ? '#fb923c' : '#f43f5e' }}
                  />
                </div>
                <p className="text-xs font-medium mt-1">{formatCurrency(avg)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Anomaly Detection Tab ─── */
function AnomalyDetection({ formatCurrency }: { formatCurrency: (n: number) => string }) {
  const [anomalies, setAnomalies] = useState<SpendingAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(3);
  const [threshold, setThreshold] = useState(2);

  useEffect(() => {
    setLoading(true);
    api.get<SpendingAnomaly[]>(`/analytics/anomalies?months=${months}&threshold=${threshold}`)
      .then(setAnomalies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [months, threshold]);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Lookback:</label>
          <select value={months} onChange={e => setMonths(Number(e.target.value))} className="input w-auto text-sm">
            <option value={1}>1 month</option>
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Threshold:</label>
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="input w-auto text-sm">
            <option value={1.5}>1.5x average</option>
            <option value={2}>2x average</option>
            <option value={3}>3x average</option>
            <option value={5}>5x average</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {anomalies.length > 0 ? (
        <div className="card divide-y divide-gray-100 dark:divide-gray-700/50">
          <div className="p-4">
            <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {anomalies.length} Unusual Transaction{anomalies.length !== 1 ? 's' : ''} Found
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Transactions significantly above their category average
            </p>
          </div>
          {anomalies.map(a => (
            <div key={a.id} className="p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${a.categoryColor}15` }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: a.categoryColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{a.description || a.merchantName || 'Unknown'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {a.categoryName} &middot; {new Date(a.date).toLocaleDateString()} &middot; {a.accountName}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-semibold text-rose-500">{formatCurrency(a.amount)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {a.multiple}x avg ({formatCurrency(a.avgAmount)})
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <TrendingUp className="w-6 h-6 text-emerald-500" />
          </div>
          <h3 className="font-medium mb-1">No anomalies detected</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All transactions are within normal ranges for their categories.
          </p>
        </div>
      )}
    </div>
  );
}
