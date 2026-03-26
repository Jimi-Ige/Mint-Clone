import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import { Transaction, Category, Account } from '../types';
import { useApi } from '../hooks/useApi';
import Modal from '../components/ui/Modal';
import { Plus, Search, ArrowUpRight, ArrowDownRight, Trash2, Edit2, Sparkles, Download, Upload, MoreHorizontal, ArrowLeftRight } from 'lucide-react';
import CsvImport from '../components/transactions/CsvImport';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeResult, setCategorizeResult] = useState<string | null>(null);
  const [aiCategories, setAiCategories] = useState<string[]>([]);
  const [mobileActions, setMobileActions] = useState(false);
  const [detectingTransfers, setDetectingTransfers] = useState(false);

  const { data: categories } = useApi<Category[]>('/categories');
  const { data: accounts } = useApi<Account[]>('/accounts');

  useEffect(() => {
    api.get<string[]>('/transactions/categories-ai').then(setAiCategories).catch(() => {});
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (search) params.set('search', search);
    if (filterType) params.set('type', filterType);
    if (filterCategory) params.set('categoryId', filterCategory);
    const res = await api.get<{ transactions: Transaction[]; total: number }>(`/transactions?${params}`);
    setTransactions(res.transactions);
    setTotal(res.total);
    setLoading(false);
  }, [page, search, filterType, filterCategory]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const [form, setForm] = useState({
    account_id: '', category_id: '', amount: '', type: 'expense', description: '', date: new Date().toISOString().split('T')[0],
  });

  const openNew = () => {
    setEditing(null);
    setForm({ account_id: accounts?.[0]?.id?.toString() || '1', category_id: '', amount: '', type: 'expense', description: '', date: new Date().toISOString().split('T')[0] });
    setModalOpen(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setForm({
      account_id: tx.account_id.toString(),
      category_id: tx.category_id?.toString() || '',
      amount: tx.amount.toString(),
      type: tx.type,
      description: tx.description,
      date: tx.date,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, account_id: Number(form.account_id), category_id: form.category_id ? Number(form.category_id) : null, amount: Number(form.amount) };
    if (editing) {
      await api.put(`/transactions/${editing.id}`, body);
    } else {
      await api.post('/transactions', body);
    }
    setModalOpen(false);
    fetchTransactions();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/transactions/${id}`);
    fetchTransactions();
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterType) params.set('type', filterType);
    if (filterCategory) params.set('categoryId', filterCategory);
    const token = localStorage.getItem('token');
    fetch(`/api/transactions/export?${params}`, {
      headers: { Authorization: `Bearer ${token || ''}` },
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transactions.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const handleAutoCategorize = async () => {
    setCategorizing(true);
    setCategorizeResult(null);
    try {
      const res = await api.post<{ categorized: number; message?: string }>('/transactions/categorize-bulk', {});
      setCategorizeResult(res.message || `Categorized ${res.categorized} transactions`);
      fetchTransactions();
    } catch (err: any) {
      setCategorizeResult(err.message);
    } finally {
      setCategorizing(false);
    }
  };

  const handleManualCategory = async (txId: number, category: string) => {
    await api.patch(`/transactions/${txId}/manual-category`, { category });
    fetchTransactions();
  };

  const handleDetectTransfers = async () => {
    setDetectingTransfers(true);
    setCategorizeResult(null);
    try {
      const res = await api.post<{ detected: number; message: string }>('/transfers/detect', {});
      setCategorizeResult(res.message);
      fetchTransactions();
    } catch (err: any) {
      setCategorizeResult(err.message || 'Transfer detection failed');
    } finally {
      setDetectingTransfers(false);
    }
  };

  const totalPages = Math.ceil(total / 15);
  const filteredCategories = categories?.filter(c => !form.type || c.type === form.type) || [];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Transactions</h1>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" /> Import
          </button>
          <button
            onClick={handleAutoCategorize}
            disabled={categorizing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Sparkles className={`w-4 h-4 ${categorizing ? 'animate-pulse' : ''}`} />
            {categorizing ? 'Categorizing...' : 'Auto-Categorize'}
          </button>
          <button
            onClick={handleDetectTransfers}
            disabled={detectingTransfers}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <ArrowLeftRight className={`w-4 h-4 ${detectingTransfers ? 'animate-pulse' : ''}`} />
            {detectingTransfers ? 'Detecting...' : 'Detect Transfers'}
          </button>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>

        {/* Mobile actions */}
        <div className="flex sm:hidden items-center gap-2">
          <button onClick={openNew} className="btn-primary p-2">
            <Plus className="w-5 h-5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMobileActions(!mobileActions)}
              className="btn-secondary p-2"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {mobileActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMobileActions(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
                  <button onClick={() => { handleExport(); setMobileActions(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button onClick={() => { setImportOpen(true); setMobileActions(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Import CSV
                  </button>
                  <button onClick={() => { handleAutoCategorize(); setMobileActions(false); }} disabled={categorizing} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Auto-Categorize
                  </button>
                  <button onClick={() => { handleDetectTransfers(); setMobileActions(false); }} disabled={detectingTransfers} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4" /> Detect Transfers
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {categorizeResult && (
        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">{categorizeResult}</p>
      )}

      {/* Filters */}
      <div className="card p-3 md:p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="input w-full sm:w-auto">
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} className="input w-full sm:w-auto">
            <option value="">All Categories</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Transaction List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-gray-400">
            <p className="text-lg font-medium mb-1">No transactions found</p>
            <p className="text-sm">Add your first transaction to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-3 md:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: `${tx.category_color || '#6b7280'}15` }}>
                    {tx.type === 'income' ? (
                      <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" style={{ color: tx.category_color || '#10b981' }} />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 md:w-5 md:h-5" style={{ color: tx.category_color || '#ef4444' }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{tx.description || 'Untitled'}</p>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{tx.category_name || 'Uncategorized'}</span>
                      {tx.is_transfer && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-medium">
                          <ArrowLeftRight className="w-2.5 h-2.5" /> Transfer
                        </span>
                      )}
                      {(tx.ai_category || tx.manual_category) && (
                        <>
                          <span className="hidden sm:inline">&middot;</span>
                          <select
                            value={tx.manual_category || tx.ai_category || ''}
                            onChange={e => handleManualCategory(tx.id, e.target.value)}
                            className="hidden sm:inline bg-transparent text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 cursor-pointer hover:border-gray-400"
                            title={tx.ai_reason ? `AI: ${tx.ai_reason}` : undefined}
                          >
                            {aiCategories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          {tx.ai_category && !tx.manual_category && (
                            <span title={tx.ai_reason || 'AI categorized'}>
                              <Sparkles className="w-3 h-3 text-purple-400" />
                            </span>
                          )}
                        </>
                      )}
                      <span>&middot;</span>
                      <span>{formatDate(tx.date)}</span>
                      <span className="hidden sm:inline">&middot;</span>
                      <span className="hidden sm:inline">{tx.account_name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <span className={`font-semibold text-sm ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                  <div className="hidden sm:flex items-center gap-1">
                    <button onClick={() => openEdit(tx)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(tx.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Mobile: tap row to edit */}
                  <button onClick={() => openEdit(tx)} className="sm:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 md:p-4 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs md:text-sm text-gray-500">{total} transactions</p>
            <div className="flex gap-1">
              {/* Show prev/next on mobile, page numbers on desktop */}
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="sm:hidden w-8 h-8 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-30"
              >
                &lsaquo;
              </button>
              <span className="sm:hidden flex items-center px-2 text-xs text-gray-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="sm:hidden w-8 h-8 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-30"
              >
                &rsaquo;
              </button>
              {/* Desktop page numbers */}
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`hidden sm:block w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    page === i + 1 ? 'bg-primary-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transaction Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Transaction' : 'Add Transaction'}>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Description</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" placeholder="What was this for?" />
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
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Date</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Account</label>
            <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className="input">
              {accounts?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? 'Update' : 'Add'} Transaction</button>
          {editing && (
            <button
              type="button"
              onClick={() => { handleDelete(editing.id); setModalOpen(false); }}
              className="w-full text-sm text-rose-500 hover:text-rose-600 py-2 sm:hidden"
            >
              Delete Transaction
            </button>
          )}
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <CsvImport open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchTransactions} />
    </div>
  );
}
