import { Badge, Button, Card } from '@localtools/ui';
import { ArrowLeft } from 'lucide-react';
import { badgeLabel, getTool } from '../lib/tool-registry';
import en from '../i18n/en.json';

const UI = en.ui;

/**
 * Phase 2 tool shell: correct route, identity, and designed empty state.
 * Real tool implementations replace the placeholder panel suite by suite
 * (Phases 3–9); the drop-zone/options/action frame from the Stitch screens
 * is the template they grow into.
 */
export function ToolPage({ toolId }: { toolId: string }) {
  const tool = getTool(toolId);

  if (tool === undefined) {
    return (
      <div className="lt-page">
        <main className="lt-main">
          <Card className="lt-empty">
            <p>Unknown tool.</p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href={`#/suite/${tool.suite}`} className="lt-crumb-link">
          <ArrowLeft size={14} aria-hidden="true" /> {UI.backToSuite}
        </a>
      </nav>
      <main className="lt-main lt-tool-page">
        <header className="lt-tool-header">
          <span aria-hidden="true" className="lt-tool-hero-icon">
            <tool.icon size={22} />
          </span>
          <div>
            <h1>{tool.name}</h1>
            <p className="lt-suite-caption">{tool.description}</p>
          </div>
          <Badge tone={tool.group === 'a' ? 'instant' : 'setup'} dot>
            {badgeLabel(tool.group)}
          </Badge>
        </header>

        <Card className="lt-tool-placeholder">
          {/* Static preview of the shared drop zone; the interactive
              component arrives with each tool's implementation phase. */}
          <div className="lt-dropzone" aria-hidden="true">
            <div className="lt-dropzone__content">
              <span className="lt-dropzone__icon">⬆</span>
              <p className="lt-dropzone__headline">Drop files here</p>
            </div>
          </div>
          <p className="lt-placeholder-note">{UI.placeholderNote}</p>
          <Button disabled>Phase {tool.phase}</Button>
        </Card>
      </main>
    </div>
  );
}
