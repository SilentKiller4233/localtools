/**
 * PDF Group B routes (PROJECT_SPEC Phase 4).
 *
 * Six endpoints, one per Section 3.1 Group B tool, all sharing the
 * request harness (full Section 5 control set — see request-harness.ts).
 * Every handler receives validated inputs and returns output files; all
 * subprocess discipline lives in pdf-tools.ts + subprocess.ts.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DeepCompressRequestSchema,
  DeepRepairRequestSchema,
  HtmlToPdfRequestSchema,
  OfficeConversionRequestSchema,
  OcrPdfRequestSchema,
  PdfToPdfARequestSchema,
} from '@localtools/shared-types';
import type { z } from 'zod';
import type { EngineConfig } from '../config.js';
import type { SubprocessLimiter } from '../limiter.js';
import { GroupBRequestHarness, type GroupBContext, type GroupBOutput } from '../request-harness.js';
import { EngineToolError } from '../errors.js';
import {
  baseName,
  deepCompress,
  deepRepair,
  htmlToPdf,
  officeConvert,
  ocrPdf,
  toPdfA,
} from '../pdf-tools.js';

/** Tool ids accepted per endpoint (Section 3.1 Group B list). */
const PDF_ONLY = ['pdf'] as const;
const OFFICE_INPUTS = ['pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'] as const;
const HTML_INPUTS = ['html'] as const;

export function registerPdfGroupBRoutes(
  app: FastifyInstance,
  config: EngineConfig,
  limiter: SubprocessLimiter,
): void {
  const harness = new GroupBRequestHarness(config, limiter);

  const register = (
    url: string,
    op: string,
    accepted:
      | readonly (typeof PDF_ONLY)[number][]
      | readonly (typeof OFFICE_INPUTS)[number][]
      | readonly (typeof HTML_INPUTS)[number][],
    schema: z.ZodType,
    handler: (ctx: GroupBContext) => Promise<GroupBOutput>,
    extra: { allowNoFiles?: boolean } = {},
  ): void => {
    app.post(url, async (request: FastifyRequest, reply: FastifyReply) => {
      await harness.run(
        { op, accepted, schema, ...(extra.allowNoFiles ? { allowNoFiles: true } : {}) },
        handler,
        request,
        reply,
      );
    });
  };

  /* POST /pdf/office-conversion — PDF ↔ Word/Excel/PowerPoint (LibreOffice) */
  register(
    '/pdf/office-conversion',
    'office-conversion',
    OFFICE_INPUTS,
    OfficeConversionRequestSchema,
    async (ctx) => {
      const opts = OfficeConversionRequestSchema.parse(ctx.options);
      const file = ctx.files[opts.file];
      if (file === undefined)
        throw new EngineToolError('no-inputs', 'Select at least one file first.');
      // Direction + target must make sense for the uploaded kind: to-pdf
      // needs an Office input; from-pdf needs a PDF.
      const isOffice = file.kind !== 'pdf';
      if (opts.direction === 'to-pdf' && !isOffice) {
        throw new EngineToolError(
          'invalid-file',
          'This direction needs an Office document (doc/docx/xls/xlsx/ppt/pptx).',
        );
      }
      if (opts.direction === 'from-pdf' && file.kind !== 'pdf') {
        throw new EngineToolError('invalid-file', 'This direction needs a PDF file.');
      }
      const result = await officeConvert(file.path, opts.target, opts.direction, ctx.outDir, ctx);
      const bytes = await readFile(result.outputPath);
      const ext = result.outputName.split('.').pop() ?? 'pdf';
      return { files: [{ name: baseName(file.displayName), ext, bytes: new Uint8Array(bytes) }] };
    },
  );

  /* POST /pdf/ocr — OCRmyPDF (Tesseract fallback) */
  register('/pdf/ocr', 'ocr', PDF_ONLY, OcrPdfRequestSchema, async (ctx) => {
    const opts = OcrPdfRequestSchema.parse(ctx.options);
    const file = ctx.files[opts.file];
    if (file === undefined)
      throw new EngineToolError('no-inputs', 'Select at least one file first.');
    const outputPath = join(ctx.temp.path, `ocr-${randomUUID()}.pdf`);
    await ocrPdf(
      file.path,
      outputPath,
      { language: opts.language, clean: opts.clean, skipText: opts.skipText, rotate: opts.rotate },
      ctx,
    );
    const bytes = await readFile(outputPath);
    return {
      files: [{ name: baseName(file.displayName), ext: 'pdf', bytes: new Uint8Array(bytes) }],
    };
  });

  /* POST /pdf/deep-compress — Ghostscript */
  register(
    '/pdf/deep-compress',
    'deep-compress',
    PDF_ONLY,
    DeepCompressRequestSchema,
    async (ctx) => {
      const opts = DeepCompressRequestSchema.parse(ctx.options);
      const file = ctx.files[opts.file];
      if (file === undefined)
        throw new EngineToolError('no-inputs', 'Select at least one file first.');
      const outputPath = join(ctx.temp.path, `compressed-${randomUUID()}.pdf`);
      await deepCompress(file.path, outputPath, opts.preset, ctx);
      const bytes = await readFile(outputPath);
      return {
        files: [{ name: baseName(file.displayName), ext: 'pdf', bytes: new Uint8Array(bytes) }],
      };
    },
  );

  /* POST /pdf/pdf-a — Ghostscript */
  register('/pdf/pdf-a', 'pdf-a', PDF_ONLY, PdfToPdfARequestSchema, async (ctx) => {
    const opts = PdfToPdfARequestSchema.parse(ctx.options);
    const file = ctx.files[opts.file];
    if (file === undefined)
      throw new EngineToolError('no-inputs', 'Select at least one file first.');
    const outputPath = join(ctx.temp.path, `pdfa-${randomUUID()}.pdf`);
    await toPdfA(file.path, outputPath, opts.flavor, ctx);
    const bytes = await readFile(outputPath);
    return {
      files: [{ name: baseName(file.displayName), ext: 'pdf', bytes: new Uint8Array(bytes) }],
    };
  });

  /* POST /pdf/deep-repair — Ghostscript */
  register('/pdf/deep-repair', 'deep-repair', PDF_ONLY, DeepRepairRequestSchema, async (ctx) => {
    const opts = DeepRepairRequestSchema.parse(ctx.options);
    const file = ctx.files[opts.file];
    if (file === undefined)
      throw new EngineToolError('no-inputs', 'Select at least one file first.');
    const outputPath = join(ctx.temp.path, `repaired-${randomUUID()}.pdf`);
    await deepRepair(file.path, outputPath, ctx);
    const bytes = await readFile(outputPath);
    return {
      files: [{ name: baseName(file.displayName), ext: 'pdf', bytes: new Uint8Array(bytes) }],
    };
  });

  /* POST /pdf/html-to-pdf — WeasyPrint default, Playwright opt-in */
  register(
    '/pdf/html-to-pdf',
    'html-to-pdf',
    HTML_INPUTS,
    HtmlToPdfRequestSchema,
    async (ctx) => {
      const pre = HtmlToPdfRequestSchema.parse(ctx.options);
      if (pre.html !== undefined && pre.html.length > ctx.config.maxFileSize) {
        throw new EngineToolError(
          'size-limit',
          'The pasted HTML exceeds the processing size limit.',
        );
      }
      const opts = HtmlToPdfRequestSchema.parse(ctx.options);
      let inputPath: string;
      let displayName: string;
      if (opts.html !== undefined) {
        inputPath = await ctx.temp.write(
          `inline-${randomUUID()}.html`,
          new TextEncoder().encode(opts.html),
        );
        displayName = 'document';
      } else if (opts.file !== undefined) {
        const file = ctx.files[opts.file];
        if (file === undefined)
          throw new EngineToolError('no-inputs', 'Select at least one file first.');
        inputPath = file.path;
        displayName = file.displayName;
      } else {
        throw new EngineToolError('no-inputs', 'Provide an HTML file or paste HTML.');
      }
      const outputPath = join(ctx.temp.path, `html-${randomUUID()}.pdf`);
      await htmlToPdf(
        inputPath,
        outputPath,
        {
          renderer: opts.renderer,
          pageSize: opts.pageSize,
          marginMm: opts.marginMm,
        },
        ctx,
      );
      const bytes = await readFile(outputPath);
      return { files: [{ name: baseName(displayName), ext: 'pdf', bytes: new Uint8Array(bytes) }] };
    },
    { allowNoFiles: true },
  );
}
