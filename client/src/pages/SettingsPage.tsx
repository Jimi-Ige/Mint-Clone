import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { Category, Account, Institution } from '../types';
import Modal from '../components/ui/Modal';
import { Plus, Trash2, Edit2, Palette } from 'lucide-react';
import PlaidLinkButton from '../components/settings/PlaidLink';
import ConnectedAccounts from '../components/settings/ConnectedAccounts';

const colorOptions = ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#0ea5e9', '#a855f7', '#f43f5e'];

export default function SettingsPage() {
  const { data: categories, refetch: refetchCats } = useApi<Category[]>('/categories');
  const { data: accounts, refetch: refetchAccounts } = useApi<Account[]>('/accounts');
  const { data: institutions, refetch: refetchInstitutions } = useApi<Institution[]>('/plaid/institutions');

  const handlePlaidSuccess = () => {
    refetchInstitutions();
    refetchAccounts();
  };
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'expense', color: '#10b981' });
  const [accModal, setAccModal] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', type: 'checking' });

  const openNewCat = () => { setEditingCat(null); setCatForm({ name: '', type: 'expense', color: '#10b981' }); setCatModal(true); };
  const openEditCat = (c: Category) => { setEditingCat(c); setCatForm({ name: c.name, type: c.type, color: c.color }); setCatModal(true); };

  const handleCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCat) await api.put(`/categories/${editingCat.id}`, catForm);
    else await api.post('/categories', catForm);
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

  const incomeCategories = categories?.filter(c => c.type === 'income') || [];
  const expenseCategories = categories?.filter(c => c.type === 'expense') || [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

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
          <button onClick={() => { setAccForm({ name: '', type: 'checking' }); setAccModal(true); }} className="btn-secondary flex items-center gap-2 text-sm">
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
              {incomeCategories.map(c => (
                <div key={c.id} className="card p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="font-medium text-sm">{c.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditCat(c)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteCat(c.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Expenses</h3>
            <div className="space-y-1">
              {expenseCategories.map(c => (
                <div key={c.id} className="card p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="font-medium text-sm">{c.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditCat(c)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteCat(c.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Account Type</label>
            <select value={accForm.type} onChange={e => setAccForm({ ...accForm, type: e.target.value })} className="input">
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="investment">Investment</option>
            </select>
          </div>
          <button type="submit" className="btn-primary w-full">Create Account</button>
        </form>
      </Modal>
    </div>
  );
}
