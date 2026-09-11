import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Field, Input } from '@localtools/ui';
import { ToolRunnerPage } from './ToolRunnerPage';
import { EngineRunnerPage } from './EngineRunnerPage';
import type { EngineClientFile } from '../lib/engine-client';
import { CameraCapture } from './CameraCapture';
import { SignaturePad } from './SignaturePad';
import type { SignaturePadHandle } from './SignaturePad';
import type { RegisteredTool } from '../lib/tool-registry';

/**
 * Per-tool page specs for all 21 PDF Group A tools (Section 9 pattern):
 * every tool = ToolRunnerPage (worker offload + progress + errors) + an
 * options panel of shared Field/Input controls. buildOptions() serializes
 * the panel into the worker payload; complex tools render custom results.
 */

const IMAGE_ACCEPT = 'image/png,image/jpeg,.png,.jpg,.jpeg';

interface ToolPageSpec {
  tool: RegisteredTool;
}

export function pdfToolPage(tool: RegisteredTool): ReactNode {
  switch (tool.id) {
    case 'merge-pdf':
      return (
        <ToolRunnerPage
          key={tool.id}
          tool={tool}
          files={{ count: 'many', hint: 'Select PDFs in the order you want them merged.' }}
          buildOptions={() => ({})}
        />
      );
    case 'split-pdf':
      return <SplitPage key={tool.id} tool={tool} />;
    case 'extract-pages':
    case 'delete-pages':
    case 'organize-pages':
      return <RangesPage key={tool.id} tool={tool} />;
    case 'rotate-pages':
      return <RotatePage key={tool.id} tool={tool} />;
    case 'crop-pages':
      return <CropPage key={tool.id} tool={tool} />;
    case 'page-numbers':
      return <PageNumbersPage key={tool.id} tool={tool} />;
    case 'watermark':
      return <WatermarkPage key={tool.id} tool={tool} />;
    case 'pdf-to-image':
      return <PdfToImagePage key={tool.id} tool={tool} />;
    case 'image-to-pdf':
      return <ImageToPdfPage key={tool.id} tool={tool} />;
    case 'scan-to-pdf':
      return <ScanToPdfPage key={tool.id} tool={tool} />;
    case 'sign-pdf':
      return <SignPage key={tool.id} tool={tool} />;
    case 'protect-pdf':
      return <ProtectPage key={tool.id} tool={tool} />;
    case 'unlock-pdf':
      return <UnlockPage key={tool.id} tool={tool} />;
    case 'optimize-linearize':
    case 'quick-compress':
    case 'repair-pdf':
      return (
        <ToolRunnerPage
          key={tool.id}
          tool={tool}
          files={{ count: 'one' }}
          buildOptions={() => ({})}
        />
      );
    case 'redact-pdf':
      return <RedactPage key={tool.id} tool={tool} />;
    case 'compare-pdfs':
      return <ComparePage key={tool.id} tool={tool} />;
    case 'fill-forms':
      return <FillFormsPage key={tool.id} tool={tool} />;
    case 'edit-metadata':
      return <MetadataPage key={tool.id} tool={tool} />;
    case 'bookmarks-toc':
      return <BookmarksPage key={tool.id} tool={tool} />;
    case 'resize-pages':
      return <ResizePage key={tool.id} tool={tool} />;
    case 'n-up-layout':
      return <NUpPage key={tool.id} tool={tool} />;
    case 'grayscale-pdf':
      return <GrayscalePage key={tool.id} tool={tool} />;
    case 'pdf-to-text':
      return (
        <ToolRunnerPage
          key={tool.id}
          tool={tool}
          files={{ count: 'one' }}
          buildOptions={() => ({})}
          renderResult={(result) => (
            <pre className="lt-diff-pre lt-mono" aria-label="Extracted text">
              {String(result)}
            </pre>
          )}
        />
      );
    case 'word-conversion':
      return <OfficeConversionPage key={tool.id} tool={tool} target="word" />;
    case 'excel-conversion':
      return <OfficeConversionPage key={tool.id} tool={tool} target="excel" />;
    case 'powerpoint-conversion':
      return <OfficeConversionPage key={tool.id} tool={tool} target="powerpoint" />;
    case 'ocr-pdf':
      return <OcrPage key={tool.id} tool={tool} />;
    case 'deep-compress':
      return <DeepCompressPage key={tool.id} tool={tool} />;
    case 'pdf-to-pdfa':
      return <PdfToPdfAPage key={tool.id} tool={tool} />;
    case 'deep-repair':
      return <DeepRepairPage key={tool.id} tool={tool} />;
    case 'html-to-pdf':
      return <HtmlToPdfPage key={tool.id} tool={tool} />;
    default:
      return null;
  }
}

/* ---------------- shared helpers ---------------- */

function useStr(initial = ''): [string, (v: string) => void] {
  const [value, setValue] = useState(initial);
  return [
    value,
    (v: string) => {
      setValue(v);
    },
  ];
}
function useNum(initial = ''): [string, (v: string) => void] {
  const [value, setValue] = useState(initial);
  return [
    value,
    (v: string) => {
      setValue(v);
    },
  ];
}
function numOr(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/* ---------------- simple option pages ---------------- */

function SplitPage({ tool }: ToolPageSpec) {
  const [mode, setMode] = useState<'every-n' | 'by-size'>('every-n');
  const [everyN, setEveryN] = useNum('1');
  const [sizeMb, setSizeMb] = useNum('1');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field
            label="Split mode"
            htmlFor="opt-split-mode"
            hint="Every N pages, or parts under a size target."
          >
            <select
              id="opt-split-mode"
              className="lt-input"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value === 'by-size' ? 'by-size' : 'every-n');
              }}
            >
              <option value="every-n">Every N pages</option>
              <option value="by-size">By target size</option>
            </select>
          </Field>
          {mode === 'every-n' ? (
            <Field label="Pages per file" htmlFor="opt-split-n">
              <Input
                id="opt-split-n"
                type="number"
                min={1}
                value={everyN}
                onChange={(e) => {
                  setEveryN(e.target.value);
                }}
              />
            </Field>
          ) : (
            <Field label="Target size (MB)" htmlFor="opt-split-size">
              <Input
                id="opt-split-size"
                type="number"
                min={1}
                value={sizeMb}
                onChange={(e) => {
                  setSizeMb(e.target.value);
                }}
              />
            </Field>
          )}
        </>
      }
      buildOptions={() =>
        mode === 'every-n'
          ? { mode: 'every-n', everyN: numOr(everyN) ?? 1 }
          : { mode: 'by-size', targetBytes: Math.round((numOr(sizeMb) ?? 1) * 1024 * 1024) }
      }
    />
  );
}

function RangesPage({ tool }: ToolPageSpec) {
  const [ranges, setRanges] = useStr('');
  const isOrganize = tool.id === 'organize-pages';
  return (
    <ToolRunnerPage
      tool={tool}
      files={{
        count: 'one',
        ...(isOrganize ? { hint: 'Give the new page order, e.g. "3, 1, 2-4".' } : {}),
      }}
      optionsPanel={
        <Field
          label={isOrganize ? 'New page order' : 'Pages'}
          htmlFor="opt-ranges"
          hint={
            isOrganize
              ? 'Pages appear in exactly this order (duplicates allowed).'
              : 'Page numbers and ranges, e.g. "1, 3, 5-8".'
          }
        >
          <Input
            id="opt-ranges"
            value={ranges}
            onChange={(e) => {
              setRanges(e.target.value);
            }}
            placeholder={isOrganize ? '3, 1, 2-4' : '1, 3, 5-8'}
          />
        </Field>
      }
      validate={() => (ranges.trim() === '' ? 'Enter the page selection' : undefined)}
      buildOptions={() => (isOrganize ? { order: ranges } : { ranges })}
    />
  );
}

function RotatePage({ tool }: ToolPageSpec) {
  const [angle, setAngle] = useState('90');
  const [ranges, setRanges] = useStr('');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field label="Turn clockwise by" htmlFor="opt-rotate-angle">
            <select
              id="opt-rotate-angle"
              className="lt-input"
              value={angle}
              onChange={(e) => {
                setAngle(e.target.value);
              }}
            >
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </select>
          </Field>
          <Field
            label="Pages (optional)"
            htmlFor="opt-rotate-ranges"
            hint="Leave empty to rotate every page."
          >
            <Input
              id="opt-rotate-ranges"
              value={ranges}
              onChange={(e) => {
                setRanges(e.target.value);
              }}
              placeholder="1, 3-5"
            />
          </Field>
        </>
      }
      buildOptions={() => ({ angle: Number(angle), ...(ranges.trim() === '' ? {} : { ranges }) })}
    />
  );
}

function CropPage({ tool }: ToolPageSpec) {
  const [top, setTop] = useNum('');
  const [right, setRight] = useNum('');
  const [bottom, setBottom] = useNum('');
  const [left, setLeft] = useNum('');
  const [unit, setUnit] = useState<'pt' | 'percent'>('pt');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field
            label="Unit"
            htmlFor="opt-crop-unit"
            hint="Points (1/72 inch) or percent of the page."
          >
            <select
              id="opt-crop-unit"
              className="lt-input"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value === 'percent' ? 'percent' : 'pt');
              }}
            >
              <option value="pt">Points</option>
              <option value="percent">Percent</option>
            </select>
          </Field>
          <div className="lt-field-grid">
            <Field label="Top" htmlFor="opt-crop-top">
              <Input
                id="opt-crop-top"
                type="number"
                min={0}
                value={top}
                onChange={(e) => {
                  setTop(e.target.value);
                }}
              />
            </Field>
            <Field label="Right" htmlFor="opt-crop-right">
              <Input
                id="opt-crop-right"
                type="number"
                min={0}
                value={right}
                onChange={(e) => {
                  setRight(e.target.value);
                }}
              />
            </Field>
            <Field label="Bottom" htmlFor="opt-crop-bottom">
              <Input
                id="opt-crop-bottom"
                type="number"
                min={0}
                value={bottom}
                onChange={(e) => {
                  setBottom(e.target.value);
                }}
              />
            </Field>
            <Field label="Left" htmlFor="opt-crop-left">
              <Input
                id="opt-crop-left"
                type="number"
                min={0}
                value={left}
                onChange={(e) => {
                  setLeft(e.target.value);
                }}
              />
            </Field>
          </div>
        </>
      }
      validate={() =>
        [top, right, bottom, left].some((v) => v.trim() !== '')
          ? undefined
          : 'Enter at least one margin'
      }
      buildOptions={() => ({
        ...(top.trim() === '' ? {} : { top: numOr(top) }),
        ...(right.trim() === '' ? {} : { right: numOr(right) }),
        ...(bottom.trim() === '' ? {} : { bottom: numOr(bottom) }),
        ...(left.trim() === '' ? {} : { left: numOr(left) }),
        unit,
      })}
    />
  );
}

function PageNumbersPage({ tool }: ToolPageSpec) {
  const [position, setPosition] = useState('bottom-center');
  const [format, setFormat] = useState<'plain' | 'of-total'>('plain');
  const [startAt, setStartAt] = useNum('1');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field label="Position" htmlFor="opt-pn-pos">
            <select
              id="opt-pn-pos"
              className="lt-input"
              value={position}
              onChange={(e) => {
                setPosition(e.target.value);
              }}
            >
              <option value="bottom-center">Bottom center</option>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="top-center">Top center</option>
              <option value="top-right">Top right</option>
              <option value="top-left">Top left</option>
            </select>
          </Field>
          <Field label="Label format" htmlFor="opt-pn-format">
            <select
              id="opt-pn-format"
              className="lt-input"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value === 'of-total' ? 'of-total' : 'plain');
              }}
            >
              <option value="plain">1</option>
              <option value="of-total">1 of 10</option>
            </select>
          </Field>
          <Field label="Start counting at" htmlFor="opt-pn-start">
            <Input
              id="opt-pn-start"
              type="number"
              min={1}
              value={startAt}
              onChange={(e) => {
                setStartAt(e.target.value);
              }}
            />
          </Field>
        </>
      }
      buildOptions={() => ({
        position,
        format,
        ...(startAt.trim() === '' ? {} : { startAt: numOr(startAt) }),
      })}
    />
  );
}

function WatermarkPage({ tool }: ToolPageSpec) {
  const [text, setText] = useStr('');
  const [opacity, setOpacity] = useNum('15');
  const [rotation, setRotation] = useNum('45');
  const [tile, setTile] = useState(false);
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field
            label="Watermark text"
            htmlFor="opt-wm-text"
            hint="Latin characters only (font coverage limitation)."
          >
            <Input
              id="opt-wm-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              placeholder="CONFIDENTIAL"
            />
          </Field>
          <div className="lt-field-grid">
            <Field label="Opacity %" htmlFor="opt-wm-opacity">
              <Input
                id="opt-wm-opacity"
                type="number"
                min={1}
                max={100}
                value={opacity}
                onChange={(e) => {
                  setOpacity(e.target.value);
                }}
              />
            </Field>
            <Field label="Rotation °" htmlFor="opt-wm-rotation">
              <Input
                id="opt-wm-rotation"
                type="number"
                value={rotation}
                onChange={(e) => {
                  setRotation(e.target.value);
                }}
              />
            </Field>
          </div>
          <label className="lt-checkbox">
            <input
              type="checkbox"
              checked={tile}
              onChange={(e) => {
                setTile(e.target.checked);
              }}
            />{' '}
            Tile across the page
          </label>
        </>
      }
      validate={() => (text.trim() === '' ? 'Enter the watermark text' : undefined)}
      buildOptions={() => ({
        text,
        ...(opacity.trim() === '' ? {} : { opacity: (numOr(opacity) ?? 15) / 100 }),
        ...(rotation.trim() === '' ? {} : { rotation: numOr(rotation) }),
        tile,
      })}
    />
  );
}

function PdfToImagePage({ tool }: ToolPageSpec) {
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [scale, setScale] = useNum('2');
  const [pages, setPages] = useStr('');
  const [quality, setQuality] = useNum('85');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <div className="lt-field-grid">
            <Field label="Format" htmlFor="opt-pti-format">
              <select
                id="opt-pti-format"
                className="lt-input"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value === 'jpeg' ? 'jpeg' : 'png');
                }}
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPG</option>
              </select>
            </Field>
            {format === 'jpeg' ? (
              <Field label="Quality %" htmlFor="opt-pti-quality">
                <Input
                  id="opt-pti-quality"
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
          <div className="lt-field-grid">
            <Field label="Scale" htmlFor="opt-pti-scale" hint="1 = 72dpi; 2 ≈ 144dpi.">
              <Input
                id="opt-pti-scale"
                type="number"
                step="0.5"
                min={0.5}
                max={10}
                value={scale}
                onChange={(e) => {
                  setScale(e.target.value);
                }}
              />
            </Field>
            <Field label="Pages (optional)" htmlFor="opt-pti-pages">
              <Input
                id="opt-pti-pages"
                value={pages}
                onChange={(e) => {
                  setPages(e.target.value);
                }}
                placeholder="all"
              />
            </Field>
          </div>
        </>
      }
      buildOptions={() => ({
        format,
        ...(scale.trim() === '' ? {} : { scale: numOr(scale) }),
        ...(pages.trim() === '' ? {} : { pages }),
        ...(format === 'jpeg' && quality.trim() !== ''
          ? { quality: (numOr(quality) ?? 85) / 100 }
          : {}),
      })}
      renderResult={(result) => {
        if (!Array.isArray(result)) return null;
        return (
          <div className="lt-image-grid">
            {result.map((page, i) => {
              const p = page as {
                pageNumber: number;
                width: number;
                height: number;
                bytes: Uint8Array;
                format: string;
              };
              const mime = p.format === 'jpeg' ? 'image/jpeg' : 'image/png';
              return (
                <figure key={`img-${String(i)}`} className="lt-image-thumb">
                  <img
                    src={URL.createObjectURL(
                      new Blob([p.bytes as unknown as BlobPart], { type: mime }),
                    )}
                    alt={`Page ${String(p.pageNumber)} preview`}
                  />
                  <figcaption>
                    Page {String(p.pageNumber)} · {String(p.width)}×{String(p.height)}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        );
      }}
    />
  );
}

function ImageToPdfPage({ tool }: ToolPageSpec) {
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [margin, setMargin] = useNum('0');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{
        count: 'many',
        accept: IMAGE_ACCEPT,
        hint: 'Images become pages in the order selected.',
      }}
      optionsPanel={
        <>
          <Field
            label="Page size"
            htmlFor="opt-i2p-size"
            hint="'Fit' sizes each page to its image."
          >
            <select
              id="opt-i2p-size"
              className="lt-input"
              value={pageSize}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === 'a4' ? 'a4' : v === 'letter' ? 'letter' : 'fit');
              }}
            >
              <option value="fit">Fit to image</option>
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </Field>
          {pageSize !== 'fit' ? (
            <Field label="Margin (fraction, 0–0.5)" htmlFor="opt-i2p-margin">
              <Input
                id="opt-i2p-margin"
                type="number"
                step="0.05"
                min={0}
                max={0.5}
                value={margin}
                onChange={(e) => {
                  setMargin(e.target.value);
                }}
              />
            </Field>
          ) : null}
        </>
      }
      buildOptions={() => ({
        pageSize,
        ...(pageSize === 'fit' || margin.trim() === '' ? {} : { margin: numOr(margin) }),
      })}
    />
  );
}

function ProtectPage({ tool }: ToolPageSpec) {
  const [userPassword, setUserPassword] = useStr('');
  const [ownerPassword, setOwnerPassword] = useStr('');
  const [level, setLevel] = useState<'aes-256' | 'aes-128'>('aes-256');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field label="Password to open the PDF" htmlFor="opt-prot-user">
            <Input
              id="opt-prot-user"
              type="password"
              value={userPassword}
              onChange={(e) => {
                setUserPassword(e.target.value);
              }}
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Owner password (optional)"
            htmlFor="opt-prot-owner"
            hint="Controls permissions; defaults to the open password."
          >
            <Input
              id="opt-prot-owner"
              type="password"
              value={ownerPassword}
              onChange={(e) => {
                setOwnerPassword(e.target.value);
              }}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Encryption" htmlFor="opt-prot-level">
            <select
              id="opt-prot-level"
              className="lt-input"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value === 'aes-128' ? 'aes-128' : 'aes-256');
              }}
            >
              <option value="aes-256">AES-256 (recommended)</option>
              <option value="aes-128">AES-128</option>
            </select>
          </Field>
        </>
      }
      validate={() => (userPassword === '' ? 'Enter a password first' : undefined)}
      buildOptions={() => ({
        userPassword,
        ...(ownerPassword === '' ? {} : { ownerPassword }),
        level,
      })}
    />
  );
}

function UnlockPage({ tool }: ToolPageSpec) {
  const [password, setPassword] = useStr('');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <Field
          label="PDF password"
          htmlFor="opt-unlock-pw"
          hint="Removes encryption you can already open — it never cracks unknown passwords."
        >
          <Input
            id="opt-unlock-pw"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            autoComplete="off"
          />
        </Field>
      }
      validate={() => (password === '' ? 'Enter the password' : undefined)}
      buildOptions={() => ({ password })}
    />
  );
}

function RedactPage({ tool }: ToolPageSpec) {
  const [search, setSearch] = useStr('');
  const [pages, setPages] = useStr('');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field
            label="Text to redact"
            htmlFor="opt-redact-search"
            hint="Every occurrence on the selected pages is genuinely removed from the file."
          >
            <Input
              id="opt-redact-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder="john.doe@example.com"
            />
          </Field>
          <Field label="Pages (optional)" htmlFor="opt-redact-pages">
            <Input
              id="opt-redact-pages"
              value={pages}
              onChange={(e) => {
                setPages(e.target.value);
              }}
              placeholder="all"
            />
          </Field>
        </>
      }
      validate={() => (search.trim() === '' ? 'Enter the text to redact' : undefined)}
      buildOptions={() => ({ search, ...(pages.trim() === '' ? {} : { pages }) })}
      workerTool="redact-by-text"
      renderResult={(result) => {
        const r = result as { removedTextRuns?: number };
        return (
          <p className="lt-tool-hint">
            {r.removedTextRuns !== undefined
              ? `Removed ${String(r.removedTextRuns)} text run${r.removedTextRuns === 1 ? '' : 's'} — the string is gone from the file itself, not just hidden.`
              : null}
          </p>
        );
      }}
    />
  );
}

function ComparePage({ tool }: ToolPageSpec) {
  const [visual, setVisual] = useState(false);
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'two', hint: 'Select the two PDFs to compare.' }}
      optionsPanel={
        <label className="lt-checkbox">
          <input
            type="checkbox"
            checked={visual}
            onChange={(e) => {
              setVisual(e.target.checked);
            }}
          />{' '}
          Pixel compare (for scanned PDFs)
        </label>
      }
      buildOptions={() => ({ visual })}
      renderResult={(result) => {
        const r = result as
          | {
              identical: boolean;
              patch?: string;
              pages?: { a: number; b: number };
              visual?: { mismatchedPixels: number; mismatchRatio: number };
            }
          | undefined;
        if (r === undefined) return null;
        return (
          <div className="lt-compare-result">
            <p>{r.identical ? 'The two PDFs are identical.' : 'The two PDFs are different.'}</p>
            {r.pages !== undefined ? (
              <p className="lt-tool-hint">
                {String(r.pages.a)} page(s) vs {String(r.pages.b)} page(s)
              </p>
            ) : null}
            {r.visual !== undefined ? (
              <p className="lt-tool-hint">
                {String(r.visual.mismatchedPixels)} mismatched pixels (
                {(r.visual.mismatchRatio * 100).toFixed(2)}%)
              </p>
            ) : null}
            {r.patch !== undefined && r.patch !== '' ? (
              <pre className="lt-diff-pre lt-mono">{r.patch}</pre>
            ) : null}
          </div>
        );
      }}
    />
  );
}

function FillFormsPage({ tool }: ToolPageSpec) {
  const [valuesJson, setValuesJson] = useStr('');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{
        count: 'one',
        hint: 'Run once with no values to list the field names this PDF contains.',
      }}
      optionsPanel={
        <Field
          label="Field values (JSON)"
          htmlFor="opt-ff-values"
          hint='e.g. {"fullname": "Jane Doe", "subscribe": true}. Leave empty to read the fields instead.'
        >
          <Input
            id="opt-ff-values"
            value={valuesJson}
            onChange={(e) => {
              setValuesJson(e.target.value);
            }}
            placeholder='{"fullname": "Jane Doe"}'
          />
        </Field>
      }
      buildOptions={() => {
        if (valuesJson.trim() === '') return { read: true };
        try {
          return { values: JSON.parse(valuesJson) as Record<string, unknown> };
        } catch {
          return { values: {}, invalidJson: true };
        }
      }}
      validate={() => {
        if (valuesJson.trim() === '') return undefined;
        try {
          JSON.parse(valuesJson);
          return undefined;
        } catch {
          return 'The field values are not valid JSON';
        }
      }}
      renderResult={(result) => (
        <pre className="lt-diff-pre lt-mono" aria-label="Form fields">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    />
  );
}

function MetadataPage({ tool }: ToolPageSpec) {
  const [title, setTitle] = useStr('');
  const [author, setAuthor] = useStr('');
  const [subject, setSubject] = useStr('');
  const [keywords, setKeywords] = useStr('');
  const [creator, setCreator] = useStr('');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <div className="lt-field-grid">
          <Field label="Title" htmlFor="opt-md-title">
            <Input
              id="opt-md-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </Field>
          <Field label="Author" htmlFor="opt-md-author">
            <Input
              id="opt-md-author"
              value={author}
              onChange={(e) => {
                setAuthor(e.target.value);
              }}
            />
          </Field>
          <Field label="Subject" htmlFor="opt-md-subject">
            <Input
              id="opt-md-subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
              }}
            />
          </Field>
          <Field label="Keywords" htmlFor="opt-md-keywords">
            <Input
              id="opt-md-keywords"
              value={keywords}
              onChange={(e) => {
                setKeywords(e.target.value);
              }}
            />
          </Field>
          <Field label="Creator" htmlFor="opt-md-creator">
            <Input
              id="opt-md-creator"
              value={creator}
              onChange={(e) => {
                setCreator(e.target.value);
              }}
            />
          </Field>
        </div>
      }
      validate={() =>
        [title, author, subject, keywords, creator].some((v) => v.trim() !== '')
          ? undefined
          : 'Fill in at least one field'
      }
      buildOptions={() => ({ title, author, subject, keywords, creator })}
    />
  );
}

function BookmarksPage({ tool }: ToolPageSpec) {
  const [entries, setEntries] = useStr('');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <Field
          label="Bookmarks (one per line)"
          htmlFor="opt-bm-entries"
          hint='Format: "Title | page", e.g. "Chapter 1 | 1". Leave empty to read the current bookmarks.'
        >
          <textarea
            id="opt-bm-entries"
            className="lt-input lt-textarea"
            rows={5}
            value={entries}
            onChange={(e) => {
              setEntries(e.target.value);
            }}
            placeholder={'Chapter 1 | 1\nChapter 2 | 5'}
          />
        </Field>
      }
      buildOptions={() => {
        if (entries.trim() === '') return { read: true };
        const list: { title: string; page: number }[] = [];
        for (const line of entries.split('\n')) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          const match = /^(.*)\|\s*(\d+)$/.exec(trimmed);
          if (match !== null) {
            const title = match[1]?.trim() ?? '';
            const page = Number(match[2]);
            if (title !== '') list.push({ title, page });
          }
        }
        return { entries: list };
      }}
      validate={() => {
        if (entries.trim() === '') return undefined;
        for (const line of entries.split('\n')) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          if (!/^(.*)\|\s*(\d+)$/.test(trimmed)) {
            return `Line "${trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed}" is not "Title | page"`;
          }
        }
        return undefined;
      }}
      renderResult={(result) => (
        <pre className="lt-diff-pre lt-mono" aria-label="Bookmarks">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    />
  );
}

function ResizePage({ tool }: ToolPageSpec) {
  const [size, setSize] = useState('a4');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <Field label="New page size" htmlFor="opt-resize-size">
          <select
            id="opt-resize-size"
            className="lt-input"
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
            }}
          >
            <option value="a4">A4</option>
            <option value="a3">A3</option>
            <option value="a5">A5</option>
            <option value="letter">Letter</option>
            <option value="legal">Legal</option>
          </select>
        </Field>
      }
      buildOptions={() => ({ size })}
    />
  );
}

function NUpPage({ tool }: ToolPageSpec) {
  const [layout, setLayout] = useState('2-up');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <Field label="Layout" htmlFor="opt-nup-layout">
          <select
            id="opt-nup-layout"
            className="lt-input"
            value={layout}
            onChange={(e) => {
              setLayout(e.target.value);
            }}
          >
            <option value="2-up">2-up</option>
            <option value="3-up">3-up</option>
            <option value="4-up">4-up</option>
            <option value="6-up">6-up</option>
            <option value="9-up">9-up</option>
          </select>
        </Field>
      }
      buildOptions={() => ({ layout })}
    />
  );
}

function GrayscalePage({ tool }: ToolPageSpec) {
  const [pages, setPages] = useStr('');
  const [scale, setScale] = useNum('2');
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one', hint: 'Selected pages become grayscale images of the same size.' }}
      optionsPanel={
        <>
          <Field label="Pages (optional)" htmlFor="opt-gray-pages">
            <Input
              id="opt-gray-pages"
              value={pages}
              onChange={(e) => {
                setPages(e.target.value);
              }}
              placeholder="all"
            />
          </Field>
          <Field
            label="Render scale"
            htmlFor="opt-gray-scale"
            hint="Higher = sharper raster, larger file."
          >
            <Input
              id="opt-gray-scale"
              type="number"
              step="0.5"
              min={0.5}
              max={10}
              value={scale}
              onChange={(e) => {
                setScale(e.target.value);
              }}
            />
          </Field>
        </>
      }
      buildOptions={() => ({
        ...(pages.trim() === '' ? {} : { pages }),
        ...(scale.trim() === '' ? {} : { scale: numOr(scale) }),
      })}
    />
  );
}

function SignPage({ tool }: ToolPageSpec) {
  const [mode, setMode] = useState<'type' | 'draw' | 'image'>('type');
  const [text, setText] = useStr('');
  const [imageBytes, setImageBytes] = useState<Uint8Array | undefined>(undefined);
  const [page, setPage] = useNum('1');
  const [width, setWidth] = useNum('180');
  const [hasStrokes, setHasStrokes] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);
  return (
    <ToolRunnerPage
      tool={tool}
      files={{ count: 'one' }}
      optionsPanel={
        <>
          <Field label="Signature source" htmlFor="opt-sign-mode">
            <select
              id="opt-sign-mode"
              className="lt-input"
              value={mode}
              onChange={(e) => {
                const v = e.target.value;
                setMode(v === 'draw' ? 'draw' : v === 'image' ? 'image' : 'type');
              }}
            >
              <option value="type">Type your name</option>
              <option value="draw">Draw</option>
              <option value="image">Upload image</option>
            </select>
          </Field>
          {mode === 'type' ? (
            <Field
              label="Your name"
              htmlFor="opt-sign-text"
              hint="Rendered in an italic serif style over a signature line."
            >
              <Input
                id="opt-sign-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                placeholder="Jane Doe"
              />
            </Field>
          ) : null}
          {mode === 'draw' ? (
            <SignaturePad handleRef={padRef} onStrokesChange={setHasStrokes} />
          ) : null}
          {mode === 'image' ? (
            <Field label="Signature image (PNG/JPG)" htmlFor="opt-sign-image">
              <input
                id="opt-sign-image"
                className="lt-input"
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file === undefined) return;
                  void file.arrayBuffer().then((buf) => {
                    setImageBytes(new Uint8Array(buf));
                  });
                }}
              />
            </Field>
          ) : null}
          <div className="lt-field-grid">
            <Field label="Target page" htmlFor="opt-sign-page">
              <Input
                id="opt-sign-page"
                type="number"
                min={1}
                value={page}
                onChange={(e) => {
                  setPage(e.target.value);
                }}
              />
            </Field>
            <Field label="Signature width (pt)" htmlFor="opt-sign-width">
              <Input
                id="opt-sign-width"
                type="number"
                min={10}
                value={width}
                onChange={(e) => {
                  setWidth(e.target.value);
                }}
              />
            </Field>
          </div>
        </>
      }
      validate={() => {
        if (mode === 'type' && text.trim() === '') return 'Type your name first';
        if (mode === 'draw' && !hasStrokes) return 'Draw your signature first';
        if (mode === 'image' && imageBytes === undefined) return 'Select a signature image';
        return undefined;
      }}
      buildOptions={async () => {
        const image = mode === 'draw' ? await padRef.current?.toPng() : imageBytes;
        return {
          kind: mode,
          ...(mode === 'type' ? { text } : {}),
          ...(image === undefined ? {} : { imageBytes: image }),
          page: numOr(page) ?? 1,
          ...(width.trim() === '' ? {} : { width: numOr(width) }),
        };
      }}
    />
  );
}

function ScanToPdfPage({ tool }: ToolPageSpec) {
  const injectRef = useRef<((files: { name: string; bytes: Uint8Array }[]) => void) | null>(null);
  const [captured, setCaptured] = useState(0);
  return (
    <ToolRunnerPage
      tool={tool}
      files={{
        count: 'many',
        accept: IMAGE_ACCEPT,
        hint: 'Capture pages with your camera, or drop image files.',
      }}
      registerInject={(inject) => {
        injectRef.current = inject;
      }}
      optionsPanel={
        <CameraCapture
          onCapture={(name, bytes) => {
            injectRef.current?.([{ name, bytes }]);
            setCaptured((n) => n + 1);
          }}
          capturedCount={captured}
        />
      }
      buildOptions={() => ({})}
    />
  );
}

/* ---------------- PDF Group B (engine) pages ---------------- */

function OfficeConversionPage({
  tool,
  target,
}: ToolPageSpec & { target: 'word' | 'excel' | 'powerpoint' }) {
  const [direction, setDirection] = useState<'to-pdf' | 'from-pdf'>('to-pdf');
  const [file, setFile] = useState<EngineClientFile | undefined>(undefined);

  const accept =
    direction === 'to-pdf'
      ? target === 'word'
        ? '.doc,.docx'
        : target === 'excel'
          ? '.xls,.xlsx'
          : '.ppt,.pptx'
      : '.pdf,application/pdf';

  const validate = (): string | undefined => {
    if (file === undefined) return 'Select a file first';
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (direction === 'to-pdf' && ext === 'pdf')
      return 'Pick an Office document (not a PDF) for this direction';
    if (direction === 'from-pdf' && ext !== 'pdf') return 'Pick a PDF for this direction';
    if (direction === 'from-pdf' && target === 'excel') {
      return 'PDF → Excel isn’t supported (no spreadsheet PDF import exists)';
    }
    return undefined;
  };

  return (
    <EngineRunnerPage
      tool={tool}
      accept={accept}
      hint={
        direction === 'to-pdf'
          ? 'Select the Office document to convert to PDF'
          : 'Select the PDF to convert to an Office format'
      }
      optionsPanel={
        <div className="lt-options">
          <Field label="Direction" htmlFor="office-direction">
            <select
              id="office-direction"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as 'to-pdf' | 'from-pdf');
                setFile(undefined);
              }}
              className="lt-input"
            >
              <option value="to-pdf">Office → PDF</option>
              <option value="from-pdf">PDF → Office</option>
            </select>
          </Field>
        </div>
      }
      validate={validate}
      endpoint="/pdf/office-conversion"
      buildOptions={() => ({ target, direction, file: 0 })}
      multiple={false}
    />
  );
}

function OcrPage({ tool }: ToolPageSpec) {
  const [language, setLanguage] = useState('eng');
  const [clean, setClean] = useState(false);
  const [rotate, setRotate] = useState(true);
  const [skipText, setSkipText] = useState(true);
  return (
    <EngineRunnerPage
      tool={tool}
      accept=".pdf,application/pdf"
      hint="Select a scanned PDF to make it searchable"
      optionsPanel={
        <div className="lt-options">
          <Field label="Language" htmlFor="ocr-language">
            <select
              id="ocr-language"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
              }}
              className="lt-input"
            >
              <option value="eng">English</option>
            </select>
          </Field>
          <label className="lt-check">
            <input
              type="checkbox"
              checked={rotate}
              onChange={(e) => {
                setRotate(e.target.checked);
              }}
            />{' '}
            Rotate pages upright first
          </label>
          <label className="lt-check">
            <input
              type="checkbox"
              checked={skipText}
              onChange={(e) => {
                setSkipText(e.target.checked);
              }}
            />{' '}
            Skip pages that already have text
          </label>
          <label className="lt-check">
            <input
              type="checkbox"
              checked={clean}
              onChange={(e) => {
                setClean(e.target.checked);
              }}
            />{' '}
            Clean &amp; deskew (slower, better on photos)
          </label>
        </div>
      }
      endpoint="/pdf/ocr"
      buildOptions={() => ({ language, clean, skipText, rotate, file: 0 })}
    />
  );
}

function DeepCompressPage({ tool }: ToolPageSpec) {
  const [preset, setPreset] = useState<'screen' | 'ebook' | 'printer'>('ebook');
  return (
    <EngineRunnerPage
      tool={tool}
      accept=".pdf,application/pdf"
      hint="Select a PDF for deep (Ghostscript) compression"
      optionsPanel={
        <div className="lt-options">
          <Field label="Quality" htmlFor="compress-preset">
            <select
              id="compress-preset"
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value as 'screen' | 'ebook' | 'printer');
              }}
              className="lt-input"
            >
              <option value="screen">Screen — smallest (72 dpi)</option>
              <option value="ebook">Ebook — balanced (150 dpi)</option>
              <option value="printer">Printer — highest (300 dpi)</option>
            </select>
          </Field>
        </div>
      }
      endpoint="/pdf/deep-compress"
      buildOptions={() => ({ preset, file: 0 })}
    />
  );
}

function PdfToPdfAPage({ tool }: ToolPageSpec) {
  const [flavor, setFlavor] = useState<'2b' | '3b'>('2b');
  return (
    <EngineRunnerPage
      tool={tool}
      accept=".pdf,application/pdf"
      hint="Select a PDF to convert to the archival PDF/A format"
      optionsPanel={
        <div className="lt-options">
          <Field label="PDF/A flavor" htmlFor="pdfa-flavor">
            <select
              id="pdfa-flavor"
              value={flavor}
              onChange={(e) => {
                setFlavor(e.target.value as '2b' | '3b');
              }}
              className="lt-input"
            >
              <option value="2b">PDF/A-2b (recommended)</option>
              <option value="3b">PDF/A-3b</option>
            </select>
          </Field>
        </div>
      }
      endpoint="/pdf/pdf-a"
      buildOptions={() => ({ flavor, file: 0 })}
    />
  );
}

function DeepRepairPage({ tool }: ToolPageSpec) {
  return (
    <EngineRunnerPage
      tool={tool}
      accept=".pdf,application/pdf"
      hint="Select a damaged PDF to attempt a deep repair"
      endpoint="/pdf/deep-repair"
      buildOptions={() => ({ file: 0 })}
    />
  );
}

function HtmlToPdfPage({ tool }: ToolPageSpec) {
  const [renderer, setRenderer] = useState<'weasyprint' | 'playwright'>('weasyprint');
  const [pageSize, setPageSize] = useState('A4');
  const [margin, setMargin] = useState('15');
  return (
    <EngineRunnerPage
      tool={tool}
      accept=".html,.htm,text/html"
      hint="Select an HTML file to render as a PDF"
      optionsPanel={
        <div className="lt-options">
          <Field label="Renderer" htmlFor="html-renderer">
            <select
              id="html-renderer"
              value={renderer}
              onChange={(e) => {
                setRenderer(e.target.value as 'weasyprint' | 'playwright');
              }}
              className="lt-input"
            >
              <option value="weasyprint">WeasyPrint — default, fast</option>
              <option value="playwright">
                Playwright — for JS-heavy pages (optional download)
              </option>
            </select>
          </Field>
          <Field label="Page size" htmlFor="html-pagesize">
            <select
              id="html-pagesize"
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value);
              }}
              className="lt-input"
            >
              <option value="A4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </Field>
          <Field label="Margin (mm)" htmlFor="html-margin">
            <Input
              id="html-margin"
              value={margin}
              onChange={(e) => {
                setMargin(e.target.value);
              }}
              inputMode="numeric"
            />
          </Field>
        </div>
      }
      endpoint="/pdf/html-to-pdf"
      buildOptions={() => {
        const mm = Number(margin);
        const m = Number.isFinite(mm) && mm >= 0 && mm <= 200 ? mm : 15;
        return {
          renderer,
          pageSize,
          marginMm: { top: m, right: m, bottom: m, left: m },
          file: 0,
        };
      }}
    />
  );
}
