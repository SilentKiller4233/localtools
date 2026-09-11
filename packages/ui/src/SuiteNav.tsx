import type { SuiteId } from '@localtools/shared-types';

export interface SuiteNavItem {
  id: SuiteId;
  label: string;
  /** Single-glyph icon fallback until lucide-static lands in Phase 2. */
  glyph: string;
}

/** The four top-level suites, in nav order per PROJECT_SPEC Section 2. */
export const SUITE_NAV_ITEMS: readonly SuiteNavItem[] = [
  { id: 'pdf', label: 'PDF', glyph: 'PDF' },
  { id: 'media', label: 'Media', glyph: '▶' },
  { id: 'image', label: 'Image', glyph: '▣' },
  { id: 'devtext', label: 'Text & Dev', glyph: '{}' },
];

export interface SuiteNavProps {
  active: SuiteId;
  /** Called on suite click; when omitted, tabs render as inert buttons. */
  onNavigate?: (suite: SuiteId) => void;
  /** Optional right-aligned slot (global search field in Phase 2). */
  trailing?: React.ReactNode;
  /** Accessible name for the nav landmark; defaults to "Suites". */
  navLabel?: string;
}

/**
 * Slim top bar: wordmark left, four segmented suite tabs centered,
 * optional search/trailing content right. Active tab = accent pill.
 * Landmark structure is fixed so every suite page shares it.
 */
export function SuiteNav({
  active,
  onNavigate,
  trailing,
  navLabel,
}: SuiteNavProps): React.ReactNode {
  return (
    <header className="lt-suite-nav">
      <button
        type="button"
        className="lt-skip-link"
        onClick={() => {
          // A hash HREF would fight the app's hash router — focus the
          // landmark programmatically instead (main carries tabIndex=-1).
          const main = document.querySelector('main');
          if (main !== null) {
            main.setAttribute('tabindex', '-1');
            main.focus();
          }
        }}
      >
        Skip to content
      </button>
      <span className="lt-suite-nav__brand">
        <span aria-hidden="true" className="lt-suite-nav__brand-mark">
          ⌘
        </span>
        LocalTools
      </span>
      <nav aria-label={navLabel ?? 'Suites'}>
        <div className="lt-suite-nav__tabs">
          {SUITE_NAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                className={`lt-suite-nav__tab${isActive ? ' lt-suite-nav__tab--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  if (!isActive) onNavigate?.(item.id);
                }}
              >
                <span aria-hidden="true" className="lt-suite-nav__glyph">
                  {item.glyph}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="lt-suite-nav__trailing">{trailing}</div>
    </header>
  );
}
