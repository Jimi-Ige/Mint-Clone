import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

/**
 * Periodically verifies the JWT token is still valid.
 * Returns true if session expired (token was cleared).
 */
export function useSessionCheck() {
  const { token, logout } = useAuth();
  const [expired, setExpired] = useState(false);

  const checkSession = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setExpired(true);
      }
    } catch {
      // Network error — don't treat as expired (could be offline)
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(checkSession, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [token, checkSession]);

  const handleExpiredLogout = useCallback(() => {
    setExpired(false);
    logout();
  }, [logout]);

  return { expired, handleExpiredLogout };
}
