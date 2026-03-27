import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Moves focus to main content on route changes for screen reader users.
 */
export function useRouteFocus() {
  const location = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    // Skip initial mount — don't steal focus on first load
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    const main = document.getElementById('main-content');
    if (main) {
      main.focus({ preventScroll: false });
    }
  }, [location.pathname]);
}
