/**
 * DevText worker (Section 8): every Text & Dev Group A call executes here.
 * Options arrive as plain JSON; text inputs ride in `options.text`, file
 * inputs ride in `files` (zip, file hash, QR scan). Heavy libraries load
 * lazily inside devtext-core's dynamic imports, code-split out of the
 * main bundle.
 */

import type { DevTextToolRequest, DevTextToolResponse } from '../lib/devtext-worker-client';

/**
 * Browser `process` shim (Phase 12, D-042): csso pulls in clean-css, and
 * both clean-css and terser read `process.platform` at MODULE-EVALUATION
 * time. In a windowless Web Worker that ReferenceError took the entire
 * devtext-core chunk down — every Text & Dev tool failed in the browser
 * (Node tests never saw it; `process` exists there). This defines the
 * standard minimal surface bundlers provide: posix paths (never win32),
 * a cwd that is only consulted for URL rebasing we never enable, and
 * microtask-based nextTick. Node contexts keep their real `process`.
 */
{
  const g = globalThis as { process?: unknown };
  if (g.process === undefined) {
    g.process = {
      platform: 'browser',
      browser: true,
      env: {} as Record<string, string>,
      version: '',
      cwd: (): string => '/',
      nextTick: (fn: (...a: unknown[]) => void, ...args: unknown[]): void => {
        void Promise.resolve().then(() => {
          fn(...args);
        });
      },
    };
  }
}

type Algs = ('md5' | 'sha-1' | 'sha-256' | 'sha-512')[];

function fail(id: number, code: string, message: string): DevTextToolResponse {
  return { id, ok: false, code, message };
}

function done(id: number, result: unknown): DevTextToolResponse {
  return { id, ok: true, result };
}

function str(o: Record<string, unknown>, key: string, fallback = ''): string {
  const v = o[key];
  return typeof v === 'string' ? v : fallback;
}

function num(o: Record<string, unknown>, key: string, fallback: number): number {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(o: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = o[key];
  return typeof v === 'boolean' ? v : fallback;
}

import type * as DevTextCore from '@localtools/devtext-core';

type Core = typeof DevTextCore;

async function core(): Promise<Core> {
  return import('@localtools/devtext-core');
}

/** Per-tool dispatch — returns the response object; caller posts it. */
async function dispatch(
  c: Core,
  tool: string,
  options: Record<string, unknown>,
  files: { name: string; bytes: Uint8Array }[],
): Promise<{ ok: true; result: unknown } | { ok: false; code: string; message: string }> {
  const f0 = files[0];
  switch (tool) {
    /* ---------- formatters ---------- */
    case 'json-formatter':
      return done(
        0,
        c.jsonFormat(
          str(options, 'text'),
          str(options, 'mode', 'format') as 'format' | 'minify' | 'validate',
        ),
      );
    case 'yaml-json':
      return done(
        0,
        c.yamlConvert(
          str(options, 'text'),
          str(options, 'direction', 'yaml-to-json') as 'yaml-to-json' | 'json-to-yaml',
        ),
      );
    case 'csv-json':
      return done(
        0,
        c.csvConvert(
          str(options, 'text'),
          str(options, 'direction', 'csv-to-json') as 'csv-to-json' | 'json-to-csv',
        ),
      );
    case 'xml-formatter':
      return done(0, c.xmlFormat(str(options, 'text'), bool(options, 'minify')));
    /* ---------- encoders ---------- */
    case 'base64': {
      const direction = str(options, 'direction', 'encode') as 'encode' | 'decode';
      if (bool(options, 'fileMode') && direction === 'encode' && f0 !== undefined) {
        return done(0, c.base64EncodeFile(f0.bytes));
      }
      if (bool(options, 'fileMode') && direction === 'decode') {
        return done(0, c.base64DecodeFile(str(options, 'text')));
      }
      return done(0, c.base64Text(str(options, 'text'), direction));
    }
    case 'url-encoder':
      return done(
        0,
        c.urlCode(
          str(options, 'text'),
          str(options, 'mode', 'encode') as 'encode' | 'encode-component' | 'decode',
        ),
      );
    case 'jwt-decoder':
      return done(0, c.decodeJwt(str(options, 'text')));
    /* ---------- hashing ---------- */
    case 'hash-generator':
      return done(
        0,
        await c.hashText(
          str(options, 'text'),
          (options.algorithms as Algs | undefined) ?? ['sha-256'],
        ),
      );
    case 'file-hash-checker': {
      if (f0 === undefined) throw new Error('No file supplied.');
      const bytes = f0.bytes;
      return done(
        0,
        await c.hashBytes(bytes, (options.algorithms as Algs | undefined) ?? ['sha-256']),
      );
    }
    /* ---------- generators ---------- */
    case 'uuid-generator':
      return done(
        0,
        c.generateIds(str(options, 'kind', 'uuid') as 'uuid' | 'ulid', num(options, 'count', 1)),
      );
    case 'case-converter':
      return done(0, c.convertCase(str(options, 'text'), str(options, 'kind', 'camel') as never));
    case 'slug-generator':
      return done(0, c.slugify(str(options, 'text'), num(options, 'maxLength', 80)));
    case 'lorem-ipsum':
      return done(
        0,
        c.lorem(
          num(options, 'count', 3),
          str(options, 'unit', 'paragraphs') as 'paragraphs' | 'sentences' | 'words',
        ),
      );
    case 'password-generator':
      return done(
        0,
        c.generatePassword({
          kind: str(options, 'kind', 'password') as 'password' | 'passphrase',
          length: num(options, 'length', 16),
          words: num(options, 'words', 4),
          separator: str(options, 'separator', '-'),
          useLower: bool(options, 'useLower', true),
          useUpper: bool(options, 'useUpper', true),
          useDigits: bool(options, 'useDigits', true),
          useSymbols: bool(options, 'useSymbols', false),
        }),
      );
    case 'fake-data-generator':
      return done(
        0,
        c.generateFakeData(
          str(options, 'category', 'mixed') as never,
          num(options, 'count', 10),
          options.seed === undefined ? undefined : num(options, 'seed', 0),
        ),
      );
    case 'unit-converter':
      return done(
        0,
        c.convertUnit(
          num(options, 'value', 0),
          str(options, 'category', 'length') as never,
          str(options, 'from'),
          str(options, 'to'),
        ),
      );
    /* ---------- dev tools ---------- */
    case 'regex-tester':
      return done(
        0,
        c.testRegex(str(options, 'pattern'), str(options, 'text'), str(options, 'flags', 'g')),
      );
    case 'text-diff':
      return done(0, c.diffTexts(str(options, 'a'), str(options, 'b')));
    case 'minifier-beautifier': {
      const mode = str(options, 'mode', 'minify');
      const fn = mode === 'minify' ? c.minifyCode : c.beautifyCode;
      return done(
        0,
        await fn(str(options, 'text'), str(options, 'language', 'css') as 'css' | 'js' | 'html'),
      );
    }
    case 'markdown-converter': {
      const direction = str(options, 'direction', 'md-to-html');
      if (direction === 'md-to-html') {
        return done(0, c.markdownToHtml(str(options, 'text')));
      }
      return done(0, c.htmlToMarkdown(str(options, 'text')));
    }
    case 'markdown-to-pdf':
      return done(
        0,
        await c.markdownToPdf(str(options, 'text'), {
          pageSize: str(options, 'pageSize', 'a4') as 'a4' | 'letter',
        }),
      );
    /* ---------- colors ---------- */
    case 'color-converter':
      return done(0, {
        converted: c.convertColor(str(options, 'text')),
        palette: c.generatePalette(
          str(options, 'text'),
          str(options, 'harmony', 'analogous') as never,
        ),
      });
    case 'gradient-generator':
      return done(
        0,
        c.generateGradient({
          stops: (options.stops as { color: string; position: number }[] | undefined) ?? [
            { color: '#3366cc', position: 0 },
            { color: '#66ccff', position: 100 },
          ],
          angle: num(options, 'angle', 90),
          type: str(options, 'type', 'linear') as 'linear' | 'radial',
          repeating: bool(options, 'repeating'),
        }),
      );
    /* ---------- time ---------- */
    case 'cron-parser':
      return done(0, c.explainCron(str(options, 'text')));
    case 'timestamp-converter':
      return done(0, c.convertTimestamp(str(options, 'text'), str(options, 'timezone', 'UTC')));
    /* ---------- qr/barcode ---------- */
    case 'qr-code':
      return done(
        0,
        await c.generateQr(str(options, 'text'), {
          size: num(options, 'size', 256),
          margin: num(options, 'margin', 2),
          ecc: str(options, 'ecc', 'M') as 'L' | 'M' | 'Q' | 'H',
        }),
      );
    case 'qr-scan': {
      if (f0 === undefined) throw new Error('No image supplied.');
      const bytes = f0.bytes;
      return done(0, await c.scanQr(bytes));
    }
    case 'barcode-generator':
      return done(
        0,
        await c.generateBarcode(str(options, 'text'), str(options, 'format', 'code128') as never, {
          showText: bool(options, 'showText', true),
        }),
      );
    /* ---------- zip ---------- */
    case 'zip-create':
      return done(0, c.createZip(files.map((f) => ({ name: f.name, bytes: f.bytes }))));
    case 'zip-extract': {
      if (f0 === undefined) throw new Error('No zip supplied.');
      const bytes = f0.bytes;
      return done(0, c.extractZip(bytes));
    }
    /* ---------- webdev ---------- */
    case 'sitemap-generator':
      return done(
        0,
        c.generateSitemap({
          urls: str(options, 'urls'),
          ...(options.changefreq === undefined
            ? {}
            : { changefreq: str(options, 'changefreq') as never }),
        }),
      );
    case 'og-preview': {
      const pasted = str(options, 'pasted');
      if (pasted !== '') {
        const card = c.parseOgTags(pasted);
        return done(0, c.buildOgCard(card));
      }
      return done(
        0,
        c.buildOgCard({
          ogTitle: str(options, 'ogTitle'),
          ogDescription: str(options, 'ogDescription'),
          ogImage: str(options, 'ogImage'),
          ogUrl: str(options, 'ogUrl'),
          ogSiteName: str(options, 'ogSiteName'),
          twitterCard: str(options, 'twitterCard', 'summary_large_image') as
            'summary' | 'summary_large_image',
        }),
      );
    }
    default:
      throw new Error(`Unknown dev-text tool: ${tool}`);
  }
}

self.addEventListener('message', (event: MessageEvent<DevTextToolRequest>) => {
  const req = event.data;
  const { id, tool, options, files } = req;
  void (async () => {
    let response: DevTextToolResponse;
    try {
      const c = await core();
      const partial = await dispatch(c, tool, options, files);
      response = partial.ok
        ? { id, ok: true, result: partial.result }
        : { id, ok: false, code: partial.code, message: partial.message };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      response = fail(id, e.code ?? 'operation-failed', e.message ?? 'The operation failed.');
    }
    self.postMessage(response);
  })();
});

export {};
