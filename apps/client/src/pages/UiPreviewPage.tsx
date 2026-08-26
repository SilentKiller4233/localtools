import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  DropZone,
  Field,
  Input,
  ProgressBar,
  SuiteNav,
  ThemeToggle,
  ToolCard,
} from '@localtools/ui';

/**
 * Phase 1 acceptance surface (PROJECT_SPEC Section 15): every design token
 * and base component rendered in BOTH themes, including the shared suite
 * navigation. Reachable at /dev/ui-preview.
 *
 * The sample tool names/descriptions mirror the Section 9 screens generated
 * via Stitch MCP; they become real routes in Phases 3–7.
 */
export function UiPreviewPage() {
  const [dropZoneError, setDropZoneError] = useState(false);
  const [filesPicked, setFilesPicked] = useState<string>();

  return (
    <div className="preview-page">
      <SuiteNav
        active="pdf"
        trailing={
          <>
            <Input type="search" placeholder="Search tools…" aria-label="Search tools" />
            <ThemeToggle />
          </>
        }
      />

      <main className="preview-main">
        <p className="preview-overline">LocalTools UI kit</p>
        <h1>Design tokens &amp; base components</h1>
        <p className="preview-lede">
          Phase 1 direction translated from Stitch MCP (see{' '}
          <code>packages/ui/stitch-reference/</code>). Toggle the theme with the ☾ button — every
          element below re-themes live.
        </p>

        <section aria-labelledby="h-suite-nav">
          <h2 id="h-suite-nav">Suite navigation</h2>
          <Card className="preview-block">
            <SuiteNav active="media" />
            <p className="preview-note">
              Slim top bar · wordmark · four segmented suite tabs · active accent pill. The bar at
              the very top of this page is the same component (PDF active).
            </p>
          </Card>
        </section>

        <section aria-labelledby="h-buttons">
          <h2 id="h-buttons">Buttons</h2>
          <Card className="preview-block preview-row">
            <Button>Merge 3 files</Button>
            <Button variant="outline">Clear all</Button>
            <Button variant="ghost">Minify</Button>
            <Button variant="danger">Remove</Button>
            <Button disabled>Disabled</Button>
          </Card>
        </section>

        <section aria-labelledby="h-badges">
          <h2 id="h-badges">Badges</h2>
          <Card className="preview-block preview-row">
            <Badge tone="instant">Instant</Badge>
            <Badge tone="setup">One-time setup</Badge>
            <Badge tone="success" dot>
              Valid JSON
            </Badge>
            <Badge tone="warning" dot>
              Large file
            </Badge>
            <Badge tone="error" dot>
              Failed
            </Badge>
            <Badge tone="info" dot>
              Info
            </Badge>
            <Badge tone="neutral">Neutral</Badge>
          </Card>
        </section>

        <section aria-labelledby="h-tool-grid">
          <h2 id="h-tool-grid">Tool cards</h2>
          <div className="preview-grid">
            <ToolCard
              title="Merge PDF"
              description="Combine multiple PDFs into one"
              badge={{ label: 'Instant', tone: 'instant' }}
              icon={<span aria-hidden="true">⎘</span>}
              href="#/dev/ui-preview"
            />
            <ToolCard
              title="Compress PDF"
              description="Deep compression via local helper"
              badge={{ label: 'One-time setup', tone: 'setup' }}
              icon={<span aria-hidden="true">⤓</span>}
              href="#/dev/ui-preview"
            />
            <ToolCard
              title="Universal Downloader"
              description="Save media from supported sites"
              badge={{ label: 'One-time setup', tone: 'setup' }}
              icon={<span aria-hidden="true">▶</span>}
              href="#/dev/ui-preview"
            />
          </div>
        </section>

        <section aria-labelledby="h-forms">
          <h2 id="h-forms">Fields &amp; inputs</h2>
          <Card className="preview-block preview-forms">
            <Field label="Output format" htmlFor="pv-format" hint="Applied to every selected file">
              <Input id="pv-format" defaultValue="WebP" />
            </Field>
            <Field label="Output file name" htmlFor="pv-name">
              <Input id="pv-name" className="lt-mono" defaultValue="merged.pdf" />
            </Field>
            <Field label="URL" htmlFor="pv-url" hint="http(s) only — validated before fetch">
              <Input id="pv-url" placeholder="https://…" />
            </Field>
          </Card>
        </section>

        <section aria-labelledby="h-progress">
          <h2 id="h-progress">Progress</h2>
          <Card className="preview-block preview-stack">
            <ProgressBar percent={43} label="Download progress" />
            <ProgressBar label="Indeterminate work" />
            <p className="preview-note">
              Thin 3px bar directly under the working area; percentage readouts stay mono in real
              tool pages.
            </p>
          </Card>
        </section>

        <section aria-labelledby="h-dropzone">
          <h2 id="h-dropzone">Drop zone</h2>
          <div className="preview-stack">
            <DropZone
              hint=".pdf · up to 500 MB · files never leave your device"
              onFilesSelected={(files) => {
                setFilesPicked(files.map((f) => f.name).join(', '));
                setDropZoneError(false);
              }}
            />
            {filesPicked !== undefined ? (
              <p className="preview-note lt-mono">picked: {filesPicked}</p>
            ) : null}
            <DropZone compact headline="Add more files" hint="3 selected · 5.1 MB total" />
            <DropZone
              {...(dropZoneError ? ({ state: 'error' } as const) : {})}
              headline={dropZoneError ? "This file type isn't supported" : 'Try me'}
              hint={dropZoneError ? 'received: movie.exe' : '.png .jpg · up to 25 MB'}
            />
            <div className="preview-row">
              <Button
                variant="outline"
                onClick={() => {
                  setDropZoneError((v) => !v);
                }}
              >
                {dropZoneError ? 'Reset drop-zone state' : 'Show error state'}
              </Button>
            </div>
            <DropZone state="uploading" headline="Uploading report.pdf…" hint="65% · 4.2 MB/s" />
          </div>
        </section>
      </main>
    </div>
  );
}
