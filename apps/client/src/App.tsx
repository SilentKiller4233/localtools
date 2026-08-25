import type { SuiteId } from '@localtools/shared-types';
import { UI_PACKAGE_STUB } from '@localtools/ui';

/**
 * Phase 0 shell stub. Real routing, suite nav, and tool grids arrive in
 * Phases 1–2 after the Stitch MCP design pass (PROJECT_SPEC Sections 7/9).
 */
const SUITES: ReadonlyArray<{ id: SuiteId; name: string; status: string }> = [
  { id: 'pdf', name: 'PDF Tools', status: 'Phase 3' },
  { id: 'media', name: 'Media Tools', status: 'Phases 7–9' },
  { id: 'image', name: 'Image Tools', status: 'Phase 5' },
  { id: 'devtext', name: 'Text & Dev Tools', status: 'Phase 6' },
];

export function App() {
  return (
    <main>
      <h1>LocalTools</h1>
      <p>Self-hosted, privacy-first quality-of-life toolkit. Scaffold stub (Phase 0).</p>
      <ul aria-label="Suites">
        {SUITES.map((suite) => (
          <li key={suite.id}>
            <strong>{suite.name}</strong> — planned for {suite.status}
          </li>
        ))}
      </ul>
      <p>
        <small>
          Shared UI package linked: <code>{UI_PACKAGE_STUB}</code>
        </small>
      </p>
    </main>
  );
}
