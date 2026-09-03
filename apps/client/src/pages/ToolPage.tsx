import { Badge, Button, Card } from '@localtools/ui';
import { ArrowLeft } from 'lucide-react';
import { badgeLabel, getTool } from '../lib/tool-registry';
import { pdfToolPage } from './ToolPageSpec';
import { imageToolPage } from './ImagePageSpec';
import en from '../i18n/en.json';

const UI = en.ui;

/**
 * Per-tool page: Phase 3+4 wiring — every PDF tool (Group A in the Web
 * Worker, Group B via the local engine) renders its real runner page per
 * the Section 9 pattern. Tools from later phases keep the designed
 * placeholder showing their phase.
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

  // PDF Group A (worker) + Group B (engine) tools carry real pages.
  if (tool.suite === 'pdf') {
    const real = pdfToolPage(tool);
    if (real !== null) return real;
  }

  // Image suite Group A tools carry real pages (image worker).
  if (tool.suite === 'image' && tool.group === 'a') {
    const real = imageToolPage(tool);
    if (real !== null) return real;
  }

  // Everything else: the designed placeholder until its phase lands.
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
