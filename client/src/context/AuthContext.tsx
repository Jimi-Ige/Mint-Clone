import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface UserPreferences {
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  defaultPage?: string;
  compactMode?: boolean;
  showCents?: boolean;
  emailNotifications?: boolean;
  budgetAlerts?: boolean;
  billReminders?: boolean;
  reminderDays?: number;
}

interface User {
  id: number;
  email: string;
  name: string;
  base_currency: string;
  preferences: UserPreferences;
  onboarding_completed: boolean;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  updateBaseCurrency: (currency: string) => void;
  updateUser: (updates: Partial<User>) => void;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null, token: null, loading: true,
  login: async () => {}, register: async () => {}, logout: () => {},
  updateBaseCurrency: () => {}, updateUser: () => {}, completeOnboarding: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => setUser({ ...data, base_currency: data.base_currency || 'USD', preferences: data.preferences || {}, onboarding_completed: data.onboarding_completed ?? true }))
        .catch(() => { setToken(null); localStorage.removeItem('token'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser({ ...data.user, base_currency: data.user.base_currency || 'USD', preferences: data.user.preferences || {}, onboarding_completed: data.user.onboarding_completed ?? true });
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser({ ...data.user, base_currency: data.user.base_currency || 'USD', preferences: data.user.preferences || {}, onboarding_completed: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  const updateBaseCurrency = useCallback((currency: string) => {
    setUser(prev => prev ? { ...prev, base_currency: currency } : prev);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  const completeOnboarding = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to complete onboarding');
      setUser(prev => prev ? { ...prev, onboarding_completed: true } : prev);
    } catch {
      // Even if the server call fails, let the user proceed to the dashboard
      setUser(prev => prev ? { ...prev, onboarding_completed: true } : prev);
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateBaseCurrency, updateUser, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
