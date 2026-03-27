import { LogOut } from 'lucide-react';

interface Props {
  onLogout: () => void;
}

export default function SessionExpiredDialog({ onLogout }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <LogOut className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Session Expired
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Your session has expired. Please sign in again to continue.
        </p>
        <button onClick={onLogout} className="btn-primary w-full">
          Sign In
        </button>
      </div>
    </div>
  );
}
