import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ui/ErrorBoundary';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import SessionExpiredDialog from './components/ui/SessionExpiredDialog';
import OfflineBanner from './components/ui/OfflineBanner';
import { DashboardSkeleton } from './components/ui/Skeleton';
import { useSessionCheck } from './hooks/useSessionCheck';
import { useOnlineStatus } from './hooks/useOnlineStatus';

// Lazy-loaded route pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const RecurringPage = lazy(() => import('./pages/RecurringPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Suspense>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { expired, handleExpiredLogout } = useSessionCheck();
  const online = useOnlineStatus();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (!user.onboarding_completed) return <OnboardingWizard />;

  return (
    <>
      {!online && <OfflineBanner />}
      {expired && <SessionExpiredDialog onLogout={handleExpiredLogout} />}
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<PageSuspense><DashboardPage /></PageSuspense>} />
          <Route path="/transactions" element={<PageSuspense><TransactionsPage /></PageSuspense>} />
          <Route path="/budget" element={<PageSuspense><BudgetPage /></PageSuspense>} />
          <Route path="/goals" element={<PageSuspense><GoalsPage /></PageSuspense>} />
          <Route path="/recurring" element={<PageSuspense><RecurringPage /></PageSuspense>} />
          <Route path="/insights" element={<PageSuspense><InsightsPage /></PageSuspense>} />
          <Route path="/reports" element={<PageSuspense><ReportsPage /></PageSuspense>} />
          <Route path="/settings" element={<PageSuspense><SettingsPage /></PageSuspense>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
