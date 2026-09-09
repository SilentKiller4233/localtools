/**
 * EngineRunnerPage — the Group B counterpart of ToolRunnerPage (Section 9
 * per-tool pattern): drop zone → options → single primary action → real
 * progress → human-readable engine errors → result downloads.
 *
 * Group A runs in the Web Worker; Group B POSTs to the local engine
 * (engine-client.ts). The component mirrors ToolRunnerPage's layout and
 * error copy so both groups feel identical to the user.
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, DropZone, ProgressBar } from '@localtools/ui';
import { isEngineCallError, runEngineTool, type EngineClientFile } from '../lib/engine-client';
import { toolForEndpoint } from '../lib/desktop-bridge';
import { ToolDownloadPrompt } from './ToolDownloadPrompt';
import { badgeLabel } from '../lib/tool-registry';
import type { RegisteredTool } from '../lib/tool-registry';
import en from '../i18n/en.json';

const UI = en.ui;

export interface EngineRunnerPageProps {
  tool: RegisteredTool;
  /** Accepted file types for the drop zone. */
  accept?: string;
  /** Drop-zone headline hint. */
  hint?: string;
  /** Options panel between drop zone and action. */
  optionsPanel?: ReactNode;
  /** Disabled-reason or undefined when ready. */
  validate?: () => string | undefined;
  /** Serialize options into the engine request body. Receives the count of
   * selected files so multi-file tools can reference every index. */
  buildOptions: (fileCount: number) => Record<string, unknown>;
  /** Engine endpoint path, e.g. '/pdf/deep-compress'. */
  endpoint: string;
  /** Multiple allowed (office to-pdf) vs single. */
  multiple?: boolean;
}

interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

export function EngineRunnerPage({
  tool,
  accept,
  hint,
  optionsPanel,
  validate,
  buildOptions,
  endpoint,
  multiple = false,
}: EngineRunnerPageProps) {
  const [fileList, setFileList] = useState<EngineClientFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<OutputFile[] | undefined>(undefined);
  // Phase 10: when the engine answers tool-unavailable and the desktop
  // shell can supply the missing helper, offer the one-time download.
  const [downloadFor, setDownloadFor] = useState<string | undefined>(undefined);

  const disabledReason =
    fileList.length === 0 ? 'Select a file first' : (validate?.() ?? undefined);

  const onFilesSelected = useCallback((selected: File[]) => {
    setError(undefined);
    setOutputs(undefined);
    void (async () => {
      const inputs: EngineClientFile[] = [];
      for (const file of selected) {
        inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setFileList(inputs);
    })();
  }, []);

  const run = useCallback(async () => {
    if (busy || fileList.length === 0) return;
    setBusy(true);
    setProgress(5);
    // Indeterminate-style liveness while the native tool runs.
    const ticker = setInterval(() => {
      setProgress((p) => (p === undefined ? 5 : Math.min(90, p + 7)));
    }, 400);
    try {
      const options = buildOptions(fileList.length);
      const files = await runEngineTool(endpoint, options, fileList);
      setProgress(100);
      setOutputs(
        files.map((f) => ({
          name: `${f.name}.${f.ext}`,
          bytes: f.bytes,
        })),
      );
    } catch (err) {
      if (isEngineCallError(err) && err.code === 'tool-unavailable') {
        // Spec line 362 + Section 13: in the desktop shell, offer the
        // one-time pinned download for the helper this endpoint needs;
        // in a browser, keep the honest engine-unavailable copy.
        const toolId = await toolForEndpoint(endpoint);
        if (toolId !== undefined) {
          setDownloadFor(toolId);
          setError(undefined);
          return;
        }
      }
      const message = isEngineCallError(err)
        ? err.message
        : 'The operation failed. Please try again.';
      setError(message);
    } finally {
      clearInterval(ticker);
      setBusy(false);
      setProgress(undefined);
    }
  }, [busy, fileList, buildOptions, endpoint]);

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href={`#/suite/${tool.suite}`} className="lt-crumb-link">
          ← {UI.backToSuite}
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
          <Badge tone="setup" dot>
            {badgeLabel(tool.group)}
          </Badge>
        </header>

        <Card className="lt-tool-runner">
          <DropZone
            onFilesSelected={onFilesSelected}
            {...(accept !== undefined ? { accept } : {})}
            multiple={multiple}
            headline={hint ?? 'Drop a file here or click to browse'}
            {...(busy
              ? { state: 'uploading' as const }
              : error !== undefined
                ? { state: 'error' as const }
                : {})}

            {...(fileList.length > 0
              ? {
                  hint: `${String(fileList.length)} file${fileList.length === 1 ? '' : 's'} selected`,
                }
              : {})}
          />

          {fileList.length > 0 ? (
            <ul className="lt-file-list" aria-label="Selected files">
              {fileList.map((f, i) => (
                <li key={`${f.name}-${String(i)}`} className="lt-mono">
                  {f.name}
                  <span className="lt-file-size">{formatBytes(f.bytes.byteLength)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {optionsPanel ?? null}

          {downloadFor !== undefined ? (
            <ToolDownloadPrompt
              toolId={downloadFor}
              onInstalled={() => {
                // Helper landed — the next Run just works (engine env
                // overrides point at the final path already).
                setDownloadFor(undefined);
              }}
              onDismiss={() => {
                setDownloadFor(undefined);
                setError('This tool needs a component that isn’t installed.');
              }}
            />
          ) : null}

          {busy ? <ProgressBar percent={progress ?? 5} label={`Processing ${tool.name}`} /> : null}

          {error !== undefined ? (
            <p className="lt-tool-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="lt-tool-actions">
            <Button onClick={() => void run()} disabled={busy || disabledReason !== undefined}>
              {busy ? 'Working…' : `Run ${tool.name}`}
            </Button>
            {disabledReason !== undefined && !busy ? (
              <span className="lt-tool-hint">{disabledReason}</span>
            ) : null}
          </div>

          {outputs !== undefined && outputs.length > 0 ? (
            <section className="lt-tool-result" aria-label="Result">
              <h2>Result</h2>
              <ul className="lt-output-list">
                {outputs.map((out, i) => (
                  <li key={`${out.name}-${String(i)}`}>
                    <Button
                      variant="outline"
                      onClick={() => {
                        download(out.name, out.bytes);
                      }}
                    >
                      Download {out.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card>
      </main>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
