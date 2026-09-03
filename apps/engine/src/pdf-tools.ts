/**
 * PDF Group B tool implementations (PROJECT_SPEC Sections 3.1, 4.1).
 *
 * Every tool: input path(s) inside the per-request temp dir → output file
 * in the same temp dir. All subprocess calls use runTool() (spawn +
 * argument array + SIGTERM→SIGKILL discipline — Section 5.3).
 */

import { stat, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { EngineToolError } from './errors.js';
import { runSubprocess, type RunSubprocessOptions } from './subprocess.js';
import { toolPaths } from './tool-paths.js';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export interface RunCtx {
  timeoutMs: number;
}

/** Run a native tool; map ENOENT → tool-unavailable, non-zero → tool-failed. */
async function runTool(
  op: string,
  exe: string,
  args: readonly string[],
  ctx: RunCtx,
  opts: { cwd?: string; env?: Record<string, string>; allowFailure?: boolean } = {},
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnFailed: boolean;
}> {
  const options: RunSubprocessOptions = { timeoutMs: ctx.timeoutMs };
  if (opts.cwd !== undefined) options.cwd = opts.cwd;
  if (opts.env !== undefined) options.env = opts.env;
  const result = await runSubprocess(exe, args, options);
  if (result.spawnFailed) {
    throw new EngineToolError(
      'tool-unavailable',
      `This tool needs a component that isn’t installed (${op}).`,
    );
  }
  if (result.timedOut) {
    throw new EngineToolError('tool-timeout', 'The operation took too long and was stopped.');
  }
  if (result.code !== 0 && opts.allowFailure !== true) {
    throw new EngineToolError(
      'tool-failed',
      'The file could not be processed — it may be damaged or unsupported.',
    );
  }
  return result;
}

async function outputNonEmpty(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.size > 0;
  } catch {
    return false;
  }
}

/** Display-name base without extension, sanitized. */
export function baseName(displayName: string): string {
  return (
    displayName
      .replace(/\.[^.]+$/, '')
      // eslint-disable-next-line no-control-regex -- control chars are exactly what we strip
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
      .slice(0, 60) || 'document'
  );
}

/* ------------------------------------------------------------------ */
/* Ghostscript: deep compress / PDF-A / deep repair (Section 4.1)      */
/* ------------------------------------------------------------------ */

export type GsPreset = 'screen' | 'ebook' | 'printer';

/** Deep-compress via Ghostscript pdfwrite with /screen /ebook /printer presets. */
export async function deepCompress(
  inputPath: string,
  outputPath: string,
  preset: GsPreset,
  ctx: RunCtx,
): Promise<void> {
  const gs = (await toolPaths()).gs;
  const args = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    `-dPDFSETTINGS=/${preset}`,
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  await runTool('ghostscript', gs, args, ctx);
  if (!(await outputNonEmpty(outputPath))) {
    throw new EngineToolError(
      'tool-failed',
      'Compression produced no output — the input may be damaged.',
    );
  }
}

/** Convert to PDF/A-2b or -3b via Ghostscript. */
export async function toPdfA(
  inputPath: string,
  outputPath: string,
  flavor: '2b' | '3b',
  ctx: RunCtx,
): Promise<void> {
  const gs = (await toolPaths()).gs;
  const args = [
    '-sDEVICE=pdfwrite',
    `-dPDFA=${flavor === '2b' ? '2' : '3'}`,
    '-dPDFACompatibilityPolicy=1',
    '-sColorConversionStrategy=sRGB',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  await runTool('ghostscript', gs, args, ctx);
  if (!(await outputNonEmpty(outputPath))) {
    throw new EngineToolError(
      'tool-failed',
      'PDF/A conversion produced no output — the input may be damaged.',
    );
  }
}

/** Deep-repair a damaged PDF: recover pass then clean rewrite. */
export async function deepRepair(
  inputPath: string,
  outputPath: string,
  ctx: RunCtx,
): Promise<void> {
  const gs = (await toolPaths()).gs;
  const workPath = `${outputPath}.pass1`;
  const pass1 = [
    '-sDEVICE=pdfwrite',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    '-dPDFSTOPONERROR=false',
    `-sOutputFile=${workPath}`,
    inputPath,
  ];
  // Tolerate pass-1 failure: a broken input is exactly what we're asked
  // to salvage; success is decided by whether a non-empty file appeared.
  await runTool('ghostscript', gs, pass1, ctx, { allowFailure: true });
  if (!(await outputNonEmpty(workPath))) {
    throw new EngineToolError('tool-failed', 'This PDF could not be recovered.');
  }
  const pass2 = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    `-sOutputFile=${outputPath}`,
    workPath,
  ];
  await runTool('ghostscript', gs, pass2, ctx);
  if (!(await outputNonEmpty(outputPath))) {
    throw new EngineToolError('tool-failed', 'This PDF could not be recovered.');
  }
}

/* ------------------------------------------------------------------ */
/* OCR: OCRmyPDF primary, Tesseract fallback (Section 4.1)              */
/* ------------------------------------------------------------------ */

export interface OcrOptions {
  language: string;
  clean: boolean;
  skipText: boolean;
  rotate: boolean;
}

/** OCR a PDF. Uses OCRmyPDF when installed; else Ghostscript→Tesseract. */
export async function ocrPdf(
  inputPath: string,
  outputPath: string,
  opts: OcrOptions,
  ctx: RunCtx,
): Promise<void> {
  const paths = await toolPaths();
  if (paths.ocrmypdf !== undefined) {
    const args = [
      '--output-type',
      'pdfa',
      '--optimize',
      '0',
      '--language',
      opts.language,
      ...(opts.rotate ? ['--rotate-pages'] : []),
      ...(opts.skipText ? ['--skip-text'] : []),
      ...(opts.clean ? ['--clean', '--deskew'] : []),
      inputPath,
      outputPath,
    ];
    await runTool('ocrmypdf', paths.ocrmypdf, args, ctx);
    if (!(await outputNonEmpty(outputPath))) {
      throw new EngineToolError('tool-failed', 'OCR produced no output — try a clearer scan.');
    }
    return;
  }
  await ocrViaTesseract(inputPath, outputPath, opts, ctx);
}

/**
 * Tesseract fallback: Ghostscript rasterizes each page to TIFF, Tesseract
 * OCRed each TIFF into a one-page PDF (visible image + invisible text),
 * Ghostscript concatenates. Documented in DECISIONS.md.
 */
async function ocrViaTesseract(
  inputPath: string,
  outputPath: string,
  opts: OcrOptions,
  ctx: RunCtx,
): Promise<void> {
  const paths = await toolPaths();
  const fsp = await import('node:fs/promises');
  const nodePath = await import('node:path');
  const work = join(nodePath.dirname(inputPath), 'ocrwork');
  await fsp.mkdir(work, { recursive: true });

  // 1. Rasterize: tiff24nc at 200dpi (OCR sweet spot for 10-12pt text).
  const tiffPattern = join(work, 'page-%06d.tiff');
  await runTool(
    'ghostscript',
    paths.gs,
    [
      '-sDEVICE=tiff24nc',
      '-r200',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-dQUIET',
      `-sOutputFile=${tiffPattern}`,
      inputPath,
    ],
    ctx,
  );

  const tiffs = (await fsp.readdir(work)).filter((f) => f.endsWith('.tiff')).sort();
  if (tiffs.length === 0) {
    throw new EngineToolError('tool-failed', 'No pages could be rendered for OCR.');
  }

  // 2. OCR each page to a searchable single-page PDF (pdf config) —
  //    language must exist in tessdata or tesseract errors (tool-failed).
  for (const tiff of tiffs) {
    const base = tiff.replace(/\.tiff$/, '');
    await runTool(
      'tesseract',
      paths.tesseract,
      [
        join(work, tiff),
        join(work, base),
        '-l',
        opts.language,
        '--tessdata-dir',
        paths.tessdata,
        'pdf',
      ],
      ctx,
    );
  }

  // 3. Concatenate page PDFs into the final searchable document.
  await runTool(
    'ghostscript',
    paths.gs,
    [
      '-sDEVICE=pdfwrite',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-dQUIET',
      `-sOutputFile=${outputPath}`,
      ...tiffs.map((t) => join(work, t.replace(/\.tiff$/, '.pdf'))),
    ],
    ctx,
  );
  if (!(await outputNonEmpty(outputPath))) {
    throw new EngineToolError('tool-failed', 'OCR produced no output — try a clearer scan.');
  }
}

/* ------------------------------------------------------------------ */
/* PDF ↔ Office via LibreOffice headless (Section 4.1)                 */
/* ------------------------------------------------------------------ */

export type OfficeTarget = 'word' | 'excel' | 'powerpoint';
export type OfficeDirection = 'to-pdf' | 'from-pdf';

/** LibreOffice conversion spec per target for the from-PDF direction.
 * Verified against LibreOffice 26.8.0.3: the PDF import filter must be
 * pinned via --infilter (default is Draw's, whose model exports invalid
 * files under Word/Excel filters), and the export filter must be the
 * explicit OOXML one. PDF→Excel is NOT possible on stock LibreOffice
 * (no Calc PDF import exists — only draw/impress/writer) and is rejected
 * with a clear error in the route (recorded in DECISIONS.md D-015). */
const FROM_PDF_CHAIN: Readonly<
  Partial<Record<OfficeTarget, { infilter: string; convertTo: string; ext: string }>>
> = {
  word: { infilter: 'writer_pdf_import', convertTo: 'docx:MS Word 2007 XML', ext: 'docx' },
  powerpoint: {
    infilter: 'impress_pdf_import',
    convertTo: 'pptx:Impress MS PowerPoint 2007 XML',
    ext: 'pptx',
  },
};

export interface OfficeConversionResult {
  outputName: string;
  outputPath: string;
}

/** Convert Office→PDF or PDF→Office via LibreOffice headless. */
export async function officeConvert(
  inputPath: string,
  target: OfficeTarget,
  direction: OfficeDirection,
  outDir: string,
  ctx: RunCtx,
): Promise<OfficeConversionResult> {
  // PDF→Excel is impossible on stock LibreOffice (no Calc PDF import —
  // only draw/impress/writer). Fail with a clear, specific message rather
  // than emitting an invalid file (DECISIONS.md D-015).
  if (direction === 'from-pdf' && target === 'excel') {
    throw new EngineToolError(
      'invalid-option',
      'PDF → Excel isn’t supported by the conversion engine (LibreOffice has no spreadsheet PDF import). Convert to Word or PowerPoint instead.',
    );
  }
  const paths = await toolPaths();
  // Windows: soffice.exe is a GUI shim; the console wrapper soffice.com
  // exists beside it and gives real stdio + exit codes.
  const exe = await consoleSoffice(paths.soffice);
  const nodePath2 = await import('node:path');
  const inputName = nodePath2.parse(inputPath).name;
  const fromChain = direction === 'from-pdf' ? FROM_PDF_CHAIN[target] : undefined;
  const convertTo = fromChain?.convertTo ?? 'pdf';
  const filterExt = fromChain?.ext ?? 'pdf';
  const args = [
    '--headless',
    '-env:UserInstallation=' + userInstallationUrl(outDir),
    '--norestore',
    '--invisible',
    '--nodefault',
    '--nolockcheck',
    '--nologo',
    // From-PDF: pin the import filter so the document model matches the
    // target app (default is Draw's, whose model exports invalid files);
    // to-PDF: no infilter needed, LibreOffice picks by input type.
    ...(fromChain !== undefined ? [`--infilter=${fromChain.infilter}`] : []),
    '--convert-to',
    convertTo,
    '--outdir',
    outDir,
    inputPath,
  ];
  const result = await runTool('libreoffice', exe, args, ctx);
  const produced = join(outDir, `${inputName}.${filterExt}`);
  if (!(await outputNonEmpty(produced))) {
    throw new EngineToolError(
      'tool-failed',
      'Conversion produced no output — the file may be damaged or an unsupported variant.',
    );
  }
  void result;
  return { outputName: `${inputName}.${filterExt}`, outputPath: produced };
}

async function consoleSoffice(soffice: string): Promise<string> {
  if (!soffice.endsWith('.exe')) return soffice;
  const nodePath3 = await import('node:path');
  const com = join(nodePath3.parse(soffice).dir, 'soffice.com');
  try {
    await stat(com);
    return com;
  } catch {
    return soffice;
  }
}

/**
 * LibreOffice user-profile URL for one invocation. A shared profile is
 * single-instance: concurrent/stale invocations block or misbehave on the
 * lock. A per-request profile (inside the request temp dir) removes the
 * contention entirely. -env:UserInstallation needs a file:// URL.
 */
function userInstallationUrl(outDir: string): string {
  const profile = join(outDir, 'lo-profile');
  const posix = profile.replace(/\\/g, '/');
  return `file:///${posix.startsWith('/') ? posix.slice(1) : posix}`;
}

/* ------------------------------------------------------------------ */
/* HTML → PDF: WeasyPrint default, Playwright opt-in (Section 4.1)     */
/* ------------------------------------------------------------------ */

export interface HtmlToPdfOptions {
  renderer: 'weasyprint' | 'playwright';
  pageSize: string;
  marginMm: { top: number; right: number; bottom: number; left: number };
}

/** Convert an HTML file to PDF. */
export async function htmlToPdf(
  inputPath: string,
  outputPath: string,
  opts: HtmlToPdfOptions,
  ctx: RunCtx,
): Promise<void> {
  if (opts.renderer === 'playwright') {
    await playwrightRender(inputPath, outputPath, opts, ctx);
    return;
  }
  await weasyprintRender(inputPath, outputPath, opts, ctx);
}

async function weasyprintRender(
  inputPath: string,
  outputPath: string,
  opts: HtmlToPdfOptions,
  ctx: RunCtx,
): Promise<void> {
  const paths = await toolPaths();
  const wp = paths.weasyprint;
  if (wp === undefined) {
    throw new EngineToolError(
      'tool-unavailable',
      'This tool needs WeasyPrint, which isn’t installed on this device.',
    );
  }
  // CLI contract (verified against installed WeasyPrint 69 --help):
  //   weasyprint [-s STYLESHEETS] <input> <output>
  // -s is a user STYLESHEET (not page size); page size + margins are set
  // through an @page rule in that stylesheet, written per request.
  const { writeFile, unlink } = await import('node:fs/promises');
  const nodePath = await import('node:path');
  const stylePath = join(nodePath.dirname(outputPath), `page-${randomUUID()}.css`);
  await writeFile(
    stylePath,
    `@page { size: ${opts.pageSize}; margin: ${String(opts.marginMm.top)}mm ${String(opts.marginMm.right)}mm ${String(opts.marginMm.bottom)}mm ${String(opts.marginMm.left)}mm; }`,
    'utf8',
  );
  try {
    const args = [...wp.args, '-s', stylePath, inputPath, outputPath];
    const result = await runSubprocess(wp.exe, args, { timeoutMs: ctx.timeoutMs });
    if (result.spawnFailed) {
      throw new EngineToolError(
        'tool-unavailable',
        'This tool needs WeasyPrint, which isn’t installed on this device.',
      );
    }
    if (result.timedOut) {
      throw new EngineToolError('tool-timeout', 'The operation took too long and was stopped.');
    }
    if (result.code !== 0 || !(await outputNonEmpty(outputPath))) {
      throw new EngineToolError('tool-failed', 'The HTML could not be rendered to PDF.');
    }
  } finally {
    await unlink(stylePath).catch(() => {});
  }
}

async function playwrightRender(
  inputPath: string,
  outputPath: string,
  opts: HtmlToPdfOptions,
  ctx: RunCtx,
): Promise<void> {
  const paths = await toolPaths();
  if (!paths.playwrightEnabled) {
    throw new EngineToolError(
      'tool-unavailable',
      'JS-heavy page rendering needs the optional Playwright component (not installed).',
    );
  }
  // Playwright runs via a dedicated Node runner script with an argument
  // array (never a shell string); the runner script ships with the engine.
  const runnerArgs = [
    'apps/engine/scripts/playwright-pdf.mjs',
    inputPath,
    outputPath,
    opts.pageSize,
    `${String(opts.marginMm.top)}mm`,
    `${String(opts.marginMm.right)}mm`,
    `${String(opts.marginMm.bottom)}mm`,
    `${String(opts.marginMm.left)}mm`,
  ];
  const result = await runSubprocess(process.execPath, runnerArgs, { timeoutMs: ctx.timeoutMs });
  if (result.spawnFailed) {
    throw new EngineToolError('tool-unavailable', 'The Playwright renderer isn’t installed.');
  }
  if (result.timedOut) {
    throw new EngineToolError('tool-timeout', 'The operation took too long and was stopped.');
  }
  if (result.code !== 0 || !(await outputNonEmpty(outputPath))) {
    throw new EngineToolError('tool-failed', 'The HTML could not be rendered to PDF.');
  }
}

export { readFile };
