import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/formatters';
import { Transaction, TransactionSplit, Category, Account, Tag, FilterPreset, TransactionFilters } from '../types';
import { useApi } from '../hooks/useApi';
import Modal from '../components/ui/Modal';
import { Plus, Search, ArrowUpRight, ArrowDownRight, Trash2, Edit2, Sparkles, Download, Upload, MoreHorizontal, ArrowLeftRight, Tag as TagIcon, X, SlidersHorizontal, Save, ChevronDown, ChevronUp, ArrowUpDown, Calendar, DollarSign, Bookmark, Scissors } from 'lucide-react';
import CsvImport from '../components/transactions/CsvImport';

const defaultFilters: TransactionFilters = {
  search: '', type: '', categoryId: '', tagId: '', accountId: '',
  startDate: '', endDate: '', amountMin: '', amountMax: '', isTransfer: '', sort: 'date_desc',
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TransactionFilters>({ ...defaultFilters });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeResult, setCategorizeResult] = useState<string | null>(null);
  const [aiCategories, setAiCategories] = useState<string[]>([]);
  const [mobileActions, setMobileActions] = useState(false);
  const [detectingTransfers, setDetectingTransfers] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagPopover, setTagPopover] = useState<number | null>(null);

  // Saved presets
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [savePresetName, setSavePresetName] = useState('');
  const [showPresetSave, setShowPresetSave] = useState(false);
  const [showPresetList, setShowPresetList] = useState(false);

  const { data: categories } = useApi<Category[]>('/categories');
  const { data: accounts } = useApi<Account[]>('/accounts');

  useEffect(() => {
    api.get<string[]>('/transactions/categories-ai').then(setAiCategories).catch(() => {});
    api.get<Tag[]>('/tags').then(setAllTags).catch(() => {});
    api.get<FilterPreset[]>('/filter-presets').then(setPresets).catch(() => {});
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (filters.search) params.set('search', filters.search);
    if (filters.type) params.set('type', filters.type);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.tagId) params.set('tagId', filters.tagId);
    if (filters.accountId) params.set('accountId', filters.accountId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.amountMin) params.set('amountMin', filters.amountMin);
    if (filters.amountMax) params.set('amountMax', filters.amountMax);
    if (filters.isTransfer) params.set('isTransfer', filters.isTransfer);
    if (filters.sort && filters.sort !== 'date_desc') params.set('sort', filters.sort);
    const res = await api.get<{ transactions: Transaction[]; total: number }>(`/transactions?${params}`);
    setTransactions(res.transactions);
    setTotal(res.total);
    setLoading(false);
  }, [page, filters]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const updateFilter = (key: keyof TransactionFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ ...defaultFilters });
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.type) count++;
    if (filters.categoryId) count++;
    if (filters.tagId) count++;
    if (filters.accountId) count++;
    if (filters.startDate || filters.endDate) count++;
    if (filters.amountMin || filters.amountMax) count++;
    if (filters.isTransfer) count++;
    return count;
  }, [filters]);

  // Preset handlers
  const handleSavePreset = async () => {
    if (!savePresetName.trim()) return;
    try {
      const preset = await api.post<FilterPreset>('/filter-presets', { name: savePresetName.trim(), filters });
      setPresets(prev => [...prev, preset]);
      setSavePresetName('');
      setShowPresetSave(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setFilters({ ...defaultFilters, ...preset.filters });
    setPage(1);
    setShowPresetList(false);
  };

  const handleDeletePreset = async (id: number) => {
    await api.delete(`/filter-presets/${id}`);
    setPresets(prev => prev.filter(p => p.id !== id));
  };

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
    if (filters.search) params.set('search', filters.search);
    if (filters.type) params.set('type', filters.type);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
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

  const handleAddTag = async (txId: number, tagId: number) => {
    await api.post(`/tags/transaction/${txId}`, { tag_id: tagId });
    setTagPopover(null);
    fetchTransactions();
  };

  const handleRemoveTag = async (txId: number, tagId: number) => {
    await api.delete(`/tags/transaction/${txId}/${tagId}`);
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

  // Split transaction state
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitTx, setSplitTx] = useState<Transaction | null>(null);
  const [splitRows, setSplitRows] = useState<{ category_id: string; amount: string; description: string }[]>([]);
  const [splitError, setSplitError] = useState('');

  const openSplit = (tx: Transaction) => {
    setSplitTx(tx);
    setSplitError('');
    if (tx.splits && tx.splits.length > 0) {
      setSplitRows(tx.splits.map(s => ({
        category_id: s.category_id?.toString() || '',
        amount: s.amount.toString(),
        description: s.description || '',
      })));
    } else {
      // Start with two empty rows, pre-fill first with existing category and half amount
      const half = (tx.amount / 2).toFixed(2);
      setSplitRows([
        { category_id: tx.category_id?.toString() || '', amount: half, description: '' },
        { category_id: '', amount: (tx.amount - parseFloat(half)).toFixed(2), description: '' },
      ]);
    }
    setSplitModalOpen(true);
  };

  const addSplitRow = () => {
    setSplitRows(prev => [...prev, { category_id: '', amount: '', description: '' }]);
  };

  const removeSplitRow = (idx: number) => {
    if (splitRows.length <= 2) return;
    setSplitRows(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSplitRow = (idx: number, field: string, value: string) => {
    setSplitRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const splitRemaining = useMemo(() => {
    if (!splitTx) return 0;
    const allocated = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    return splitTx.amount - allocated;
  }, [splitTx, splitRows]);

  const handleSaveSplit = async () => {
    if (!splitTx) return;
    setSplitError('');

    // Validate
    for (const row of splitRows) {
      if (!row.amount || parseFloat(row.amount) <= 0) {
        setSplitError('All split amounts must be greater than 0');
        return;
      }
    }
    if (Math.abs(splitRemaining) > 0.01) {
      setSplitError(`Splits must sum to ${formatCurrency(splitTx.amount)}. Remaining: ${formatCurrency(Math.abs(splitRemaining))}`);
      return;
    }

    try {
      await api.put(`/splits/${splitTx.id}`, {
        splits: splitRows.map(r => ({
          category_id: r.category_id ? Number(r.category_id) : null,
          amount: parseFloat(r.amount),
          description: r.description,
        })),
      });
      setSplitModalOpen(false);
      fetchTransactions();
    } catch (err: any) {
      setSplitError(err.message || 'Failed to save split');
    }
  };

  const handleUnsplit = async () => {
    if (!splitTx) return;
    try {
      await api.put(`/splits/${splitTx.id}`, { splits: [] });
      setSplitModalOpen(false);
      fetchTransactions();
    } catch (err: any) {
      setSplitError(err.message || 'Failed to unsplit');
    }
  };

  const totalPages = Math.ceil(total / 15);
  const filteredCategories = categories?.filter(c => !form.type || c.type === form.type) || [];

  // Build grouped category options for selects
  const groupedCategoryOptions = useMemo(() => {
    if (!categories) return [];
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);
    const options: { id: number; name: string; isParent: boolean; type: string }[] = [];
    for (const p of parents) {
      options.push({ id: p.id, name: p.name, isParent: true, type: p.type });
      const subs = children.filter(c => c.parent_id === p.id);
      for (const s of subs) {
        options.push({ id: s.id, name: `  ${s.name}`, isParent: false, type: s.type });
      }
    }
    const parentIds = new Set(parents.map(p => p.id));
    for (const c of children) {
      if (!parentIds.has(c.parent_id!)) {
        options.push({ id: c.id, name: c.name, isParent: false, type: c.type });
      }
    }
    return options;
  }, [categories]);

  const filteredGroupedCategories = groupedCategoryOptions.filter(c => !form.type || c.type === form.type);

  const sortLabel: Record<string, string> = {
    date_desc: 'Newest first',
    date_asc: 'Oldest first',
    amount_desc: 'Highest amount',
    amount_asc: 'Lowest amount',
    description_asc: 'A-Z',
  };

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
          <button onClick={handleAutoCategorize} disabled={categorizing} className="btn-secondary flex items-center gap-2 text-sm">
            <Sparkles className={`w-4 h-4 ${categorizing ? 'animate-pulse' : ''}`} />
            {categorizing ? 'Categorizing...' : 'Auto-Categorize'}
          </button>
          <button onClick={handleDetectTransfers} disabled={detectingTransfers} className="btn-secondary flex items-center gap-2 text-sm">
            <ArrowLeftRight className={`w-4 h-4 ${detectingTransfers ? 'animate-pulse' : ''}`} />
            {detectingTransfers ? 'Detecting...' : 'Detect Transfers'}
          </button>
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>

        {/* Mobile actions */}
        <div className="flex sm:hidden items-center gap-2">
          <button onClick={openNew} className="btn-primary p-2"><Plus className="w-5 h-5" /></button>
          <div className="relative">
            <button onClick={() => setMobileActions(!mobileActions)} className="btn-secondary p-2">
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
      <div className="card p-3 md:p-4 space-y-3">
        {/* Search + quick filters row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search description or merchant..."
              value={filters.search || ''}
              onChange={e => updateFilter('search', e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={filters.type || ''} onChange={e => updateFilter('type', e.target.value)} className="input w-full sm:w-auto">
              <option value="">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select value={filters.categoryId || ''} onChange={e => updateFilter('categoryId', e.target.value)} className="input w-full sm:w-auto">
              <option value="">All Categories</option>
              {groupedCategoryOptions.map(c => (
                <option key={c.id} value={c.id} className={c.isParent ? 'font-semibold' : ''}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`btn-secondary flex items-center gap-1.5 text-sm ${activeFilterCount > 0 ? 'ring-2 ring-primary-500/30' : ''}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center">{activeFilterCount}</span>
              )}
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Advanced filters panel */}
        {showAdvanced && (
          <div className="border-t border-gray-100 dark:border-gray-700/50 pt-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Date range */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Start Date</label>
                <input type="date" value={filters.startDate || ''} onChange={e => updateFilter('startDate', e.target.value)} className="input" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> End Date</label>
                <input type="date" value={filters.endDate || ''} onChange={e => updateFilter('endDate', e.target.value)} className="input" />
              </div>
              {/* Amount range */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Min Amount</label>
                <input type="number" step="0.01" min="0" placeholder="0.00" value={filters.amountMin || ''} onChange={e => updateFilter('amountMin', e.target.value)} className="input" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Max Amount</label>
                <input type="number" step="0.01" min="0" placeholder="No limit" value={filters.amountMax || ''} onChange={e => updateFilter('amountMax', e.target.value)} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Account */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Account</label>
                <select value={filters.accountId || ''} onChange={e => updateFilter('accountId', e.target.value)} className="input">
                  <option value="">All Accounts</option>
                  {accounts?.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </div>
              {/* Tag */}
              {allTags.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Tag</label>
                  <select value={filters.tagId || ''} onChange={e => updateFilter('tagId', e.target.value)} className="input">
                    <option value="">All Tags</option>
                    {allTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {/* Transfer filter */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Transfers</label>
                <select value={filters.isTransfer || ''} onChange={e => updateFilter('isTransfer', e.target.value)} className="input">
                  <option value="">All</option>
                  <option value="true">Transfers only</option>
                  <option value="false">Exclude transfers</option>
                </select>
              </div>
              {/* Sort */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Sort</label>
                <select value={filters.sort || 'date_desc'} onChange={e => updateFilter('sort', e.target.value)} className="input">
                  {Object.entries(sortLabel).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter actions */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  Clear all filters
                </button>
                {activeFilterCount > 0 && (
                  <span className="text-xs text-gray-400">({activeFilterCount} active)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Load preset */}
                <div className="relative">
                  <button onClick={() => { setShowPresetList(!showPresetList); setShowPresetSave(false); }} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <Bookmark className="w-3.5 h-3.5" /> Presets
                  </button>
                  {showPresetList && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPresetList(false)} />
                      <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1 max-h-60 overflow-auto">
                        {presets.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-gray-400">No saved presets</p>
                        ) : presets.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <button onClick={() => handleLoadPreset(p)} className="text-sm text-left flex-1 truncate">{p.name}</button>
                            <button onClick={() => handleDeletePreset(p.id)} className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* Save preset */}
                <div className="relative">
                  <button onClick={() => { setShowPresetSave(!showPresetSave); setShowPresetList(false); }} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                  {showPresetSave && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowPresetSave(false)} />
                      <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 p-3">
                        <input
                          type="text"
                          placeholder="Preset name..."
                          value={savePresetName}
                          onChange={e => setSavePresetName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                          className="input text-sm mb-2"
                          autoFocus
                        />
                        <button onClick={handleSavePreset} disabled={!savePresetName.trim()} className="btn-primary w-full text-sm">
                          Save Preset
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-gray-400">
            <p className="text-lg font-medium mb-1">No transactions found</p>
            <p className="text-sm">{activeFilterCount > 0 ? 'Try adjusting your filters' : 'Add your first transaction to get started'}</p>
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
                      {tx.splits && tx.splits.length > 0 ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-medium">
                          <Scissors className="w-2.5 h-2.5" /> Split ({tx.splits.length})
                        </span>
                      ) : (
                        <span>{tx.category_name || 'Uncategorized'}</span>
                      )}
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
                      {tx.tags && tx.tags.length > 0 && tx.tags.map(tag => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveTag(tx.id, tag.id); }}
                            className="hover:opacity-70 hidden sm:inline"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                      {/* Add tag button */}
                      <div className="relative hidden sm:inline-block">
                        <button
                          onClick={(e) => { e.stopPropagation(); setTagPopover(tagPopover === tx.id ? null : tx.id); }}
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
                          title="Add tag"
                        >
                          <TagIcon className="w-3 h-3" />
                        </button>
                        {tagPopover === tx.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setTagPopover(null)} />
                            <div className="absolute left-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1 max-h-40 overflow-auto">
                              {allTags
                                .filter(t => !tx.tags?.some(tt => tt.id === t.id))
                                .map(t => (
                                  <button
                                    key={t.id}
                                    onClick={(e) => { e.stopPropagation(); handleAddTag(tx.id, t.id); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                    {t.name}
                                  </button>
                                ))}
                              {allTags.filter(t => !tx.tags?.some(tt => tt.id === t.id)).length === 0 && (
                                <p className="px-3 py-1.5 text-xs text-gray-400">All tags applied</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <span className={`font-semibold text-sm ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, tx.account_currency)}
                  </span>
                  <div className="hidden sm:flex items-center gap-1">
                    <button onClick={() => openSplit(tx)} className="p-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 text-gray-400 hover:text-violet-500" title="Split transaction">
                      <Scissors className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(tx)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(tx.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
                {filteredGroupedCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
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
              {accounts?.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
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

      {/* Split Transaction Modal */}
      <Modal open={splitModalOpen} onClose={() => setSplitModalOpen(false)} title="Split Transaction">
        {splitTx && (
          <div className="space-y-4">
            {/* Transaction info */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
              <p className="font-medium text-sm">{splitTx.description || 'Untitled'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Total: <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(splitTx.amount, splitTx.account_currency)}</span>
                <span className="mx-1">&middot;</span>
                {formatDate(splitTx.date)}
              </p>
            </div>

            {/* Split rows */}
            <div className="space-y-3">
              {splitRows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={row.category_id}
                        onChange={e => updateSplitRow(idx, 'category_id', e.target.value)}
                        className="input text-sm"
                      >
                        <option value="">Category</option>
                        {groupedCategoryOptions
                          .filter(c => !splitTx.type || c.type === splitTx.type)
                          .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Amount"
                        value={row.amount}
                        onChange={e => updateSplitRow(idx, 'amount', e.target.value)}
                        className="input text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      value={row.description}
                      onChange={e => updateSplitRow(idx, 'description', e.target.value)}
                      className="input text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeSplitRow(idx)}
                    disabled={splitRows.length <= 2}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 disabled:opacity-30 mt-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add row */}
            <button onClick={addSplitRow} className="text-sm text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add Split
            </button>

            {/* Remaining indicator */}
            <div className={`text-sm font-medium text-center py-2 rounded-lg ${
              Math.abs(splitRemaining) < 0.01
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {Math.abs(splitRemaining) < 0.01
                ? 'Splits balanced'
                : `Remaining: ${formatCurrency(splitRemaining, splitTx.account_currency)}`}
            </div>

            {splitError && (
              <p className="text-sm text-rose-500">{splitError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSaveSplit}
                disabled={Math.abs(splitRemaining) > 0.01}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                Save Split
              </button>
              {splitTx.splits && splitTx.splits.length > 0 && (
                <button onClick={handleUnsplit} className="btn-secondary text-sm">
                  Unsplit
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
