import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { SavingsGoal } from '../types';
import { formatCurrency } from '../lib/formatters';
import ProgressBar from '../components/ui/ProgressBar';
import Modal from '../components/ui/Modal';
import { Plus, Trash2, DollarSign, Trophy, Target } from 'lucide-react';

const goalColors = ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

export default function GoalsPage() {
  const { data: goals, refetch } = useApi<SavingsGoal[]>('/goals');
  const [modalOpen, setModalOpen] = useState(false);
  const [contributeModal, setContributeModal] = useState<SavingsGoal | null>(null);
  const [form, setForm] = useState({ name: '', target_amount: '', deadline: '', color: '#10b981' });
  const [contributeAmount, setContributeAmount] = useState('');

  const openNew = () => {
    setForm({ name: '', target_amount: '', deadline: '', color: goalColors[Math.floor(Math.random() * goalColors.length)] });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/goals', { ...form, target_amount: Number(form.target_amount), deadline: form.deadline || null });
    setModalOpen(false);
    refetch();
  };

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributeModal) return;
    await api.patch(`/goals/${contributeModal.id}/contribute`, { amount: Number(contributeAmount) });
    setContributeModal(null);
    setContributeAmount('');
    refetch();
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/goals/${id}`);
    refetch();
  };

  const activeGoals = goals?.filter(g => g.status === 'active') || [];
  const completedGoals = goals?.filter(g => g.status === 'completed') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Savings Goals</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Goal
        </button>
      </div>

      {/* Active Goals */}
      {activeGoals.length === 0 && completedGoals.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium mb-1">No savings goals yet</p>
          <p className="text-sm">Set your first goal and start saving</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeGoals.map(goal => (
              <div key={goal.id} className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${goal.color}15` }}>
                      <Target className="w-5 h-5" style={{ color: goal.color }} />
                    </div>
                    <div>
                      <p className="font-semibold">{goal.name}</p>
                      {goal.deadline && <p className="text-xs text-gray-500 dark:text-gray-400">Due {new Date(goal.deadline).toLocaleDateString()}</p>}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(goal.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">{formatCurrency(goal.current_amount)}</span>
                    <span className="text-gray-500 dark:text-gray-400">{formatCurrency(goal.target_amount)}</span>
                  </div>
                  <ProgressBar current={goal.current_amount} target={goal.target_amount} color={goal.color} showLabel={false} />
                </div>

                <button
                  onClick={() => { setContributeModal(goal); setContributeAmount(''); }}
                  className="w-full btn-secondary flex items-center justify-center gap-2 text-sm"
                >
                  <DollarSign className="w-4 h-4" /> Add Funds
                </button>
              </div>
            ))}
          </div>

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" /> Completed
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedGoals.map(goal => (
                  <div key={goal.id} className="card p-5 opacity-75">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-semibold">{goal.name}</p>
                        <p className="text-sm text-emerald-500 font-medium">{formatCurrency(goal.target_amount)} saved!</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* New Goal Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Savings Goal">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Goal Name</label>
            <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Emergency Fund" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Target Amount</label>
            <input type="number" step="0.01" min="0" required value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} className="input" placeholder="0.00" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Deadline (optional)</label>
            <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="input" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Color</label>
            <div className="flex gap-2">
              {goalColors.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-300 dark:ring-gray-600' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">Create Goal</button>
        </form>
      </Modal>

      {/* Contribute Modal */}
      <Modal open={!!contributeModal} onClose={() => setContributeModal(null)} title={`Add Funds to ${contributeModal?.name}`}>
        <form onSubmit={handleContribute} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Amount</label>
            <input type="number" step="0.01" min="0.01" required value={contributeAmount} onChange={e => setContributeAmount(e.target.value)} className="input" placeholder="0.00" />
          </div>
          {contributeModal && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Remaining: {formatCurrency(contributeModal.target_amount - contributeModal.current_amount)}
            </p>
          )}
          <button type="submit" className="btn-primary w-full">Add Funds</button>
        </form>
      </Modal>
    </div>
  );
}
