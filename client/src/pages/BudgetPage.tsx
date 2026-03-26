import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { Budget, Category } from '../types';
import { formatCurrency, formatMonth } from '../lib/formatters';
import ProgressBar from '../components/ui/ProgressBar';
import Modal from '../components/ui/Modal';
import { Plus, Trash2, Edit2 } from 'lucide-react';

export default function BudgetPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { data: budgets, refetch } = useApi<Budget[]>(`/budgets?month=${month}&year=${year}`);
  const { data: categories } = useApi<Category[]>('/categories');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState({ category_id: '', amount: '' });

  const expenseCategories = categories?.filter(c => c.type === 'expense') || [];
  const totalBudget = budgets?.reduce((s, b) => s + b.amount, 0) || 0;
  const totalSpent = budgets?.reduce((s, b) => s + (b.spent || 0), 0) || 0;

  const openNew = () => {
    setEditing(null);
    setForm({ category_id: '', amount: '' });
    setModalOpen(true);
  };

  const openEdit = (b: Budget) => {
    setEditing(b);
    setForm({ category_id: b.category_id.toString(), amount: b.amount.toString() });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/budgets/${editing.id}`, { amount: Number(form.amount) });
    } else {
      await api.post('/budgets', { category_id: Number(form.category_id), amount: Number(form.amount), month, year });
    }
    setModalOpen(false);
    refetch();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/budgets/${id}`);
    refetch();
  };

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setMonth(m);
    setYear(y);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Budget</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Budget
        </button>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => changeMonth(-1)} className="btn-secondary">&larr;</button>
        <span className="text-lg font-semibold">{formatMonth(month, year)}</span>
        <button onClick={() => changeMonth(1)} className="btn-secondary">&rarr;</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Budget</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalBudget)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Spent</p>
          <p className="text-2xl font-bold mt-1 text-rose-500">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">Remaining</p>
          <p className={`text-2xl font-bold mt-1 ${totalBudget - totalSpent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {formatCurrency(totalBudget - totalSpent)}
          </p>
        </div>
      </div>

      {/* Budget List */}
      <div className="space-y-3">
        {(!budgets || budgets.length === 0) ? (
          <div className="card p-12 text-center text-gray-400">
            <p className="text-lg font-medium mb-1">No budgets set</p>
            <p className="text-sm">Create your first budget to start tracking spending</p>
          </div>
        ) : budgets.map(b => (
          <div key={b.id} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${b.category_color}15` }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.category_color }} />
                </div>
                <div>
                  <p className="font-medium">{b.category_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatCurrency(b.spent || 0)} of {formatCurrency(b.amount)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-sm font-semibold mr-2 ${(b.spent || 0) > b.amount ? 'text-rose-500' : 'text-gray-600 dark:text-gray-400'}`}>
                  {formatCurrency(b.amount - (b.spent || 0))} left
                </span>
                <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <ProgressBar current={b.spent || 0} target={b.amount} color={(b.spent || 0) > b.amount ? '#f43f5e' : b.category_color} showLabel={false} />
          </div>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Budget' : 'Add Budget'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Category</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="input" required>
                <option value="">Select category</option>
                {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Monthly Budget Amount</label>
            <input type="number" step="0.01" min="0" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input" placeholder="0.00" />
          </div>
          <button type="submit" className="btn-primary w-full">{editing ? 'Update' : 'Create'} Budget</button>
        </form>
      </Modal>
    </div>
  );
}
