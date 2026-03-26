import { useState } from 'react';
import { Institution } from '../../types';
import { api } from '../../lib/api';
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface ConnectedAccountsProps {
  institutions: Institution[];
  onRefresh: () => void;
}

export default function ConnectedAccounts({ institutions, onRefresh }: ConnectedAccountsProps) {
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncResult, setSyncResult] = useState<{ id: number; message: string } | null>(null);

  const handleSync = async (id: number) => {
    setSyncing(id);
    setSyncResult(null);
    try {
      const result = await api.post<{ added: number; modified: number; removed: number }>(`/plaid/sync/${id}`, {});
      setSyncResult({ id, message: `Synced: ${result.added} added, ${result.modified} modified, ${result.removed} removed` });
      onRefresh();
    } catch (err: any) {
      setSyncResult({ id, message: err.message });
    } finally {
      setSyncing(null);
    }
  };

  const handleUnlink = async (id: number) => {
    if (!confirm('Unlink this bank account? Connected accounts and their Plaid-imported transactions will remain.')) return;
    await api.delete(`/plaid/institutions/${id}`);
    onRefresh();
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'login_required': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  if (institutions.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No bank accounts linked yet. Use the button above to connect your bank via Plaid.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {institutions.map(inst => (
        <div key={inst.id} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {statusIcon(inst.status)}
              <span className="font-medium">{inst.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {inst.last_sync && (
                <span className="text-xs text-gray-400">
                  Last sync: {new Date(inst.last_sync).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => handleSync(inst.id)}
                disabled={syncing === inst.id}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                title="Sync now"
              >
                <RefreshCw className={`w-4 h-4 ${syncing === inst.id ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => handleUnlink(inst.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors"
                title="Unlink"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {inst.status === 'login_required' && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
              Bank login expired. Please re-link this account.
            </p>
          )}

          {inst.accounts.length > 0 && (
            <div className="space-y-1">
              {inst.accounts.map(acct => (
                <div key={acct.id} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-gray-50 dark:bg-gray-800/50">
                  <span className="text-gray-600 dark:text-gray-400">{acct.name} <span className="text-xs capitalize">({acct.type})</span></span>
                  <span className="font-medium">${Number(acct.balance).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {syncResult?.id === inst.id && (
            <p className="text-xs text-gray-500 mt-2">{syncResult.message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
