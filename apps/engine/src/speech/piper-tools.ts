/**
 * Piper TTS + PDF→audiobook tool implementations (PROJECT_SPEC Phase 9,
 * Sections 3.2, 15; DECISIONS.md D-030/D-031).
 *
 * Piper runs as an engine subprocess: argument arrays only (Section 5.3),
 * hard timeout via runSubprocess's SIGTERM→SIGKILL discipline, stdin-fed
 * text lines (text never lands in argv or logs — Section 5.6). Output is
 * sniffed (RIFF/WAVE magic) before returning, mirroring the Section 14.5
 * sanity seam.
 *
 * Audiobook: pdf-core extracts text client-side in the PDF Group A world,
 * but THIS tool is a Group B engine tool — the engine imports pdf-core's
 * extractText directly (pure-TS, no native deps; the same package the
 * client worker uses) and synthesizes chunk-by-chunk per D-030 limits:
 * ≤800 chars per Piper call, ≤500 chunks per job, ≤5MB extracted text.
 */

import { readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { PiperVoiceIdValue } from '@localtools/shared-types';
import { EngineToolError } from '../errors.js';
import { runSubprocess } from '../subprocess.js';
import { toolPaths } from '../tool-paths.js';
import { ensureVoice } from './voices.js';

/** WAV files start with RIFF....WAVE (Section 14.5 output sniff). */
function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

/** Shared run context (timeout comes from the harness config). */
export interface SpeechCtx {
  timeoutMs: number;
}

/** Run one Piper invocation; map spawn/timeout/exit errors to the taxonomy. */
async function runPiper(args: readonly string[], stdinText: string, ctx: SpeechCtx): Promise<void> {
  const paths = await toolPaths();
  const result = await runSubprocess(paths.piper, args, {
    timeoutMs: ctx.timeoutMs,
    stdinData: stdinText,
  });
  if (result.spawnFailed) {
    throw new EngineToolError(
      'tool-unavailable',
      'This tool needs the Piper speech component. On the desktop app it downloads on first use; on Docker it ships with the image.',
    );
  }
  if (result.timedOut) {
    throw new EngineToolError(
      'tool-timeout',
      'The speech synthesis took too long and was stopped.',
    );
  }
  if (result.code !== 0) {
    throw new EngineToolError('tool-failed', 'The text could not be spoken with this voice.');
  }
}

/** speed multiplier → Piper --length_scale (1/§speed; 1.0 = natural). */
function lengthScaleFor(speed: number): number {
  const scale = 1 / speed;
  return Number(scale.toFixed(4));
}

/* ------------------------------------------------------------------ */
/* Text-to-speech                                                      */
/* ------------------------------------------------------------------ */

/**
 * Speak text to a 22050Hz mono WAV. The text travels via stdin (never
 * argv); piper writes the WAV to the out path.
 */
export async function textToSpeechWav(
  text: string,
  voice: PiperVoiceIdValue,
  speed: number,
  outPath: string,
  ctx: SpeechCtx,
): Promise<void> {
  const { onnx, json } = await ensureVoice(voice);
  await runPiper(
    [
      '--model',
      onnx,
      '--config',
      json,
      '--output_file',
      outPath,
      '--length_scale',
      String(lengthScaleFor(speed)),
      '--quiet',
    ],
    `${text.trim()}\n`,
    ctx,
  );
  const bytes = new Uint8Array(await readFile(outPath));
  if (!isWav(bytes)) {
    throw new EngineToolError('tool-failed', 'The speech output was unreadable — try again.');
  }
}

/* ------------------------------------------------------------------ */
/* Audiobook chunking (D-030 limits)                                   */
/* ------------------------------------------------------------------ */

/** Max characters handed to one Piper call. */
export const MAX_CHUNK_CHARS = 800;
/** Max chunks per audiobook job (guards runaway documents). */
export const MAX_CHUNKS = 500;
/** Max extracted-text characters before the job is rejected. */
export const MAX_TEXT_CHARS = 5 * 1024 * 1024;

/**
 * Split text into ≤MAX_CHUNK_CHARS chunks at sentence boundaries (final
 * fallback: hard split). Pure function — unit-tested directly.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized === '') return [];
  const chunks: string[] = [];
  let current = '';
  // Sentence-ish boundary: ., !, ?, or newline followed by whitespace/end.
  const parts = normalized.split(/(?<=[.!?])\s+|\n{2,}/);
  for (const part of parts) {
    for (const piece of hardSplit(part)) {
      if (current === '') {
        current = piece;
      } else if (`${current} ${piece}`.length <= MAX_CHUNK_CHARS) {
        current = `${current} ${piece}`;
      } else {
        chunks.push(current);
        current = piece;
      }
    }
  }
  if (current !== '') chunks.push(current);
  return chunks;
}

/** Split an over-long "sentence" on commas/semicolons, then hard. */
function hardSplit(part: string): string[] {
  if (part.length <= MAX_CHUNK_CHARS) return [part];
  const out: string[] = [];
  const clauses = part.split(/(?<=[,;:])\s+/);
  let cur = '';
  for (const clause of clauses) {
    if (clause.length > MAX_CHUNK_CHARS) {
      if (cur !== '') {
        out.push(cur);
        cur = '';
      }
      for (let i = 0; i < clause.length; i += MAX_CHUNK_CHARS) {
        out.push(clause.slice(i, i + MAX_CHUNK_CHARS));
      }
      continue;
    }
    if (cur === '') cur = clause;
    else if (`${cur} ${clause}`.length <= MAX_CHUNK_CHARS) cur = `${cur} ${clause}`;
    else {
      out.push(cur);
      cur = clause;
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}

/* ------------------------------------------------------------------ */
/* PDF → audiobook                                                     */
/* ------------------------------------------------------------------ */

interface Chapter {
  title: string;
  text: string;
}

/**
 * Build chapters in ONE pdfjs parse: per-page text extraction plus the
 * PDF outline (real chapter boundaries). A flat document degrades to a
 * single chapter. pdfjs is imported directly (pdf-core's extractText is
 * whole-doc text-only) — typed via an untyped-module cast, the same
 * pattern pdf-core's text tool uses. The bytes are COPIED before
 * getDocument: pdfjs transfers (detaches) the buffer it is handed
 * (verified live — a second extraction pass from the same Uint8Array
 * fails with empty-input), and the caller reuses pdfBytes afterwards.
 */
type PdfjsDoc = {
  numPages: number;
  getOutline(): Promise<{ title?: string; dest: unknown }[] | null>;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: ({ str?: string } | { str: string })[] }>;
  }>;
  getPageIndex(ref: unknown): Promise<number>;
  /** pdfjs v6 exposes cleanup() on the proxy (destroy is the loading task's). */
  cleanup(): Promise<void>;
};
type PdfjsLike = { getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfjsDoc> } };

async function extractChapters(pdfBytes: Uint8Array): Promise<Chapter[]> {
  const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as PdfjsLike);
  const pdfCore = await import('@localtools/pdf-core').then(
    (m) =>
      m as {
        loadPdf(bytes: Uint8Array): Promise<unknown>;
        extractText(bytes: Uint8Array): Promise<string>;
      },
  );
  // loadPdf pre-flight validates on a copy (encrypted/malformed → taxonomy).
  await pdfCore.loadPdf(new Uint8Array(pdfBytes));
  // Copy again for pdfjs — it detaches the buffer it receives.
  const doc = await pdfjsModule.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  try {
    const outline = await doc.getOutline();
    if (outline !== null && outline.length > 0) {
      // Per-page text extraction, then slice pages into outline chapters.
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pages.push(pageText);
      }
      const chapters: Chapter[] = [];
      const destPages: number[] = [];
      for (const item of outline) {
        destPages.push(await outlineDestPage(doc, item.dest));
      }
      for (let i = 0; i < outline.length; i += 1) {
        const start = destPages[i] ?? 1;
        // Chapter ends where the next outline entry starts (or last page).
        let end = destPages[i + 1] ?? doc.numPages + 1;
        if (end <= start) end = start + 1; // degenerate/zero-length entries
        const slice = pages.slice(start - 1, end - 1);
        const title = outline[i]?.title ?? `Chapter ${String(i + 1)}`;
        const chapterText = slice.join(' ').trim();
        if (chapterText !== '') chapters.push({ title, text: chapterText });
      }
      if (chapters.length > 0) return chapters;
    }
    // Flat document: all page text as one chapter.
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    return [{ title: 'Document', text: pages.join(' ') }];
  } finally {
    await doc.cleanup();
  }
}

/** Resolve an outline dest to a 1-based page number (best effort). */
async function outlineDestPage(doc: PdfjsDoc, dest: unknown): Promise<number> {
  try {
    if (typeof dest === 'string') return (await doc.getPageIndex(dest)) + 1;
    if (Array.isArray(dest) && dest[0] !== undefined && dest[0] !== null) {
      const ref = dest[0] as { num?: number };
      if (typeof ref === 'object' && typeof ref.num === 'number') {
        return (await doc.getPageIndex(ref)) + 1;
      }
    }
  } catch {
    // fall through
  }
  return 1;
}

/**
 * Synthesize an audiobook: extract → chapters → chunks → per-chunk WAVs
 * → one WAV (or one per chapter) concatenated via ffmpeg.
 */
export async function pdfToAudiobookFiles(
  pdfBytes: Uint8Array,
  voice: PiperVoiceIdValue,
  speed: number,
  perChapter: boolean,
  workDir: string,
  ctx: SpeechCtx,
): Promise<{ name: string; ext: 'wav'; bytes: Uint8Array }[]> {
  // Single-parse extraction (outline chapters or one flat chapter).
  const chapters = await extractChapters(pdfBytes);
  const allText = chapters.map((c) => c.text).join(' ');
  if (allText.trim() === '') {
    throw new EngineToolError(
      'tool-failed',
      'No readable text in this PDF — it may be scanned images. Run OCR first.',
    );
  }
  if (allText.length > MAX_TEXT_CHARS) {
    throw new EngineToolError('size-limit', 'The text in this PDF exceeds the audiobook limit.');
  }
  // Guard: total chunks across all chapters.
  let totalChunks = 0;
  const chapterChunks: { title: string; chunks: string[] }[] = [];
  for (const ch of chapters) {
    const chunks = chunkText(ch.text);
    totalChunks += chunks.length;
    chapterChunks.push({ title: ch.title, chunks });
  }
  if (totalChunks > MAX_CHUNKS) {
    throw new EngineToolError('size-limit', 'This document is too long for the audiobook limit.');
  }

  const { onnx, json } = await ensureVoice(voice);
  const lengthScale = String(lengthScaleFor(speed));

  // Synthesize every chunk to part-<n>.wav in the work dir.
  let index = 0;
  const chapterFiles: { title: string; parts: string[] }[] = [];
  for (const ch of chapterChunks) {
    const parts: string[] = [];
    for (const chunk of ch.chunks) {
      const partPath = join(workDir, `part-${String(index).padStart(5, '0')}.wav`);
      await runPiper(
        [
          '--model',
          onnx,
          '--config',
          json,
          '--output_file',
          partPath,
          '--length_scale',
          lengthScale,
          '--quiet',
        ],
        `${chunk}\n`,
        ctx,
      );
      parts.push(partPath);
      index += 1;
    }
    chapterFiles.push({ title: ch.title, parts });
  }

  const outputs: { name: string; ext: 'wav'; bytes: Uint8Array }[] = [];
  for (const ch of chapterFiles) {
    const outPath = join(workDir, `chapter-${randomUUID()}.wav`);
    if (ch.parts.length === 1) {
      // Single-part chapter: piper's output IS the file.
      const bytes = new Uint8Array(await readFile(ch.parts[0] ?? ''));
      await writeFile(outPath, bytes);
    } else {
      await concatWavs(ch.parts, outPath, ctx);
    }
    const bytes = new Uint8Array(await readFile(outPath));
    if (!isWav(bytes)) {
      throw new EngineToolError('tool-failed', 'The audiobook output was unreadable — try again.');
    }
    outputs.push({ name: sanitizeChapterName(ch.title), ext: 'wav', bytes });
    if (!perChapter) break; // one-file mode: only the first combined file
  }

  // One-file mode with multiple chapters: concatenate ALL chapters.
  if (!perChapter && chapterFiles.length > 1) {
    const allParts = chapterFiles.flatMap((c) => c.parts);
    const outPath = join(workDir, `book-${randomUUID()}.wav`);
    await concatWavs(allParts, outPath, ctx);
    const bytes = new Uint8Array(await readFile(outPath));
    outputs.length = 0;
    outputs.push({ name: 'audiobook', ext: 'wav', bytes });
  }
  return outputs;
}

/** Chapter title → safe file name. */
function sanitizeChapterName(title: string): string {
  return (
    title
      // eslint-disable-next-line no-control-regex -- control chars are exactly what we strip
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
      .trim()
      .slice(0, 60) || 'chapter'
  );
}

/**
 * Concatenate WAV parts via ffmpeg concat demuxer. All parts share the
 * Piper voice's 22050Hz mono format, so stream copy is safe; -y for the
 * fresh out path; list file lives in the same temp dir (sweeper owns it).
 */
async function concatWavs(
  parts: readonly string[],
  outPath: string,
  ctx: SpeechCtx,
): Promise<void> {
  const paths = await toolPaths();
  const listPath = `${outPath}.txt`;
  const list = parts.map((p) => `file '${p.replace(/(['\\])/g, '\\$1')}'`).join('\n');
  await writeFile(listPath, `${list}\n`);
  const result = await runSubprocess(
    paths.ffmpeg.ffmpeg,
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath],
    { timeoutMs: ctx.timeoutMs },
  );
  if (result.spawnFailed) {
    throw new EngineToolError('tool-unavailable', 'This tool needs the ffmpeg component.');
  }
  if (result.timedOut || result.code !== 0) {
    throw new EngineToolError('tool-failed', 'The audiobook parts could not be joined.');
  }
  try {
    const s = await stat(outPath);
    if (s.size === 0) throw new Error('empty');
  } catch {
    throw new EngineToolError('tool-failed', 'The audiobook parts could not be joined.');
  }
}
