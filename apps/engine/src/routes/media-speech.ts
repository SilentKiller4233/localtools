/**
 * Media speech routes (PROJECT_SPEC Phase 9, Sections 3.2, 15; D-031).
 *
 * POST /media/text-to-speech — Piper TTS; text rides in options (like
 * html-to-pdf's inline HTML), allowNoFiles.
 * POST /media/pdf-to-audiobook — PDF upload → chapters → chunks →
 * Piper WAVs → one file (or per-chapter), both through the existing
 * GroupBRequestHarness (magic-byte PDF sniff, size caps, per-request
 * temp dir + sweeper, concurrency → 429).
 *
 * Section 5.6: the spoken TEXT is user content — logs carry op + rid +
 * duration only, never the text or filenames. Piper receives text on
 * stdin (Section 5.3 arg arrays; no shell strings anywhere).
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PdfToAudiobookRequestSchema, TextToSpeechRequestSchema } from '@localtools/shared-types';
import type { EngineConfig } from '../config.js';
import type { SubprocessLimiter } from '../limiter.js';
import { GroupBRequestHarness, type GroupBContext, type GroupBOutput } from '../request-harness.js';
import { EngineToolError } from '../errors.js';
import { textToSpeechWav, pdfToAudiobookFiles } from '../speech/piper-tools.js';

const PDF_IN = ['pdf'] as const;

export function registerMediaSpeechRoutes(
  app: FastifyInstance,
  config: EngineConfig,
  limiter: SubprocessLimiter,
): void {
  const harness = new GroupBRequestHarness(config, limiter);

  /* ---------------------------------------------------------------- */
  /* 1. Text-to-speech (Piper; no file parts required)                 */
  /* ---------------------------------------------------------------- */
  app.post('/media/text-to-speech', async (request, reply) => {
    await harness.run(
      {
        op: 'text-to-speech',
        accepted: PDF_IN,
        schema: TextToSpeechRequestSchema,
        allowNoFiles: true,
      },
      async (ctx: GroupBContext): Promise<GroupBOutput> => {
        const opts = TextToSpeechRequestSchema.parse(ctx.options);
        const outPath = join(ctx.temp.path, `speech-${randomUUID()}.wav`);
        await textToSpeechWav(opts.text, opts.voice, opts.speed, outPath, ctx);
        const bytes = new Uint8Array(await readFile(outPath));
        return { files: [{ name: 'speech', ext: 'wav', bytes }] };
      },
      request,
      reply,
    );
  });

  /* ---------------------------------------------------------------- */
  /* 2. PDF → audiobook (pdf-core extraction + Piper synthesis)         */
  /* ---------------------------------------------------------------- */
  app.post('/media/pdf-to-audiobook', async (request, reply) => {
    await harness.run(
      {
        op: 'pdf-to-audiobook',
        accepted: PDF_IN,
        schema: PdfToAudiobookRequestSchema,
      },
      async (ctx: GroupBContext): Promise<GroupBOutput> => {
        const opts = PdfToAudiobookRequestSchema.parse(ctx.options);
        const file = ctx.files[opts.file];
        if (file === undefined) {
          throw new EngineToolError('no-inputs', 'Select a PDF to read aloud.');
        }
        const pdfBytes = new Uint8Array(await readFile(file.path));
        const outputs = await pdfToAudiobookFiles(
          pdfBytes,
          opts.voice,
          opts.speed,
          opts.perChapter,
          ctx.temp.path,
          ctx,
        );
        return { files: outputs };
      },
      request,
      reply,
    );
  });
}
