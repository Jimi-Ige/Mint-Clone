import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-primary-500 dark:text-primary-400 mb-4">404</div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Page not found</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </button>
          <Link to="/" className="btn-primary flex items-center gap-2">
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
