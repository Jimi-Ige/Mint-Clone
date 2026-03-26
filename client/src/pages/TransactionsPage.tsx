import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import { Transaction, Category, Account } from '../types';
import { useApi } from '../hooks/useApi';
import Modal from '../components/ui/Modal';
import { Plus, Search, ArrowUpRight, ArrowDownRight, Trash2, Edit2, Sparkles, Download, Upload } from 'lucide-react';
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
    // Use fetch directly to handle file download with auth header
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

  const getEffectiveCategory = (tx: Transaction) => {
    return tx.manual_category || tx.ai_category || tx.category_name || null;
  };

  const totalPages = Math.ceil(total / 15);
  const filteredCategories = categories?.filter(c => !form.type || c.type === form.type) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <div className="flex items-center gap-2">
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
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>
      </div>
      {categorizeResult && (
        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-3">{categorizeResult}</p>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="input w-auto">
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} className="input w-auto">
          <option value="">All Categories</option>
          {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Transaction List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-lg font-medium mb-1">No transactions found</p>
            <p className="text-sm">Add your first transaction to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${tx.category_color || '#6b7280'}15` }}>
                    {tx.type === 'income' ? (
                      <ArrowUpRight className="w-5 h-5" style={{ color: tx.category_color || '#10b981' }} />
                    ) : (
                      <ArrowDownRight className="w-5 h-5" style={{ color: tx.category_color || '#ef4444' }} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{tx.description || 'Untitled'}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{tx.category_name || 'Uncategorized'}</span>
                      {(tx.ai_category || tx.manual_category) && (
                        <>
                          <span>&middot;</span>
                          <select
                            value={tx.manual_category || tx.ai_category || ''}
                            onChange={e => handleManualCategory(tx.id, e.target.value)}
                            className="bg-transparent text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 cursor-pointer hover:border-gray-400"
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
                      <span>&middot;</span>
                      <span>{tx.account_name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                  <button onClick={() => openEdit(tx)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(tx.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-sm text-gray-500">{total} transactions</p>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
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
          <div className="grid grid-cols-2 gap-3">
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
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <CsvImport open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchTransactions} />
    </div>
  );
}
