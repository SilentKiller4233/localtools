import { useEffect, useState } from 'react';
import type { SuiteId } from '@localtools/shared-types';
import { SuiteNav } from '@localtools/ui';
import { UiPreviewPage } from './pages/UiPreviewPage';

/**
 * Phase 1 shell: hash routing between the placeholder home page and the
 * /dev/ui-preview acceptance surface. Real per-suite routes arrive in
 * Phase 2 (react-router), so this router is deliberately minimal.
 */
export function App() {
  const [route, setRoute] = useState(
    () => window.location.hash.replace(/^#/, '') || window.location.pathname,
  );
  const [activeSuite, setActiveSuite] = useState<SuiteId>('pdf');

  // Registered once with cleanup — a render-body listener would stack up
  // under StrictMode's double mount.
  useEffect(() => {
    const onRouteChange = () => {
      setRoute(window.location.hash.replace(/^#/, '') || window.location.pathname);
    };
    window.addEventListener('hashchange', onRouteChange);
    return () => {
      window.removeEventListener('hashchange', onRouteChange);
    };
  }, []);

  if (route.startsWith('/dev/ui-preview')) {
    return <UiPreviewPage />;
  }

  return (
    <div>
      <SuiteNav
        active={activeSuite}
        onNavigate={(suite) => {
          setActiveSuite(suite);
        }}
        trailing={
          <a className="app-dev-link" href="#/dev/ui-preview">
            UI preview →
          </a>
        }
      />
      <main className="app-main">
        <h1>LocalTools</h1>
        <p>
          Self-hosted, privacy-first quality-of-life toolkit. Suite pages and tool grids land in
          Phase 2 — the Phase 1 design direction lives at{' '}
          <a href="#/dev/ui-preview">/dev/ui-preview</a>.
        </p>
      </main>
    </div>
  );
}
