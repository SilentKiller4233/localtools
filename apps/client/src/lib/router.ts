import { useEffect, useState } from 'react';

/**
 * Minimal hash router for Phase 2 (real routes arrive with their suites;
 * this stays deliberately dependency-free). Path lives after '#' — e.g.
 * #/suite/pdf — with window.location.pathname as the initial fallback so
 * /dev/ui-preview works when pasted directly.
 */
export function useHashRoute(): [string, (path: string) => void] {
  const read = (): string => window.location.hash.replace(/^#/, '') || window.location.pathname;
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = (): void => {
      setRoute(read());
      // Route changes should land at the top of the new view.
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  const navigate = (path: string): void => {
    if (path === route) return;
    window.location.hash = path;
  };

  return [route, navigate];
}
