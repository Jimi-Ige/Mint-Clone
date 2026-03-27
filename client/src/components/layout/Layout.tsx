import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Moon, Sun, LogOut, Menu } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function Layout() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Skip to content link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:bg-primary-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 flex items-center justify-between gap-3 px-4 md:px-6 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-30">
          {/* Left: hamburger + user name */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors md:hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{user?.name}</span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 md:gap-3">
            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6 overflow-auto outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
