import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
      <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
        A new version is available.
      </p>
      <button
        onClick={() => updateServiceWorker(true)}
        className="btn-primary text-sm flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        Update now
      </button>
    </div>
  );
}
