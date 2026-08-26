import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Theme bootstrap (PROJECT_SPEC Section 8): prefers-color-scheme by default,
// manual override persisted locally. Runs before first paint of the tree.
(function bootstrapTheme(): void {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem('localtools.theme');
  } catch {
    // Storage unavailable — fall through to the media-query default.
  }
  const theme =
    stored === 'dark' || stored === 'light'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
