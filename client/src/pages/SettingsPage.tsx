import { useState, useMemo, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { Category, Account, Institution, Tag, CurrencyInfo } from '../types';
import Modal from '../components/ui/Modal';
import { Plus, Trash2, Edit2, Palette, TagIcon, ChevronRight, ChevronDown, Globe, User, Lock, Settings2 } from 'lucide-react';
import PlaidLinkButton from '../components/settings/PlaidLink';
import ConnectedAccounts from '../components/settings/ConnectedAccounts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

const colorOptions = ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#0ea5e9', '#a855f7', '#f43f5e'];

export default function SettingsPage() {
  const { user, updateBaseCurrency, updateUser } = useAuth();
  const { toast } = useToast();
  const { data: categories, refetch: refetchCats } = useApi<Category[]>('/categories');
  const { data: accounts, refetch: refetchAccounts } = useApi<Account[]>('/accounts');
  const { data: institutions, refetch: refetchInstitutions } = useApi<Institution[]>('/plaid/institutions');
  const { data: tags, refetch: refetchTags } = useApi<Tag[]>('/tags');
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([]);

  useEffect(() => {
    api.get<CurrencyInfo[]>('/currency/supported').then(setCurrencies).catch(() => {});
  }, []);

  const handlePlaidSuccess = () => {
    refetchInstitutions();
    refetchAccounts();
  };
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'expense', color: '#10b981', parent_id: '' });
  const [accModal, setAccModal] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', type: 'checking', currency: 'USD' });
  const [expandedParents, setExpandedParents] = useState<Set<number>>(new Set());

  const openNewCat = () => { setEditingCat(null); setCatForm({ name: '', type: 'expense', color: '#10b981', parent_id: '' }); setCatModal(true); };
  const openEditCat = (c: Category) => {
    setEditingCat(c);
    setCatForm({ name: c.name, type: c.type, color: c.color, parent_id: c.parent_id?.toString() || '' });
    setCatModal(true);
  };

  const handleCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...catForm, parent_id: catForm.parent_id ? Number(catForm.parent_id) : null };
    if (editingCat) await api.put(`/categories/${editingCat.id}`, body);
    else await api.post('/categories', body);
    setCatModal(false);
    refetchCats();
  };

  const deleteCat = async (id: number) => { await api.delete(`/categories/${id}`); refetchCats(); };

  const handleAccSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/accounts', accForm);
    setAccModal(false);
    refetchAccounts();
  };

  const deleteAcc = async (id: number) => { await api.delete(`/accounts/${id}`); refetchAccounts(); };

  const handleBaseCurrencyChange = async (currency: string) => {
    await api.put('/currency/preference', { base_currency: currency });
    updateBaseCurrency(currency);
  };

  // Tag management state
  const [tagModal, setTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagForm, setTagForm] = useState({ name: '', color: '#6b7280' });

  const openNewTag = () => { setEditingTag(null); setTagForm({ name: '', color: '#6b7280' }); setTagModal(true); };
  const openEditTag = (t: Tag) => { setEditingTag(t); setTagForm({ name: t.name, color: t.color }); setTagModal(true); };

  const handleTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTag) await api.put(`/tags/${editingTag.id}`, tagForm);
    else await api.post('/tags', tagForm);
    setTagModal(false);
    refetchTags();
  };

  const deleteTag = async (id: number) => { await api.delete(`/tags/${id}`); refetchTags(); };

  // Profile state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const handleProfileUpdate = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const body: any = {};
      if (profileName !== user?.name) body.name = profileName;
      if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }
      if (Object.keys(body).length === 0) { setProfileMsg('No changes'); setProfileSaving(false); return; }
      const result = await api.put<{ name: string }>('/auth/profile', body);
      updateUser({ name: result.name });
      toast('Profile updated');
      setProfileMsg('');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      toast(err.message || 'Update failed', 'error');
      setProfileMsg('');
    } finally {
      setProfileSaving(false);
    }
  };

  // Preferences state
  const [prefs, setPrefs] = useState(user?.preferences || {});
  const [prefsSaving, setPrefsSaving] = useState(false);

  const handlePrefsUpdate = async (key: string, value: any) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setPrefsSaving(true);
    try {
      await api.put('/auth/preferences', { preferences: { [key]: value } });
      updateUser({ preferences: updated });
      toast('Preference saved');
    } catch {
      toast('Failed to save preference', 'error');
      setPrefs(user?.preferences || {});
    } finally {
      setPrefsSaving(false);
    }
  };

  // Build category tree
  const categoryTree = useMemo(() => {
    if (!categories) return { income: [], expense: [] };
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);

    const buildTree = (type: 'income' | 'expense') => {
      const typeParents = parents.filter(p => p.type === type);
      return typeParents.map(p => ({
        ...p,
        subcategories: children.filter(c => c.parent_id === p.id),
      }));
    };

    return { income: buildTree('income'), expense: buildTree('expense') };
  }, [categories]);

  // Parent categories available for subcategory assignment
  const parentCategories = useMemo(() => {
    return categories?.filter(c => !c.parent_id) || [];
  }, [categories]);

  const toggleParent = (id: number) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCategoryItem = (c: Category & { subcategories?: Category[] }, isSubcategory = false) => {
    const hasChildren = !isSubcategory && (c.subcategories?.length || 0) > 0;
    const isExpanded = expandedParents.has(c.id);

    return (
      <div key={c.id}>
        <div className={`card p-3 flex items-center justify-between ${isSubcategory ? 'ml-6 border-l-2' : ''}`} style={isSubcategory ? { borderLeftColor: c.color } : undefined}>
          <div className="flex items-center gap-3">
            {hasChildren ? (
              <button onClick={() => toggleParent(c.id)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <div className="w-5" />
            )}
            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: c.color }} />
            <div>
              <span className="font-medium text-sm">{c.name}</span>
              {hasChildren && (
                <span className="text-xs text-gray-400 ml-2">({c.subcategories!.length} sub)</span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => openEditCat(c)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => deleteCat(c.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        {hasChildren && isExpanded && c.subcategories!.map(sub => renderCategoryItem(sub, true))}
      </div>
    );
  };

  return (
    <div className="space-y-6 md:space-y-8 slide-up">
      <h1 className="text-xl md:text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><User className="w-5 h-5" /> Profile</h2>
        </div>
        <div className="card p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Name</label>
            <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} className="input" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Email</label>
            <input type="email" value={user?.email || ''} disabled className="input opacity-60" />
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700/50 pt-4">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Change Password
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Current Password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="input text-sm" placeholder="Current password" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input text-sm" placeholder="New password (min 6 chars)" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleProfileUpdate} disabled={profileSaving} className="btn-primary text-sm">
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
            {profileMsg && <span className="text-sm text-gray-500">{profileMsg}</span>}
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Settings2 className="w-5 h-5" /> Preferences</h2>
        </div>
        <div className="card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Date Format</label>
              <select
                value={prefs.dateFormat || 'MM/DD/YYYY'}
                onChange={e => handlePrefsUpdate('dateFormat', e.target.value)}
                className="input"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Default Page</label>
              <select
                value={prefs.defaultPage || '/'}
                onChange={e => handlePrefsUpdate('defaultPage', e.target.value)}
                className="input"
              >
                <option value="/">Dashboard</option>
                <option value="/transactions">Transactions</option>
                <option value="/budget">Budget</option>
                <option value="/insights">Insights</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.compactMode || false}
                onChange={e => handlePrefsUpdate('compactMode', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm">Compact mode</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.showCents !== false}
                onChange={e => handlePrefsUpdate('showCents', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm">Show cents</span>
            </label>
          </div>
          {prefsSaving && <p className="text-xs text-gray-400">Saving...</p>}
        </div>
      </section>

      {/* Display Currency */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Globe className="w-5 h-5" /> Display Currency</h2>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            All dashboard totals and reports will be converted to this currency. Account balances remain in their original currency.
          </p>
          <select
            value={user?.base_currency || 'USD'}
            onChange={e => handleBaseCurrencyChange(e.target.value)}
            className="input w-full sm:w-auto"
          >
            {currencies.map(c => (
              <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Linked Bank Accounts (Plaid) */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Linked Bank Accounts</h2>
          <PlaidLinkButton onSuccess={handlePlaidSuccess} />
        </div>
        <ConnectedAccounts institutions={institutions || []} onRefresh={handlePlaidSuccess} />
      </section>

      {/* Manual Accounts */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Manual Accounts</h2>
          <button onClick={() => { setAccForm({ name: '', type: 'checking', currency: user?.base_currency || 'USD' }); setAccModal(true); }} className="btn-secondary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
        <div className="space-y-2">
          {accounts?.map(a => (
            <div key={a.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{a.type} &middot; {a.currency}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">${a.balance.toFixed(2)}</span>
                <button onClick={() => deleteAcc(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Categories</h2>
          <button onClick={openNewCat} className="btn-secondary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Income</h3>
            <div className="space-y-1">
              {categoryTree.income.map(c => renderCategoryItem(c))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Expenses</h3>
            <div className="space-y-1">
              {categoryTree.expense.map(c => renderCategoryItem(c))}
            </div>
          </div>
        </div>
      </section>

      {/* Tags */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><TagIcon className="w-5 h-5" /> Tags</h2>
          <button onClick={openNewTag} className="btn-secondary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Tag
          </button>
        </div>
        <div className="space-y-1">
          {tags?.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No tags yet. Create one to start organizing transactions.</p>
          )}
          {tags?.map(t => (
            <div key={t.id} className="card p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="font-medium text-sm">{t.name}</span>
                {t.usage_count !== undefined && (
                  <span className="text-xs text-gray-400">{t.usage_count} transaction{t.usage_count !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditTag(t)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteTag(t.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tag Modal */}
      <Modal open={tagModal} onClose={() => setTagModal(false)} title={editingTag ? 'Edit Tag' : 'Add Tag'}>
        <form onSubmit={handleTagSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Name</label>
            <input type="text" required value={tagForm.name} onChange={e => setTagForm({ ...tagForm, name: e.target.value })} className="input" placeholder="e.g. recurring, tax-deductible" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block flex items-center gap-1"><Palette className="w-4 h-4" /> Color</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map(c => (
                <button key={c} type="button" onClick={() => setTagForm({ ...tagForm, color: c })}
                  className={`w-8 h-8 rounded-full transition-transform ${tagForm.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-300 dark:ring-gray-600' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">{editingTag ? 'Update' : 'Create'} Tag</button>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title={editingCat ? 'Edit Category' : 'Add Category'}>
        <form onSubmit={handleCatSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Name</label>
            <input type="text" required value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} className="input" />
          </div>
          {!editingCat && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Type</label>
              <select value={catForm.type} onChange={e => setCatForm({ ...catForm, type: e.target.value })} className="input">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Parent Category (optional)</label>
            <select value={catForm.parent_id} onChange={e => setCatForm({ ...catForm, parent_id: e.target.value })} className="input">
              <option value="">None (top-level)</option>
              {parentCategories
                .filter(p => p.type === catForm.type && (!editingCat || p.id !== editingCat.id))
                .map(p => <option key={p.id} value={p.id}>{p.name}</option>)
              }
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block flex items-center gap-1"><Palette className="w-4 h-4" /> Color</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map(c => (
                <button key={c} type="button" onClick={() => setCatForm({ ...catForm, color: c })}
                  className={`w-8 h-8 rounded-full transition-transform ${catForm.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-300 dark:ring-gray-600' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">{editingCat ? 'Update' : 'Create'} Category</button>
        </form>
      </Modal>

      {/* Account Modal */}
      <Modal open={accModal} onClose={() => setAccModal(false)} title="Add Account">
        <form onSubmit={handleAccSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Account Name</label>
            <input type="text" required value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className="input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Account Type</label>
              <select value={accForm.type} onChange={e => setAccForm({ ...accForm, type: e.target.value })} className="input">
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Currency</label>
              <select value={accForm.currency} onChange={e => setAccForm({ ...accForm, currency: e.target.value })} className="input">
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">Create Account</button>
        </form>
      </Modal>
    </div>
  );
}
