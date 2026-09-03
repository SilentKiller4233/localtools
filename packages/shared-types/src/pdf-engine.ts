/**
 * Engine request/response schemas for PDF Group B tools (PROJECT_SPEC
 * Sections 3.1, 5, 15 Phase 4). These are the single source of truth shared
 * by apps/client and apps/engine; the engine validates every request body
 * against the same zod schema the client builds.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Output file the engine returns: base64 bytes + sanitized display name. */
export const EngineFileSchema = z.object({
  /** Output file base name without extension (already sanitized). */
  name: z.string().min(1).max(128),
  /** File extension, lowercase, no dot (e.g. "pdf"). */
  ext: z.string().min(1).max(8),
  /** Base64-encoded file contents. */
  data: z.string().min(1),
});

export type EngineFile = z.infer<typeof EngineFileSchema>;

/** Direction for the Office conversion endpoint. */
export const OfficeConversionDirection = z.enum(['to-pdf', 'from-pdf']);
export type OfficeConversionDirectionValue = z.infer<typeof OfficeConversionDirection>;

/* ------------------------------------------------------------------ */
/* PDF Group B request schemas (one per Section 3.1 tool)              */
/* ------------------------------------------------------------------ */

/**
 * PDF ↔ Word/Excel/PowerPoint via LibreOffice headless.
 * `target` selects the tool card; `direction` selects the conversion.
 * to-pdf accepts .doc/.docx/.xls/.xlsx/.ppt/.pptx (magic-byte validated).
 * from-pdf accepts a PDF and converts via LibreOffice's PDF import filter.
 */
export const OfficeConversionRequestSchema = z.object({
  target: z.enum(['word', 'excel', 'powerpoint']),
  direction: OfficeConversionDirection,
  /** Input file. Index into the request's files array. */
  file: z.number().int().min(0),
});

/**
 * OCR via OCRmyPDF (engine) with a direct Tesseract fallback for hosts
 * where OCRmyPDF is not installed (documented in DECISIONS.md).
 */
export const OcrPdfRequestSchema = z.object({
  /** Input PDF file index. */
  file: z.number().int().min(0),
  /** OCR language pack(s), e.g. "eng" or "eng+deu". Default "eng". */
  language: z
    .string()
    .regex(/^[a-z]{3}([+-][a-z]{3})*$/)
    .max(20)
    .default('eng'),
  /** Clean and deskew input pages before OCR (slower, better on photos). */
  clean: z.boolean().default(false),
  /** Skip pages that already contain a text layer. */
  skipText: z.boolean().default(true),
  /** Rotate pages to their upright orientation first. */
  rotate: z.boolean().default(true),
});

/**
 * Deep compress / PDF/A conversion / deep repair — all Ghostscript.
 * One endpoint per tool, shared option subset.
 */
export const DeepCompressRequestSchema = z.object({
  file: z.number().int().min(0),
  /** Quality preset: screen (72dpi), ebook (150dpi), printer (300dpi). */
  preset: z.enum(['screen', 'ebook', 'printer']).default('ebook'),
});

export const PdfToPdfARequestSchema = z.object({
  file: z.number().int().min(0),
  /** PDF/A flavor: 2b (default, most compatible with sRGB output). */
  flavor: z.enum(['2b', '3b']).default('2b'),
});

export const DeepRepairRequestSchema = z.object({
  file: z.number().int().min(0),
});

/**
 * HTML → PDF. WeasyPrint by default; Playwright+Chromium opt-in for
 * JS-heavy pages (renderer option; the engine errors if unavailable).
 */
export const HtmlToPdfRequestSchema = z.object({
  /** Input HTML file index, or (when `html` is set) a reference to a file
   * containing the inline HTML document. Exactly one is required. */
  file: z.number().int().min(0).optional(),
  /** Inline HTML document (raw string, size-capped like a file). */
  html: z.string().max(2_000_000).optional(),
  /** Renderer: weasyprint (default) or playwright (JS-heavy pages). */
  renderer: z.enum(['weasyprint', 'playwright']).default('weasyprint'),
  /** Page size, e.g. "A4" or "letter". */
  pageSize: z
    .string()
    .regex(/^[A-Za-z0-9 -]{1,20}$/)
    .default('A4'),
  /** Page margins in mm. */
  marginMm: z
    .object({
      top: z.number().min(0).max(200).default(15),
      right: z.number().min(0).max(200).default(15),
      bottom: z.number().min(0).max(200).default(15),
      left: z.number().min(0).max(200).default(15),
    })
    .default({ top: 15, right: 15, bottom: 15, left: 15 }),
});

export type OfficeConversionRequest = z.infer<typeof OfficeConversionRequestSchema>;
export type OcrPdfRequest = z.infer<typeof OcrPdfRequestSchema>;
export type DeepCompressRequest = z.infer<typeof DeepCompressRequestSchema>;
export type PdfToPdfARequest = z.infer<typeof PdfToPdfARequestSchema>;
export type DeepRepairRequest = z.infer<typeof DeepRepairRequestSchema>;
export type HtmlToPdfRequest = z.infer<typeof HtmlToPdfRequestSchema>;
