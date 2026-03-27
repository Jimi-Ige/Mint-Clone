import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { formatCurrency as formatCurrencyRaw } from '../lib/formatters';
import { useAuth } from '../context/AuthContext';
import { ReportSummary } from '../types';
import {
  FileText, Download, Calendar, TrendingUp, TrendingDown,
  Wallet, PiggyBank, ChevronLeft, ChevronRight, FileSpreadsheet,
} from 'lucide-react';

type PeriodType = 'monthly' | 'quarterly' | 'yearly' | 'custom';

function getMonthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

function getQuarterRange(offset: number) {
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3);
  const targetQ = currentQ - offset;
  const year = now.getFullYear() + Math.floor(targetQ / 4);
  const q = ((targetQ % 4) + 4) % 4;
  const start = new Date(year, q * 3, 1);
  const end = new Date(year, q * 3 + 3, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    label: `Q${q + 1} ${year}`,
  };
}

function getYearRange(offset: number) {
  const year = new Date().getFullYear() - offset;
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    label: String(year),
  };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const formatCurrency = useMemo(() => {
    const currency = user?.base_currency || 'USD';
    return (amount: number) => formatCurrencyRaw(amount, currency);
  }, [user?.base_currency]);

  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [offset, setOffset] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const period = useMemo(() => {
    if (periodType === 'custom') {
      return { start: customStart, end: customEnd, label: 'Custom Range' };
    }
    if (periodType === 'quarterly') return getQuarterRange(offset);
    if (periodType === 'yearly') return getYearRange(offset);
    return getMonthRange(offset);
  }, [periodType, offset, customStart, customEnd]);

  useEffect(() => {
    if (!period.start || !period.end) return;
    setLoading(true);
    api.get<ReportSummary>(`/reports/summary?startDate=${period.start}&endDate=${period.end}`)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period.start, period.end]);

  const handleDownloadPDF = async () => {
    if (!period.start || !period.end) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/reports/statement?startDate=${period.start}&endDate=${period.end}`,
        { headers: { Authorization: `Bearer ${token || ''}` } }
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${period.start}-to-${period.end}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCSV = () => {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    if (period.start) params.set('startDate', period.start);
    if (period.end) params.set('endDate', period.end);
    fetch(`/api/transactions/export?${params}`, {
      headers: { Authorization: `Bearer ${token || ''}` },
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions-${period.start}-to-${period.end}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const periodTypes: { key: PeriodType; label: string }[] = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'yearly', label: 'Annual' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4 md:space-y-6 slide-up">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Reports</h1>
      </div>

      {/* Period Type Selector */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl">
        {periodTypes.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setPeriodType(key); setOffset(0); }}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-center ${
              periodType === key
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Period Navigation / Custom inputs */}
      {periodType === 'custom' ? (
        <div className="card p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Start Date</label>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">End Date</label>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <button onClick={() => setOffset(o => o + 1)} className="btn-secondary text-sm flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Earlier
          </button>
          <span className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            {period.label}
          </span>
          <button
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={offset === 0}
            className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
          >
            Later <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Preview */}
      {loading ? (
        <div className="card p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded" />)}
            </div>
          </div>
        </div>
      ) : summary ? (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3 md:p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Income</p>
              </div>
              <p className="text-lg font-bold text-emerald-500">{formatCurrency(summary.totalIncome)}</p>
            </div>
            <div className="card p-3 md:p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-rose-500" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Expenses</p>
              </div>
              <p className="text-lg font-bold text-rose-500">{formatCurrency(summary.totalExpenses)}</p>
            </div>
            <div className="card p-3 md:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4" style={{ color: summary.netFlow >= 0 ? '#10b981' : '#f43f5e' }} />
                <p className="text-xs text-gray-500 dark:text-gray-400">Net Flow</p>
              </div>
              <p className={`text-lg font-bold ${summary.netFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(summary.netFlow)}
              </p>
            </div>
            <div className="card p-3 md:p-4">
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className="w-4 h-4 text-primary-500" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Savings Rate</p>
              </div>
              <p className="text-lg font-bold">{summary.savingsRate}%</p>
            </div>
          </div>

          {/* Top Categories Preview */}
          {summary.topCategories.length > 0 && (
            <div className="card p-4 md:p-5">
              <h3 className="text-sm font-semibold mb-3">Top Expense Categories</h3>
              <div className="space-y-2">
                {summary.topCategories.map((cat, i) => {
                  const pct = summary.totalExpenses > 0 ? (cat.amount / summary.totalExpenses) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm truncate">{cat.name}</span>
                          <span className="text-sm font-medium flex-shrink-0 ml-2">{formatCurrency(cat.amount)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Period info */}
          <div className="card p-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {summary.transactionCount} transactions from {new Date(summary.period.startDate).toLocaleDateString()} to {new Date(summary.period.endDate).toLocaleDateString()}
          </div>

          {/* Download Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="btn-primary flex items-center justify-center gap-2 py-3"
            >
              <FileText className={`w-5 h-5 ${downloading ? 'animate-pulse' : ''}`} />
              {downloading ? 'Generating PDF...' : 'Download PDF Statement'}
            </button>
            <button
              onClick={handleDownloadCSV}
              className="btn-secondary flex items-center justify-center gap-2 py-3"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Download CSV Export
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium mb-1">Select a date range</p>
          <p className="text-sm">Choose a period above to preview your report</p>
        </div>
      )}
    </div>
  );
}
