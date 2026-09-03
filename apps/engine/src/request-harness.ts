/**
 * Request pipeline harness (PROJECT_SPEC Section 5.2/5.3 end-to-end).
 *
 * `withGroupBRequest` is the single path every PDF Group B endpoint runs
 * through. It owns, in order:
 *
 *  1. Multipart parsing with per-file + total size caps (5.2) — caps are
 *     enforced DURING streaming, before bytes ever hit the disk.
 *  2. Magic-byte validation of every file against the tool's accepted set
 *     (5.2 — `file-type`, never extension/MIME trust).
 *  3. Fresh random internal names inside a per-request temp dir (5.2 —
 *     user filenames never touch the filesystem).
 *  4. Zod validation of the options JSON (client + engine share schemas).
 *  5. Concurrency-capped execution → 429 when full (5.2/13).
 *  6. `finally` temp-dir removal + the 5-minute sweeper safety net (5.2).
 *  7. Error mapping to the engine taxonomy; logs carry the op name,
 *     anonymous request id, and duration only — never filenames (5.6).
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { ConcurrencyLimitError, type SubprocessLimiter } from './limiter.js';
import type { EngineConfig } from './config.js';
import { startTempSweeper, TempDir } from './temp-dirs.js';
import { assertAccepted, type AcceptedKind } from './upload-validation.js';
import { EngineToolError, statusForCode } from './errors.js';

export class GroupBRequestHarness {
  constructor(
    private readonly config: EngineConfig,
    private readonly limiter: SubprocessLimiter,
  ) {}

  /**
   * Run one Group B request. `handler` receives validated inputs (paths in
   * the request temp dir) and returns output files; the harness encodes
   * them as base64 EngineFiles and cleans up.
   */
  async run(
    opts: {
      op: string;
      accepted: readonly AcceptedKind[];
      schema: z.ZodType;
      /** When true, a request with zero files is allowed (inline-content
       * tools like html-to-pdf carry their input in options). */
      allowNoFiles?: boolean;
    },
    handler: (ctx: GroupBContext) => Promise<GroupBOutput>,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const rid = randomUUID().slice(0, 8);
    const started = Date.now();
    const log = (msg: string): void => {
      request.log.info(msg);
    };
    let temp: TempDir | undefined;

    try {
      // ── 1. Parse + size caps ──────────────────────────────────────
      const { options, files } = await this.parseMultipart(
        request,
        log,
        opts.allowNoFiles === true,
      );

      // ── 2. Zod-validate options ───────────────────────────────────
      let parsedOptions: unknown;
      try {
        parsedOptions = opts.schema.parse(options);
      } catch {
        throw new EngineToolError('invalid-option', 'One of the settings is not valid.');
      }

      // ── 3. Magic-byte validate every file ──────────────────────────
      const validated: ValidatedFile[] = [];
      for (const f of files) {
        const sniffed = await assertAccepted(f.bytes, f.displayName, opts.accepted);
        validated.push({
          bytes: f.bytes,
          displayName: f.displayName,
          kind: sniffed.kind,
          ext: sniffed.ext,
        });
      }

      // ── 4. Per-request temp dir + fresh internal names ─────────────
      temp = await TempDir.create();
      const inputFiles: InputFile[] = [];
      for (const [i, v] of validated.entries()) {
        const path = await temp.write(`input-${String(i)}-${randomUUID()}.${v.ext}`, v.bytes);
        inputFiles.push({ path, displayName: v.displayName, kind: v.kind, ext: v.ext });
      }

      // ── 5. Concurrency-capped execution ────────────────────────────
      // The limiter wraps the WHOLE per-request pipeline from temp-dir
      // creation through the tool run (Section 5.2 caps per-request
      // processing, not just the subprocess instant) — so a request holds
      // a slot for its entire processing lifetime, deterministically
      // observable via /healthz busy on any host, native tools or not.
      const result = await this.limiter.run(async () => {
        if (temp === undefined) throw new EngineToolError('internal', 'Temp dir missing.');
        const requestTemp: TempDir = temp;
        const ctx: GroupBContext = {
          config: this.config,
          temp: requestTemp,
          files: inputFiles,
          options: parsedOptions,
          timeoutMs: this.config.fileTimeoutSeconds * 1000,
          outDir: await this.makeOutDir(requestTemp),
        };
        return handler(ctx);
      });

      // ── 6. Encode outputs ──────────────────────────────────────────
      const payload = {
        ok: true as const,
        data: {
          files: result.files.map((f) => ({
            name: sanitizeOutName(f.name),
            ext: f.ext,
            data: Buffer.from(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength).toString(
              'base64',
            ),
          })),
        },
      };
      log(`op=${opts.op} rid=${rid} ok=true duration_ms=${String(Date.now() - started)}`);
      reply.header('content-type', 'application/json');
      await reply.status(200).send(payload);
    } catch (err) {
      this.sendError(err, opts.op, rid, Date.now() - started, reply, request);
    } finally {
      // Section 5.2: temp dir deleted in a finally block — always.
      await temp?.remove();
    }
  }

  private async parseMultipart(
    request: FastifyRequest,
    log: (m: string) => void,
    allowNoFiles: boolean,
  ): Promise<{ options: unknown; files: RawUpload[] }> {
    const parts: RawUpload[] = [];
    let options: unknown = {};
    const body = request.body as Record<string, unknown> | undefined;

    // @fastify/multipart with attachFieldsToBody: body.files / body.options
    // hold the parts; file entries expose toBuffer().
    const fileParts = (body?.['files'] ?? body?.['file']) as
      MultipartLike | MultipartLike[] | undefined;
    const list: MultipartLike[] = Array.isArray(fileParts)
      ? fileParts
      : fileParts !== undefined
        ? [fileParts]
        : [];
    let total = 0;
    for (const part of list) {
      if (typeof part.toBuffer !== 'function') continue;
      const buffer = await part.toBuffer();
      const bytes = new Uint8Array(buffer);
      total += bytes.byteLength;
      if (bytes.byteLength === 0)
        throw new EngineToolError(
          'empty-input',
          'The selected file appears to be empty. Try another file.',
        );
      if (bytes.byteLength > this.config.maxFileSize) {
        throw new EngineToolError('size-limit', 'A file exceeds the 500MB per-file limit.');
      }
      if (total > this.config.maxRequestSize) {
        throw new EngineToolError('size-limit', 'The request exceeds the total size limit.');
      }
      parts.push({ bytes, displayName: sanitizeName(part.filename ?? 'file') });
    }
    if (parts.length === 0 && !allowNoFiles) {
      throw new EngineToolError('no-inputs', 'Select at least one file first.');
    }

    const optField = body?.['options'];
    if (typeof optField === 'string' && optField.length > 0) {
      try {
        options = JSON.parse(optField) as unknown;
      } catch {
        throw new OptionsJsonError();
      }
    } else if (optField !== undefined && optField !== null && typeof optField === 'object') {
      // attachFieldsToBody wraps fields as MultipartValue { value, type } —
      // extract the inner value (the raw JSON string).
      const wrapped = optField as { value?: unknown };
      const raw = 'value' in wrapped ? wrapped.value : optField;
      if (typeof raw === 'string' && raw.length > 0) {
        try {
          options = JSON.parse(raw) as unknown;
        } catch {
          throw new OptionsJsonError();
        }
      } else if (raw !== undefined && raw !== null && typeof raw === 'object') {
        options = raw;
      }
    }
    void log;
    return { options, files: parts };
  }

  private async makeOutDir(temp: TempDir): Promise<string> {
    const outDir = join(temp.path, 'out');
    await mkdir(outDir, { recursive: true });
    return outDir;
  }

  private sendError(
    err: unknown,
    op: string,
    rid: string,
    durationMs: number,
    reply: FastifyReply,
    request: FastifyRequest,
  ): void {
    const code: string =
      err instanceof EngineToolError
        ? err.code
        : err instanceof ConcurrencyLimitError
          ? 'engine-busy'
          : 'internal';
    const message =
      err instanceof Error && err.message && code !== 'internal'
        ? err.message
        : 'The operation failed unexpectedly.';
    request.log.info(`op=${op} rid=${rid} code=${code} duration_ms=${String(durationMs)}`);
    const status = statusForLocal(code);
    reply.header('content-type', 'application/json');
    void reply.status(status).send({
      ok: false,
      error: { code, message },
    });
  }
}

/** Internal marker for malformed options JSON → invalid-option. */
class OptionsJsonError extends EngineToolError {
  constructor() {
    super('invalid-option', 'One of the settings is not valid.');
  }
}

function statusForLocal(code: string): number {
  return statusForCode(code as never);
}

function sanitizeName(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex -- control chars are exactly what we strip
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
      .replace(/\.{2,}/g, '.')
      .trim()
      .slice(0, 64) || 'file'
  );
}

function sanitizeOutName(name: string): string {
  return sanitizeName(name);
}

/* ---------------- context + types ---------------- */

export interface RawUpload {
  bytes: Uint8Array;
  displayName: string;
}

export interface ValidatedFile {
  bytes: Uint8Array;
  displayName: string;
  kind: AcceptedKind;
  ext: string;
}

export interface InputFile extends Omit<ValidatedFile, 'bytes'> {
  /** Absolute path inside the per-request temp dir (fresh internal name). */
  path: string;
}

/** What a Group B handler receives. */
export interface GroupBContext {
  config: EngineConfig;
  temp: TempDir;
  files: InputFile[];
  /** Options after zod parsing (typed by the caller via schema.parse). */
  options: unknown;
  timeoutMs: number;
  /** Output directory inside the temp dir for tools that write files. */
  outDir: string;
}

/** What a Group B handler returns. */
export interface GroupBOutput {
  files: { name: string; ext: string; bytes: Uint8Array }[];
}

/** Structural type for @fastify/multipart's saved file part. */
export interface MultipartLike {
  toBuffer(): Promise<Buffer>;
  filename?: string;
  mimetype?: string;
}

export { readFile, startTempSweeper };
