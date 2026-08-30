import { useState } from 'react';
import type { SuiteId } from '@localtools/shared-types';
import { useHashRoute } from './lib/router';
import { getTool } from './lib/tool-registry';
import { SuitePage } from './pages/SuitePage';
import { ToolPage } from './pages/ToolPage';
import { UiPreviewPage } from './pages/UiPreviewPage';

const SUITE_IDS = ['pdf', 'media', 'image', 'devtext'] as const;

/**
 * Phase 2 client shell. Route table (hash-based):
 *   /                    → home = PDF suite grid (suite tabs switch)
 *   /suite/:suite        → suite tool grid
 *   /tool/:tool          → tool page shell (placeholder until its phase)
 *   /dev/ui-preview      → design-system preview (Phase 1 surface, kept)
 */
export function App() {
  const [route] = useHashRoute();
  const [activeSuite, setActiveSuite] = useState<SuiteId>('pdf');

  if (route.startsWith('/dev/ui-preview')) {
    return <UiPreviewPage />;
  }

  const toolMatch = /^\/tool\/([a-z0-9-]+)$/.exec(route);
  if (toolMatch !== null && toolMatch[1] !== undefined) {
    const tool = getTool(toolMatch[1]);
    if (tool !== undefined) {
      return <ToolPage key={tool.id} toolId={tool.id} />;
    }
    // Fall through to home view for unknown tools.
    return <SuitePage suite="pdf" />;
  }

  const suiteMatch = /^\/suite\/([a-z]+)$/.exec(route);
  let suite: SuiteId | null = null;
  if (suiteMatch !== null) {
    const raw = suiteMatch[1];
    if (raw !== undefined && (SUITE_IDS as readonly string[]).includes(raw)) {
      suite = raw as SuiteId;
    }
  }
  if (suite === null && route !== '/' && route !== '') {
    // Unknown path → treat as home rather than a dead end.
    suite = 'pdf';
  }

  if (suite !== null) {
    return (
      <SuitePage
        key={suite}
        suite={suite}
        onNavigate={(s) => {
          setActiveSuite(s);
        }}
      />
    );
  }

  // Home: the PDF suite grid is the landing view; nav switches suites.
  return <SuitePage key="home" suite={activeSuite} />;
}
