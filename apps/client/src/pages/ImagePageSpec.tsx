/**
 * Per-tool page specs for the 14 Image Group A tools (Section 9 pattern).
 * Every tool = ToolRunnerPage (image worker offload) + options panel.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Field, Input } from '@localtools/ui';
import type { RegisteredTool } from '../lib/tool-registry';

interface ToolPageSpec {
  tool: RegisteredTool;
}

const IMAGE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/avif,image/bmp,.png,.jpg,.jpeg,.webp,.avif,.bmp';
const HEIC_ACCEPT = 'image/heic,.heic,.heif';

/** Image tools run on their own worker with the same ToolRunnerPage frame;
 * workerTool routes to the image worker instead of the pdf worker. */
function ImageRunner({
  tool,
  files,
  optionsPanel,
  validate,
  buildOptions,
  imageTool,
  renderResult,
}: {
  tool: RegisteredTool;
  files: { count: 'one' | 'many'; accept?: string; hint?: string };
  optionsPanel?: ReactNode;
  validate?: () => string | undefined;
  buildOptions: () => Record<string, unknown>;
  imageTool: string;
  renderResult?: (result: unknown, files: { name: string; bytes: Uint8Array }[]) => ReactNode;
}) {
  // ToolRunnerPage hardcodes the pdf worker; the image path goes through
  // the same frame via a shim that routes to the image worker dispatcher.
  return (
    <ImageToolRunnerShim
      tool={tool}
      files={files}
      {...(optionsPanel !== undefined ? { optionsPanel } : {})}
      {...(validate !== undefined ? { validate } : {})}
      buildOptions={buildOptions}
      imageTool={imageTool}
      {...(renderResult !== undefined ? { renderResult } : {})}
    />
  );
}

import { runImageTool, runImageToolWithProgress } from '../lib/image-worker-client';
import type { WorkerFileInput } from '../lib/image-worker-client';
import { friendlyError } from '../lib/tool-errors';
import { Badge, Button, Card, DropZone, ProgressBar } from '@localtools/ui';
import en from '../i18n/en.json';

const UI = en.ui;

/** The image-suite twin of ToolRunnerPage (worker run + Section 9 frame). */
function ImageToolRunnerShim({
  tool,
  files: fileSpec,
  optionsPanel,
  validate,
  buildOptions,
  imageTool,
  renderResult,
}: {
  tool: RegisteredTool;
  files: { count: 'one' | 'many'; accept?: string; hint?: string };
  optionsPanel?: ReactNode;
  validate?: () => string | undefined;
  buildOptions: () => Record<string, unknown>;
  imageTool: string;
  renderResult?: (result: unknown, files: WorkerFileInput[]) => ReactNode;
}) {
  return ImageToolRunnerImpl({
    tool,
    fileSpec,
    ...(optionsPanel !== undefined ? { optionsPanel } : {}),
    ...(validate !== undefined ? { validate } : {}),
    buildOptions,
    imageTool,
    ...(renderResult !== undefined ? { renderResult } : {}),
  });
}

import { useCallback, useEffect } from 'react';

function ImageToolRunnerImpl(props: {
  tool: RegisteredTool;
  fileSpec: { count: 'one' | 'many'; accept?: string; hint?: string };
  optionsPanel?: ReactNode;
  validate?: () => string | undefined;
  buildOptions: () => Record<string, unknown>;
  imageTool: string;
  renderResult?: (result: unknown, files: WorkerFileInput[]) => ReactNode;
}): ReactNode {
  const { tool, fileSpec, optionsPanel, validate, buildOptions, imageTool, renderResult } = props;
  const [fileList, setFileList] = useState<WorkerFileInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<
    { name: string; ext: string; bytes: Uint8Array }[] | undefined
  >(undefined);
  const [result, setResult] = useState<unknown>(undefined);

  useEffect(() => {
    // no inject flow for image tools yet
  }, []);

  const disabledReason =
    fileList.length === 0
      ? 'Select file' + (fileSpec.count === 'many' ? 's' : '') + ' first'
      : fileSpec.count === 'one' && fileList.length > 1
        ? 'This tool takes one file'
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
    setProgress(3);
    try {
      const options = buildOptions();
      // Phase 11: batch runs report real per-file progress (the worker
      // emits {progress:{done,total}} after every file); single-file
      // tools keep the simple 3→100 step.
      const isBatch = imageTool === 'batch-image-processing';
      const raw = isBatch
        ? await runImageToolWithProgress(imageTool, options, fileList, (done, total) => {
            if (total > 0) setProgress(Math.round((done / total) * 100));
          })
        : await runImageTool(imageTool, options, fileList);
      setResult(raw);
      setProgress(100);
      const outs: { name: string; ext: string; bytes: Uint8Array }[] = [];
      if (raw instanceof Uint8Array) {
        outs.push({
          name: baseNameOf(fileList[0]?.name ?? 'image'),
          ext: guessExt(raw),
          bytes: raw,
        });
      } else if (isCompressed(raw)) {
        outs.push({
          name: baseNameOf(fileList[0]?.name ?? 'image'),
          ext: guessExt(raw.output),
          bytes: raw.output,
        });
      } else if (isResized(raw)) {
        outs.push({
          name: baseNameOf(fileList[0]?.name ?? 'image'),
          ext: guessExt(raw.output),
          bytes: raw.output,
        });
      } else if (isBgResult(raw)) {
        outs.push({
          name: baseNameOf(fileList[0]?.name ?? 'image'),
          ext: 'png',
          bytes: raw.output,
        });
      } else if (isBatchOuts(raw)) {
        // Phase 11: names come from the worker (original file names,
        // order preserved) — ext from each output.
        for (const o of raw) {
          outs.push({ name: baseNameOf(o.name), ext: o.ext, bytes: o.bytes });
        }
      }
      setOutputs(outs.length > 0 ? outs : undefined);
    } catch (err) {
      setError(friendlyError(err, 'image'));
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }, [busy, fileList, buildOptions, imageTool]);

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
          <DropZone
            onFilesSelected={onFilesSelected}
            accept={fileSpec.accept ?? IMAGE_ACCEPT}
            multiple={fileSpec.count === 'many'}
            headline={fileSpec.hint ?? 'Drop an image here or click to browse'}
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

          {busy ? <ProgressBar percent={progress ?? 3} label={`Processing ${tool.name}`} /> : null}

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
                        download(`${out.name}-localtools.${out.ext}`, out.bytes);
                      }}
                    >
                      Download {out.name}.{out.ext}
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

function baseNameOf(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function guessExt(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x52 && bytes[9] === 0x45) return 'webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  return 'png';
}

function isCompressed(
  r: unknown,
): r is { output: Uint8Array; originalSize: number; newSize: number } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'output' in r &&
    'newSize' in r &&
    (r as { output?: unknown }).output instanceof Uint8Array
  );
}

function isResized(r: unknown): r is { output: Uint8Array; width: number; height: number } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'output' in r &&
    'width' in r &&
    (r as { output?: unknown }).output instanceof Uint8Array
  );
}

function isBgResult(r: unknown): r is { output: Uint8Array; foregroundRatio: number } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'foregroundRatio' in r &&
    (r as { output?: unknown }).output instanceof Uint8Array
  );
}

function isBatchOuts(r: unknown): r is { name: string; ext: string; bytes: Uint8Array }[] {
  return (
    Array.isArray(r) &&
    r.length > 0 &&
    typeof r[0] === 'object' &&
    r[0] !== null &&
    'bytes' in r[0] &&
    (r[0] as { bytes?: unknown }).bytes instanceof Uint8Array
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

/* ------------------------------------------------------------------ */
/* Page specs                                                          */
/* ------------------------------------------------------------------ */

export function imageToolPage(tool: RegisteredTool): ReactNode {
  switch (tool.id) {
    case 'image-converter':
      return <ConverterPage key={tool.id} tool={tool} />;
    case 'image-compressor':
      return <CompressorPage key={tool.id} tool={tool} />;
    case 'image-resizer':
      return <ResizerPage key={tool.id} tool={tool} />;
    case 'batch-image-processing':
      return <BatchPage key={tool.id} tool={tool} />;
    case 'heic-converter':
      return <HeicPage key={tool.id} tool={tool} />;
    case 'favicon-generator':
      return (
        <ImageRunner
          key={tool.id}
          tool={tool}
          files={{ count: 'one', hint: 'Select a square-ish logo image (64×64 or larger)' }}
          buildOptions={() => ({})}
          imageTool="favicon-generator"
          renderResult={(r) => <FaviconResult result={r} />}
        />
      );
    case 'image-base64':
      return <Base64Page key={tool.id} tool={tool} />;
    case 'screenshot-annotator':
      return <AnnotatorPage key={tool.id} tool={tool} />;
    case 'meme-generator':
      return <MemePage key={tool.id} tool={tool} />;
    case 'exif-inspector':
      return <ExifPage key={tool.id} tool={tool} />;
    case 'image-ocr':
      return (
        <ImageRunner
          key={tool.id}
          tool={tool}
          files={{ count: 'one', hint: 'Select a screenshot or photo containing text' }}
          buildOptions={() => ({})}
          imageTool="image-ocr"
          renderResult={(r) => <OcrResultView result={r} />}
        />
      );
    case 'svg-optimizer':
      return <SvgPage key={tool.id} tool={tool} />;
    case 'palette-extractor':
      return (
        <ImageRunner
          key={tool.id}
          tool={tool}
          files={{ count: 'one' }}
          buildOptions={() => ({})}
          imageTool="palette-extractor"
          renderResult={(r) => <PaletteView result={r} />}
        />
      );
    case 'background-remover':
      return (
        <ImageRunner
          key={tool.id}
          tool={tool}
          files={{
            count: 'one',
            hint: 'First use downloads a small AI model (~4.5MB), then works offline forever',
          }}
          buildOptions={() => ({ target: 'png' })}
          imageTool="background-remover"
        />
      );
    default:
      return null;
  }
}

function ConverterPage({ tool }: ToolPageSpec) {
  const [target, setTarget] = useState('png');
  const [quality, setQuality] = useState('82');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Convert to" htmlFor="img-conv-target">
            <select
              id="img-conv-target"
              className="lt-input"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
              }}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="bmp">BMP</option>
            </select>
          </Field>
          {target === 'jpeg' || target === 'webp' || target === 'avif' ? (
            <Field label="Quality" htmlFor="img-conv-q">
              <Input
                id="img-conv-q"
                type="number"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => {
                  setQuality(e.target.value);
                }}
              />
            </Field>
          ) : null}
        </div>
      }
      buildOptions={() => {
        const q = Number(quality);
        return { target, ...(Number.isFinite(q) ? { quality: q } : {}) };
      }}
      imageTool="image-converter"
    />
  );
}

function CompressorPage({ tool }: ToolPageSpec) {
  const [preset, setPreset] = useState('balanced');
  const [target, setTarget] = useState('match');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Quality preset" htmlFor="img-comp-preset">
            <select
              id="img-comp-preset"
              className="lt-input"
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
              }}
            >
              <option value="small">Small — strongest</option>
              <option value="balanced">Balanced</option>
              <option value="high-quality">High quality</option>
            </select>
          </Field>
          <Field label="Output format" htmlFor="img-comp-target">
            <select
              id="img-comp-target"
              className="lt-input"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
              }}
            >
              <option value="match">Keep original</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="jpeg">JPG</option>
            </select>
          </Field>
        </div>
      }
      buildOptions={() => ({
        preset,
        ...(target !== 'match' ? { target } : {}),
      })}
      imageTool="image-compressor"
      renderResult={(r) => <CompressStats result={r} />}
    />
  );
}

function ResizerPage({ tool }: ToolPageSpec) {
  const [mode, setMode] = useState<'percent' | 'max-dimension' | 'exact'>('percent');
  const [percent, setPercent] = useState('50');
  const [maxDim, setMaxDim] = useState('1024');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Resize mode" htmlFor="img-res-mode">
            <select
              id="img-res-mode"
              className="lt-input"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as 'percent' | 'max-dimension' | 'exact');
              }}
            >
              <option value="percent">By percentage</option>
              <option value="max-dimension">Max width/height</option>
              <option value="exact">Exact dimensions</option>
            </select>
          </Field>
          {mode === 'percent' ? (
            <Field label="Percent" htmlFor="img-res-pct">
              <Input
                id="img-res-pct"
                type="number"
                min={1}
                max={1000}
                value={percent}
                onChange={(e) => {
                  setPercent(e.target.value);
                }}
              />
            </Field>
          ) : null}
          {mode === 'max-dimension' ? (
            <Field label="Max dimension (px)" htmlFor="img-res-max">
              <Input
                id="img-res-max"
                type="number"
                min={1}
                value={maxDim}
                onChange={(e) => {
                  setMaxDim(e.target.value);
                }}
              />
            </Field>
          ) : null}
          {mode === 'exact' ? (
            <>
              <Field label="Width" htmlFor="img-res-w">
                <Input
                  id="img-res-w"
                  type="number"
                  min={1}
                  value={width}
                  placeholder="auto"
                  onChange={(e) => {
                    setWidth(e.target.value);
                  }}
                />
              </Field>
              <Field label="Height" htmlFor="img-res-h">
                <Input
                  id="img-res-h"
                  type="number"
                  min={1}
                  value={height}
                  placeholder="auto"
                  onChange={(e) => {
                    setHeight(e.target.value);
                  }}
                />
              </Field>
            </>
          ) : null}
        </div>
      }
      buildOptions={() => {
        const opts: Record<string, unknown> = { mode };
        if (mode === 'percent') opts['percent'] = Number(percent);
        if (mode === 'max-dimension') opts['maxDimension'] = Number(maxDim);
        if (mode === 'exact') {
          if (width !== '') opts['width'] = Number(width);
          if (height !== '') opts['height'] = Number(height);
        }
        return opts;
      }}
      imageTool="image-resizer"
    />
  );
}

function BatchPage({ tool }: ToolPageSpec) {
  const [op, setOp] = useState<'convert' | 'compress' | 'resize'>('convert');
  const [target, setTarget] = useState('webp');
  const [preset, setPreset] = useState('balanced');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'many', hint: 'Select up to 50 images' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Operation" htmlFor="img-batch-op">
            <select
              id="img-batch-op"
              className="lt-input"
              value={op}
              onChange={(e) => {
                setOp(e.target.value as 'convert' | 'compress' | 'resize');
              }}
            >
              <option value="convert">Convert format</option>
              <option value="compress">Compress</option>
              <option value="resize">Resize (50%)</option>
            </select>
          </Field>
          {op === 'convert' ? (
            <Field label="Format" htmlFor="img-batch-target">
              <select
                id="img-batch-target"
                className="lt-input"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                }}
              >
                <option value="webp">WebP</option>
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
              </select>
            </Field>
          ) : null}
          {op === 'compress' ? (
            <Field label="Preset" htmlFor="img-batch-preset">
              <select
                id="img-batch-preset"
                className="lt-input"
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                }}
              >
                <option value="small">Small</option>
                <option value="balanced">Balanced</option>
                <option value="high-quality">High quality</option>
              </select>
            </Field>
          ) : null}
        </div>
      }
      buildOptions={() => {
        const inner: Record<string, unknown> = {};
        if (op === 'convert') inner['target'] = target;
        if (op === 'compress') inner['preset'] = preset;
        if (op === 'resize') {
          inner['mode'] = 'percent';
          inner['percent'] = 50;
        }
        return { op, options: inner };
      }}
      imageTool="batch-image-processing"
    />
  );
}

function HeicPage({ tool }: ToolPageSpec) {
  const [target, setTarget] = useState('jpeg');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one', accept: HEIC_ACCEPT, hint: 'Select an iPhone photo (.heic)' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Convert to" htmlFor="img-heic-target">
            <select
              id="img-heic-target"
              className="lt-input"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
              }}
            >
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
            </select>
          </Field>
        </div>
      }
      buildOptions={() => ({ target })}
      imageTool="heic-converter"
    />
  );
}

function Base64Page({ tool }: ToolPageSpec) {
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode');
  const [uri, setUri] = useState('');
  return (
    <ImageRunner
      tool={tool}
      files={{
        count: 'one',
        hint:
          direction === 'encode'
            ? 'Select an image to encode'
            : 'Any file (paste the data URI below)',
      }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Direction" htmlFor="img-b64-dir">
            <select
              id="img-b64-dir"
              className="lt-input"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as 'encode' | 'decode');
              }}
            >
              <option value="encode">Image → Base64 data URI</option>
              <option value="decode">Data URI → image</option>
            </select>
          </Field>
          {direction === 'decode' ? (
            <Field label="Data URI" htmlFor="img-b64-uri">
              <textarea
                id="img-b64-uri"
                className="lt-input lt-mono"
                rows={4}
                value={uri}
                onChange={(e) => {
                  setUri(e.target.value);
                }}
                placeholder="data:image/png;base64,…"
              />
            </Field>
          ) : null}
        </div>
      }
      validate={() =>
        direction === 'decode' && !uri.startsWith('data:')
          ? 'Paste a data: URI above first'
          : undefined
      }
      buildOptions={() => (direction === 'decode' ? { direction, uri } : { direction })}
      imageTool="image-base64"
      renderResult={(r) => <Base64Result result={r} direction={direction} />}
    />
  );
}

function AnnotatorPage({ tool }: ToolPageSpec) {
  const [mode, setMode] = useState<'box' | 'arrow' | 'blur'>('blur');
  const [x, setX] = useState('10');
  const [y, setY] = useState('10');
  const [w, setW] = useState('100');
  const [h, setH] = useState('50');
  const [x2, setX2] = useState('150');
  const [y2, setY2] = useState('100');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one', hint: 'Select a screenshot to annotate' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Shape" htmlFor="img-ann-mode">
            <select
              id="img-ann-mode"
              className="lt-input"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as 'box' | 'arrow' | 'blur');
              }}
            >
              <option value="blur">Blur / pixelate a region</option>
              <option value="box">Draw a box</option>
              <option value="arrow">Draw an arrow</option>
            </select>
          </Field>
          <Field label="X" htmlFor="img-ann-x">
            <Input
              id="img-ann-x"
              type="number"
              value={x}
              onChange={(e) => {
                setX(e.target.value);
              }}
            />
          </Field>
          <Field label="Y" htmlFor="img-ann-y">
            <Input
              id="img-ann-y"
              type="number"
              value={y}
              onChange={(e) => {
                setY(e.target.value);
              }}
            />
          </Field>
          {mode === 'arrow' ? (
            <>
              <Field label="End X" htmlFor="img-ann-x2">
                <Input
                  id="img-ann-x2"
                  type="number"
                  value={x2}
                  onChange={(e) => {
                    setX2(e.target.value);
                  }}
                />
              </Field>
              <Field label="End Y" htmlFor="img-ann-y2">
                <Input
                  id="img-ann-y2"
                  type="number"
                  value={y2}
                  onChange={(e) => {
                    setY2(e.target.value);
                  }}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Width" htmlFor="img-ann-w">
                <Input
                  id="img-ann-w"
                  type="number"
                  value={w}
                  onChange={(e) => {
                    setW(e.target.value);
                  }}
                />
              </Field>
              <Field label="Height" htmlFor="img-ann-h">
                <Input
                  id="img-ann-h"
                  type="number"
                  value={h}
                  onChange={(e) => {
                    setH(e.target.value);
                  }}
                />
              </Field>
            </>
          )}
        </div>
      }
      buildOptions={() => {
        const shape: Record<string, unknown> = { kind: mode, x: Number(x), y: Number(y) };
        if (mode === 'arrow') {
          shape['x2'] = Number(x2);
          shape['y2'] = Number(y2);
          shape['color'] = [220, 30, 30];
        } else {
          shape['w'] = Number(w);
          shape['h'] = Number(h);
          if (mode === 'box') shape['color'] = [220, 30, 30];
        }
        return { shapes: [shape], target: 'png' };
      }}
      imageTool="screenshot-annotator"
    />
  );
}

function MemePage({ tool }: ToolPageSpec) {
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one', hint: 'Select the meme base image' }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Top text" htmlFor="img-meme-top">
            <Input
              id="img-meme-top"
              value={topText}
              onChange={(e) => {
                setTopText(e.target.value);
              }}
            />
          </Field>
          <Field label="Bottom text" htmlFor="img-meme-bottom">
            <Input
              id="img-meme-bottom"
              value={bottomText}
              onChange={(e) => {
                setBottomText(e.target.value);
              }}
            />
          </Field>
        </div>
      }
      validate={() =>
        topText === '' && bottomText === '' ? 'Add top or bottom text first' : undefined
      }
      buildOptions={() => ({
        ...(topText !== '' ? { topText } : {}),
        ...(bottomText !== '' ? { bottomText } : {}),
      })}
      imageTool="meme-generator"
    />
  );
}

function ExifPage({ tool }: ToolPageSpec) {
  const [action, setAction] = useState<'view' | 'strip'>('view');
  return (
    <ImageRunner
      tool={tool}
      files={{
        count: 'one',
        accept: 'image/jpeg,.jpg,.jpeg',
        hint: 'Select a JPEG photo (EXIF lives in JPEGs)',
      }}
      optionsPanel={
        <div className="lt-options">
          <Field label="Action" htmlFor="img-exif-action">
            <select
              id="img-exif-action"
              className="lt-input"
              value={action}
              onChange={(e) => {
                setAction(e.target.value as 'view' | 'strip');
              }}
            >
              <option value="view">View metadata</option>
              <option value="strip">Strip all metadata (privacy)</option>
            </select>
          </Field>
        </div>
      }
      buildOptions={() => ({})}
      imageTool={action === 'view' ? 'exif-inspector' : 'exif-strip'}
      renderResult={(r) => (action === 'view' ? <ExifView result={r} /> : null)}
    />
  );
}

function SvgPage({ tool }: ToolPageSpec) {
  return (
    <ImageRunner
      tool={tool}
      files={{ count: 'one', accept: '.svg,image/svg+xml', hint: 'Select an SVG file' }}
      buildOptions={() => ({})}
      imageTool="svg-optimizer"
      renderResult={(r) => <SvgStats result={r} />}
    />
  );
}

/* ---------------- result renderers ---------------- */

function CompressStats({ result }: { result: unknown }) {
  const r = result as { originalSize?: number; newSize?: number } | null;
  if (r === null || r.originalSize === undefined || r.newSize === undefined) return null;
  const saved = r.originalSize - r.newSize;
  const pct = r.originalSize > 0 ? Math.round((saved / r.originalSize) * 100) : 0;
  return (
    <p className="lt-suite-caption">
      {formatBytes(r.originalSize)} → {formatBytes(r.newSize)} (
      {pct >= 0 ? `−${String(pct)}%` : `+${String(-pct)}%`})
    </p>
  );
}

function Base64Result({ result, direction }: { result: unknown; direction: 'encode' | 'decode' }) {
  if (direction === 'encode' && typeof result === 'string') {
    return (
      <textarea
        className="lt-diff-pre lt-mono"
        rows={6}
        readOnly
        value={result}
        aria-label="Base64 data URI"
        onFocus={(e) => {
          e.target.select();
        }}
      />
    );
  }
  return null;
}

function ExifView({ result }: { result: unknown }) {
  const r = result as {
    entries?: { key: string; value: string }[];
    gps?: { latitude: number; longitude: number };
    hasExif?: boolean;
  } | null;
  if (r === null) return null;
  if (r.hasExif === false) {
    return <p className="lt-suite-caption">No EXIF metadata found in this file.</p>;
  }
  return (
    <div>
      {r.gps !== undefined ? (
        <p className="lt-suite-caption" role="alert">
          ⚠ This photo contains GPS coordinates: {r.gps.latitude.toFixed(5)},{' '}
          {r.gps.longitude.toFixed(5)}. Use “Strip all metadata” below to remove them.
        </p>
      ) : null}
      <table className="lt-diff-table">
        <tbody>
          {(r.entries ?? []).slice(0, 25).map((e) => (
            <tr key={e.key}>
              <td className="lt-mono">{e.key}</td>
              <td className="lt-mono">{e.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SvgStats({ result }: { result: unknown }) {
  const r = result as { originalSize?: number; newSize?: number; svg?: string } | null;
  if (r === null || r.originalSize === undefined || r.newSize === undefined) return null;
  const pct = r.originalSize > 0 ? Math.round((1 - r.newSize / r.originalSize) * 100) : 0;
  return (
    <p className="lt-suite-caption">
      {formatBytes(r.originalSize)} → {formatBytes(r.newSize)} (−{String(pct)}%)
    </p>
  );
}

function OcrResultView({ result }: { result: unknown }) {
  const r = result as { text?: string; confidence?: number } | null;
  if (r === null || r.text === undefined) return null;
  return (
    <div>
      <p className="lt-suite-caption">Confidence: {String(Math.round(r.confidence ?? 0))}%</p>
      <pre className="lt-diff-pre lt-mono" aria-label="Recognized text">
        {r.text}
      </pre>
    </div>
  );
}

function PaletteView({ result }: { result: unknown }) {
  const swatches = result as { hex: string; weight: number }[] | null;
  if (swatches === null || !Array.isArray(swatches)) return null;
  return (
    <div className="lt-palette-row">
      {swatches.map((s) => (
        <div
          key={s.hex}
          className="lt-palette-swatch"
          title={`${s.hex} (${String(Math.round(s.weight * 100))}%)`}
        >
          <div className="lt-palette-color" style={{ background: s.hex }} aria-hidden="true" />
          <span className="lt-mono">{s.hex}</span>
        </div>
      ))}
    </div>
  );
}

function FaviconResult({ result }: { result: unknown }) {
  const r = result as { files?: { name: string }[]; htmlSnippet?: string } | null;
  if (r === null) return null;
  return (
    <div>
      <p className="lt-suite-caption">Generated: {(r.files ?? []).map((f) => f.name).join(', ')}</p>
      {r.htmlSnippet !== undefined ? (
        <pre className="lt-diff-pre lt-mono" aria-label="HTML snippet">
          {r.htmlSnippet}
        </pre>
      ) : null}
    </div>
  );
}
