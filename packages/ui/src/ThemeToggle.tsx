import { useEffect, useState } from 'react';

export interface ThemeToggleProps {
  /** Current theme; when omitted, reads/persists `data-theme` on <html>. */
  value?: 'light' | 'dark';
  onChange?: (theme: 'light' | 'dark') => void;
}

function readInitialTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

/**
 * Manual light/dark override control (PROJECT_SPEC Section 8). Writes
 * `data-theme` on <html> and persists to localStorage; apps bootstrap the
 * initial attribute before first paint (see apps/client/src/main.tsx).
 */
export function ThemeToggle({ value, onChange }: ThemeToggleProps): React.ReactNode {
  const [current, setCurrent] = useState<'light' | 'dark'>(readInitialTheme);

  // Runs on mount too — rewriting the bootstrapped value is idempotent, and
  // skipping the first run (a previous mounted-ref guard) silently dropped
  // the first user interaction's persistence.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', current);
    try {
      window.localStorage.setItem('localtools.theme', current);
    } catch {
      // Storage unavailable (private mode etc.) — override just won't persist.
    }
    onChange?.(current);
  }, [current, onChange]);

  // Controlled mode: reflect the prop without re-writing storage.
  useEffect(() => {
    if (value !== undefined) document.documentElement.setAttribute('data-theme', value);
  }, [value]);

  return (
    <button
      type="button"
      className="lt-theme-toggle"
      aria-label={`Switch to ${current === 'light' ? 'dark' : 'light'} theme`}
      onClick={() => {
        setCurrent((t) => (t === 'light' ? 'dark' : 'light'));
      }}
    >
      {current === 'light' ? '☾' : '☀'}
    </button>
  );
}
