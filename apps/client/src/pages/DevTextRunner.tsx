/**
 * The Text & Dev per-tool page frame (Section 9 pattern, text-first).
 * Most dev tools take pasted text, not files: this frame renders a textarea
 * input (or a drop zone for the file-based tools), the options panel, one
 * primary action, human-readable errors, and a result area with downloads.
 * All processing runs in the devtext Web Worker (Section 8).
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, DropZone, ProgressBar } from '@localtools/ui';
import { isDevTextWorkerError, runDevTextTool } from '../lib/devtext-worker-client';
import type { WorkerFileInput } from '../lib/devtext-worker-client';
import type { RegisteredTool } from '../lib/tool-registry';
import en from '../i18n/en.json';

const UI = en.ui;

const ERROR_TEXT: Record<string, string> = {
  'empty-input': 'The input is empty — paste or select something first.',
  'invalid-input': 'This content could not be parsed. Check the syntax and try again.',
  'invalid-option': 'One of the options above is not valid — check the highlighted fields.',
  'no-inputs': 'Provide the required inputs first.',
  'size-limit': 'This input exceeds the processing size cap.',
  'too-many-files': 'Too many files were supplied.',
  'operation-failed': 'The operation failed. Please try again.',
  'worker-crash': 'The dev-text worker stopped unexpectedly. Try again in a moment.',
};

export interface DevTextToolFrameProps {
  tool: RegisteredTool;
  /** input surface: pasted text, a file drop zone, or fully custom (renderInputs) */
  input: 'text' | 'files' | 'custom';
  /** label for the textarea / drop hint */
  inputLabel?: string;
  placeholder?: string;
  accept?: string;
  multiple?: boolean;
  /** extra named textareas (diff's second side etc.) */
  extraInputs?: { key: string; label: string; placeholder?: string }[];
  optionsPanel?: ReactNode;
  validate?: (inputs: {
    text: string;
    files: WorkerFileInput[];
    extras: Record<string, string>;
  }) => string | undefined;
  buildOptions: (inputs: {
    text: string;
    files: WorkerFileInput[];
    extras: Record<string, string>;
  }) => Record<string, unknown>;
  /** Worker tool id; defaults to the registry id. */
  workerTool?: string;
  renderResult?: (result: unknown) => ReactNode;
}

export function DevTextRunner(props: DevTextToolFrameProps) {
  const { tool } = props;
  const [text, setText] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [fileList, setFileList] = useState<WorkerFileInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<unknown>(undefined);

  const inputs = { text, files: fileList, extras };

  const disabledReason =
    props.input === 'text' && text.trim().length === 0
      ? 'Paste some text first'
      : props.input === 'files' && fileList.length === 0
        ? 'Select file' + (props.multiple === true ? 's' : '') + ' first'
        : (props.validate?.(inputs) ?? undefined);

  const onFilesSelected = useCallback((selected: File[]) => {
    setError(undefined);
    setResult(undefined);
    void (async () => {
      const list: WorkerFileInput[] = [];
      for (const file of selected) {
        list.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setFileList(list);
    })();
  }, []);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setProgress(5);
    setError(undefined);
    try {
      const options = props.buildOptions(inputs);
      const raw = await runDevTextTool(props.workerTool ?? tool.id, options, fileList);
      setResult(raw);
      setProgress(100);
    } catch (err) {
      const message = isDevTextWorkerError(err)
        ? (ERROR_TEXT[err.code] ?? err.message)
        : 'The operation failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inputs captured at click time by design
  }, [busy, fileList, text, extras, props]);

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
          <Badge tone="instant" dot>
            Instant
          </Badge>
        </header>

        <Card className="lt-tool-runner">
          {props.input === 'text' ? (
            <label className="lt-field">
              <span className="lt-field-label">{props.inputLabel ?? 'Input'}</span>
              <textarea
                className="lt-input lt-mono"
                rows={10}
                placeholder={props.placeholder ?? 'Paste your text here…'}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                aria-label={props.inputLabel ?? 'Input'}
              />
            </label>
          ) : null}

          {props.input === 'files' ? (
            <DropZone
              onFilesSelected={onFilesSelected}
              {...(props.accept !== undefined ? { accept: props.accept } : {})}
              multiple={props.multiple === true}
              headline={props.inputLabel ?? 'Drop files here or click to browse'}
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
          ) : null}

          {(props.extraInputs ?? []).map((extra) => (
            <label className="lt-field" key={extra.key}>
              <span className="lt-field-label">{extra.label}</span>
              <textarea
                className="lt-input lt-mono"
                rows={5}
                placeholder={extra.placeholder ?? ''}
                value={extras[extra.key] ?? ''}
                onChange={(e) => {
                  setExtras((prev) => ({ ...prev, [extra.key]: e.target.value }));
                }}
                aria-label={extra.label}
              />
            </label>
          ))}

          {props.optionsPanel ?? null}

          {busy ? <ProgressBar percent={progress ?? 5} label={`Running ${tool.name}`} /> : null}

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

          {result !== undefined ? (
            <section className="lt-tool-result" aria-label="Result">
              <h2>Result</h2>
              {props.renderResult !== undefined ? (
                props.renderResult(result)
              ) : (
                <pre className="lt-diff-pre lt-mono">{formatResult(result)}</pre>
              )}
            </section>
          ) : null}
        </Card>
      </main>
    </div>
  );
}

/** Default result rendering: pretty JSON, or the bytes/outputs of file tools. */
function formatResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result instanceof Uint8Array) return `(${String(result.byteLength)} bytes — download below)`;
  return JSON.stringify(result, null, 2);
}

/** Collect downloadable outputs from a worker result (zip, md-pdf, qr png…). */
export function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
