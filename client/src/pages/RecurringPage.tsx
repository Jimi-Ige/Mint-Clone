import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import { RecurringPattern, Category, Account } from '../types';
import { useApi } from '../hooks/useApi';
import Modal from '../components/ui/Modal';
import {
  Plus, Repeat, Sparkles, Pause, Play, Trash2, Edit2,
  CalendarClock, TrendingUp, TrendingDown, AlertCircle, Check,
} from 'lucide-react';

const frequencyLabels: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const frequencyOptions = Object.entries(frequencyLabels);

export default function RecurringPage() {
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [upcoming, setUpcoming] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringPattern | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissedPatterns, setDismissedPatterns] = useState<RecurringPattern[]>([]);

  const { data: categories } = useApi<Category[]>('/categories');
  const { data: accounts } = useApi<Account[]>('/accounts');

  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense',
    category_id: '',
    account_id: '',
    frequency: 'monthly',
    next_expected: new Date().toISOString().split('T')[0],
  });

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    try {
      const [active, upcomingData] = await Promise.all([
        api.get<RecurringPattern[]>('/recurring?status=active'),
        api.get<RecurringPattern[]>('/recurring/upcoming?days=30'),
      ]);
      setPatterns(active);
      setUpcoming(upcomingData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const fetchDismissed = async () => {
    try {
      const data = await api.get<RecurringPattern[]>('/recurring?status=dismissed');
      setDismissedPatterns(data);
      setShowDismissed(true);
    } catch {
      // ignore
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await api.post<{ detected: number; updated: number; message: string }>('/recurring/detect', {});
      setDetectResult(res.message);
      fetchPatterns();
    } catch (err: any) {
      setDetectResult(err.message || 'Detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      description: '',
      amount: '',
      type: 'expense',
      category_id: '',
      account_id: accounts?.[0]?.id?.toString() || '',
      frequency: 'monthly',
      next_expected: new Date().toISOString().split('T')[0],
    });
    setModalOpen(true);
  };

  const openEdit = (p: RecurringPattern) => {
    setEditing(p);
    setForm({
      description: p.description,
      amount: p.amount.toString(),
      type: p.type,
      category_id: p.category_id?.toString() || '',
      account_id: p.account_id?.toString() || '',
      frequency: p.frequency,
      next_expected: p.next_expected,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      ...form,
      amount: Number(form.amount),
      category_id: form.category_id ? Number(form.category_id) : null,
      account_id: form.account_id ? Number(form.account_id) : null,
    };
    if (editing) {
      await api.patch(`/recurring/${editing.id}`, body);
    } else {
      await api.post('/recurring', body);
    }
    setModalOpen(false);
    fetchPatterns();
  };

  const handleStatusChange = async (id: number, status: string) => {
    await api.patch(`/recurring/${id}`, { status });
    fetchPatterns();
    if (showDismissed) fetchDismissed();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/recurring/${id}`);
    fetchPatterns();
    if (showDismissed) fetchDismissed();
  };

  const getDaysUntil = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Overdue';
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${diff} days`;
  };

  const getDaysUntilClass = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'text-rose-500 font-semibold';
    if (diff <= 3) return 'text-amber-500 font-semibold';
    if (diff <= 7) return 'text-amber-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  const monthlyTotal = patterns
    .filter(p => p.type === 'expense')
    .reduce((sum, p) => {
      const multiplier = p.frequency === 'weekly' ? 4.33 : p.frequency === 'biweekly' ? 2.17 : p.frequency === 'quarterly' ? 0.33 : p.frequency === 'yearly' ? 0.083 : 1;
      return sum + parseFloat(String(p.avg_amount)) * multiplier;
    }, 0);

  const monthlyIncome = patterns
    .filter(p => p.type === 'income')
    .reduce((sum, p) => {
      const multiplier = p.frequency === 'weekly' ? 4.33 : p.frequency === 'biweekly' ? 2.17 : p.frequency === 'quarterly' ? 0.33 : p.frequency === 'yearly' ? 0.083 : 1;
      return sum + parseFloat(String(p.avg_amount)) * multiplier;
    }, 0);

  const filteredCategories = categories?.filter(c => !form.type || c.type === form.type) || [];

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h1 className="text-xl md:text-2xl font-bold">Bills & Recurring</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2" />
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Bills & Recurring</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <Sparkles className={`w-4 h-4 ${detecting ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{detecting ? 'Detecting...' : 'Auto-Detect'}</span>
          </button>
          <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Bill</span>
          </button>
        </div>
      </div>

      {detectResult && (
        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">{detectResult}</p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="card p-3 md:p-4">
          <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400">Monthly Bills</p>
          <p className="text-lg md:text-xl font-bold mt-0.5 text-rose-500 truncate">{formatCurrency(monthlyTotal)}</p>
        </div>
        <div className="card p-3 md:p-4">
          <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400">Monthly Income</p>
          <p className="text-lg md:text-xl font-bold mt-0.5 text-emerald-500 truncate">{formatCurrency(monthlyIncome)}</p>
        </div>
        <div className="card p-3 md:p-4">
          <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400">Active Patterns</p>
          <p className="text-lg md:text-xl font-bold mt-0.5 truncate">{patterns.length}</p>
        </div>
      </div>

      {/* Upcoming Bills */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-500" />
            Upcoming (Next 30 Days)
          </h2>
          <div className="space-y-2">
            {upcoming.map(bill => (
              <div key={bill.id} className="card p-3 md:p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${bill.category_color || '#6b7280'}15` }}
                  >
                    {bill.type === 'income' ? (
                      <TrendingUp className="w-4 h-4 md:w-5 md:h-5" style={{ color: bill.category_color || '#10b981' }} />
                    ) : (
                      <TrendingDown className="w-4 h-4 md:w-5 md:h-5" style={{ color: bill.category_color || '#ef4444' }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{bill.description}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{bill.category_name || 'Uncategorized'}</span>
                      <span>&middot;</span>
                      <span>{frequencyLabels[bill.frequency]}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${bill.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {bill.type === 'income' ? '+' : '-'}{formatCurrency(bill.avg_amount)}
                    </p>
                    <p className={`text-xs ${getDaysUntilClass(bill.next_expected)}`}>
                      {getDaysUntil(bill.next_expected)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Active Patterns */}
      <section>
        <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
          <Repeat className="w-5 h-5 text-primary-500" />
          All Recurring Patterns
        </h2>

        {patterns.length === 0 ? (
          <div className="card p-8 md:p-12 text-center text-gray-400">
            <Repeat className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium mb-1">No recurring patterns yet</p>
            <p className="text-sm mb-4">Click "Auto-Detect" to scan your transactions, or add one manually</p>
            <button onClick={handleDetect} className="btn-primary text-sm">
              <Sparkles className="w-4 h-4 inline mr-1" /> Auto-Detect Patterns
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {patterns.map(pattern => (
              <div key={pattern.id} className="card p-3 md:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${pattern.category_color || '#6b7280'}15` }}
                    >
                      {pattern.type === 'income' ? (
                        <TrendingUp className="w-4 h-4 md:w-5 md:h-5" style={{ color: pattern.category_color || '#10b981' }} />
                      ) : (
                        <TrendingDown className="w-4 h-4 md:w-5 md:h-5" style={{ color: pattern.category_color || '#ef4444' }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{pattern.description}</p>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <span>{pattern.category_name || 'Uncategorized'}</span>
                        <span>&middot;</span>
                        <span>{frequencyLabels[pattern.frequency]}</span>
                        {pattern.auto_detected && (
                          <>
                            <span>&middot;</span>
                            <span className="flex items-center gap-0.5" title={`${Math.round(pattern.confidence * 100)}% confidence`}>
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              {Math.round(pattern.confidence * 100)}%
                            </span>
                          </>
                        )}
                        <span className="hidden sm:inline">&middot;</span>
                        <span className="hidden sm:inline">{pattern.occurrence_count} occurrences</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${pattern.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {pattern.type === 'income' ? '+' : '-'}{formatCurrency(pattern.avg_amount)}
                      </p>
                      <p className={`text-xs ${getDaysUntilClass(pattern.next_expected)}`}>
                        Next: {formatDate(pattern.next_expected)}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-0.5">
                      <button onClick={() => openEdit(pattern)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(pattern.id, 'paused')}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                        title="Pause"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(pattern.id, 'dismissed')}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"
                        title="Dismiss"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={() => openEdit(pattern)} className="sm:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dismissed Patterns Toggle */}
      <div className="text-center">
        <button
          onClick={showDismissed ? () => setShowDismissed(false) : fetchDismissed}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {showDismissed ? 'Hide dismissed patterns' : 'Show dismissed patterns'}
        </button>
      </div>

      {showDismissed && dismissedPatterns.length > 0 && (
        <section>
          <h2 className="text-base md:text-lg font-semibold mb-3 text-gray-400">Dismissed</h2>
          <div className="space-y-2 opacity-60">
            {dismissedPatterns.map(pattern => (
              <div key={pattern.id} className="card p-3 md:p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{pattern.description}</p>
                  <p className="text-xs text-gray-500">{frequencyLabels[pattern.frequency]} &middot; {formatCurrency(pattern.avg_amount)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleStatusChange(pattern.id, 'active')}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    title="Restore"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(pattern.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Recurring Bill' : 'Add Recurring Bill'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Description</label>
            <input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" placeholder="e.g. Netflix Subscription" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: '' })} className="input">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Amount</label>
              <input type="number" step="0.01" min="0" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input" placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Frequency</label>
              <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="input">
                {frequencyOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Next Due Date</label>
              <input type="date" required value={form.next_expected} onChange={e => setForm({ ...form, next_expected: e.target.value })} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Category</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="input">
                <option value="">Select category</option>
                {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Account</label>
              <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className="input">
                <option value="">Select account</option>
                {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? 'Update' : 'Add'} Bill</button>
          {editing && (
            <div className="flex gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => { handleStatusChange(editing.id, editing.status === 'paused' ? 'active' : 'paused'); setModalOpen(false); }}
                className="flex-1 btn-secondary text-sm"
              >
                {editing.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={() => { handleStatusChange(editing.id, 'dismissed'); setModalOpen(false); }}
                className="flex-1 text-sm text-rose-500 hover:text-rose-600 py-2"
              >
                Dismiss
              </button>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
