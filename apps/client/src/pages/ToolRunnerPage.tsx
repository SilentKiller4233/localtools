import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, DropZone, ProgressBar } from '@localtools/ui';
import { isToolWorkerError, runTool } from '../lib/pdf-worker-client';
import type { WorkerFileInput } from '../lib/pdf-worker-client';
import { badgeLabel } from '../lib/tool-registry';
import type { RegisteredTool } from '../lib/tool-registry';
import en from '../i18n/en.json';

const UI = en.ui;

/** Human-readable rendering of the pdf-core error taxonomy (Section 9). */
const ERROR_TEXT: Record<string, string> = {
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-pdf': 'This file could not be read as a PDF. It may be damaged or not a PDF at all.',
  'encrypted-pdf':
    'This PDF is password-protected. Use the Unlock tool first, then come back and retry.',
  'page-range': 'The page selection is empty or outside this document — check the page numbers.',
  'no-inputs': 'Select at least one file first.',
  'single-file-only': 'This tool processes one file at a time.',
  'size-limit': 'This file is larger than the 500MB processing cap.',
  'zero-page-pdf': 'This PDF contains no pages.',
  'invalid-option': 'One of the settings above is not valid — check the highlighted fields.',
  'qpdf-failed': 'The operation failed — the file or password may be invalid.',
  'worker-crash': 'The processing worker stopped unexpectedly. Try again in a moment.',
};

export interface ToolFileSpec {
  /** How many files the tool takes. */
  count: 'one' | 'two' | 'many';
  /** Drop-zone accept attribute. */
  accept?: string;
  /** Extra hint under the headline. */
  hint?: string;
  /** Re-select allowed while showing the current selection compactly. */
  compactAfterSelect?: boolean;
}

export interface ToolRunnerPageProps {
  tool: RegisteredTool;
  files: ToolFileSpec;
  /** Options panel rendered between drop zone and action. */
  optionsPanel?: ReactNode;
  /** Validation hook returning a disabled-reason, or undefined when ready. */
  validate?: () => string | undefined;
  /** Serialize the options into the worker request payload (may be async —
   * e.g. the signature pad exports its PNG). */
  buildOptions: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Worker tool id (defaults to the registry id). */
  workerTool?: string;
  /** Called once on mount with a function that injects extra input files
   * (used by the scan-to-pdf camera to add captured pages). */
  registerInject?: (inject: (files: WorkerFileInput[]) => void) => void;
  /** Result renderer override (compare table, pdf-to-image grid, …). */
  renderResult?: (result: unknown, files: WorkerFileInput[]) => ReactNode;
}

interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

const PDF_MIME = 'application/pdf,.pdf';

/**
 * The per-tool page frame (Section 9): drop zone → options → single primary
 * action → real progress → human-readable errors → result with download.
 * All processing runs in the Web Worker (Section 8); the main thread only
 * renders. This component IS the wiring for every PDF Group A tool.
 */
export function ToolRunnerPage({
  tool,
  files: fileSpec,
  optionsPanel,
  validate,
  buildOptions,
  workerTool,
  registerInject,
  renderResult,
}: ToolRunnerPageProps) {
  const [fileList, setFileList] = useState<WorkerFileInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<OutputFile[] | undefined>(undefined);
  const [result, setResult] = useState<unknown>(undefined);

  useEffect(() => {
    if (registerInject === undefined) return;
    registerInject((files) => {
      setFileList((prev) => [...prev, ...files]);
    });
  }, [registerInject]);

  const disabledReason =
    fileList.length === 0
      ? 'Select file' + (fileSpec.count === 'one' || fileSpec.count === 'two' ? '' : 's') + ' first'
      : fileSpec.count === 'one' && fileList.length > 1
        ? 'This tool takes one file'
        : fileSpec.count === 'two' && fileList.length !== 2
          ? 'Select exactly two files'
          : (validate?.() ?? undefined);

  const onFilesSelected = useCallback((selected: File[]) => {
    setError(undefined);
    setOutputs(undefined);
    setResult(undefined);
    void (async () => {
      const inputs: WorkerFileInput[] = [];
      for (const file of selected) {
        inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setFileList(inputs);
    })();
  }, []);

  const run = useCallback(async () => {
    if (busy || fileList.length === 0) return;
    setBusy(true);
    setProgress(1);
    setError(undefined);
    setOutputs(undefined);
    setResult(undefined);
    try {
      const options = await buildOptions();
      const raw = await runTool(workerTool ?? tool.id, options, fileList);
      setResult(raw);
      setProgress(100);
      // Standard outputs: Uint8Array single, { parts } multi, image array.
      const outs: OutputFile[] = [];
      if (raw instanceof Uint8Array) {
        outs.push({
          name: makeName(fileList[0]?.name ?? 'document.pdf', 'pdf'),
          bytes: raw,
        });
      } else if (typeof raw === 'string') {
        // Text-producing tools (pdf-to-text) download as .txt.
        outs.push({
          name: makeName(fileList[0]?.name ?? 'document.pdf', 'txt'),
          bytes: new TextEncoder().encode(raw),
        });
      } else if (isSplitOutput(raw)) {
        raw.parts.forEach((part, i) => {
          outs.push({
            name: makeName(fileList[0]?.name ?? 'document.pdf', 'pdf', `-${String(i + 1)}`),
            bytes: part,
          });
        });
      } else if (isCompressResult(raw)) {
        outs.push({
          name: makeName(fileList[0]?.name ?? 'document.pdf', 'pdf'),
          bytes: raw.output,
        });
      } else if (isRedactResult(raw)) {
        outs.push({
          name: makeName(fileList[0]?.name ?? 'document.pdf', 'pdf'),
          bytes: raw.output,
        });
      } else if (isSignResult(raw)) {
        outs.push({
          name: makeName(fileList[0]?.name ?? 'document.pdf', 'pdf'),
          bytes: raw.output,
        });
      } else if (isRenderedPages(raw)) {
        for (const page of raw) {
          outs.push({
            name: makeName(fileList[0]?.name ?? 'document.pdf', page.format),
            bytes: page.bytes,
          });
        }
      }
      setOutputs(outs.length > 0 ? outs : undefined);
    } catch (err) {
      const message = isToolWorkerError(err)
        ? (ERROR_TEXT[err.code] ?? err.message)
        : 'The operation failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }, [busy, fileList, buildOptions, tool.id, workerTool]);

  const effectiveAccept = fileSpec.accept ?? PDF_MIME;

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
          <Badge tone={tool.group === 'a' ? 'instant' : 'setup'} dot>
            {badgeLabel(tool.group)}
          </Badge>
        </header>

        <Card className="lt-tool-runner">
          <DropZone
            onFilesSelected={onFilesSelected}
            accept={effectiveAccept}
            multiple={fileSpec.count !== 'one'}
            headline={fileSpec.hint ?? 'Drop files here or click to browse'}
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

          {busy ? <ProgressBar percent={progress ?? 1} label={`Processing ${tool.name}`} /> : null}

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
              {renderResult !== undefined ? renderResult(result, fileList) : null}
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

function makeName(original: string, ext: string, suffix = ''): string {
  const base = original.replace(/\.[^.]+$/, '');
  return `${base}-localtools${suffix}.${ext}`;
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

// Narrow unknown worker results into the shapes pdf-core returns.
function isSplitOutput(r: unknown): r is { parts: Uint8Array[] } {
  return typeof r === 'object' && r !== null && Array.isArray((r as { parts?: unknown }).parts);
}
function isCompressResult(
  r: unknown,
): r is { output: Uint8Array; originalSize: number; newSize: number } {
  return (
    typeof r === 'object' && r !== null && (r as { output?: unknown }).output instanceof Uint8Array
  );
}
function isRedactResult(r: unknown): r is { output: Uint8Array; removedTextRuns: number } {
  return (
    typeof r === 'object' &&
    r !== null &&
    (r as { output?: unknown }).output instanceof Uint8Array &&
    'removedTextRuns' in r
  );
}
function isSignResult(r: unknown): r is { output: Uint8Array; applied: unknown } {
  return (
    typeof r === 'object' &&
    r !== null &&
    (r as { output?: unknown }).output instanceof Uint8Array &&
    'applied' in r
  );
}
function isRenderedPages(
  r: unknown,
): r is { bytes: Uint8Array; format: string; pageNumber: number }[] {
  return (
    Array.isArray(r) &&
    r.length > 0 &&
    typeof r[0] === 'object' &&
    r[0] !== null &&
    (r[0] as { bytes?: unknown }).bytes instanceof Uint8Array
  );
}
