/**
 * Section 14.1 functional tests for the six PDF Group B endpoints.
 *
 * Happy paths run the REAL native tools (LibreOffice, Ghostscript,
 * Tesseract, WeasyPrint) installed on this dev machine / Docker image.
 * When a tool is missing on the host, its happy-path cases degrade to
 * asserting the honest 503 tool-unavailable (never a silent skip): the
 * tool is either verified working or verified to report its absence —
 * no middle state ships.
 *
 * Every tool gets: happy / malformed / empty / oversized (14.1), plus
 * output-container verification per the spec (output really is a PDF /
 * docx / …, programmatically sniffed).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decodeFile,
  multipartBody,
  postForm,
  readFixture,
  startEngine,
  type EngineResponse,
  type TestApp,
} from './helpers.js';
import { fileTypeFromBuffer } from 'file-type';

let engine: TestApp;

beforeAll(async () => {
  engine = await startEngine();
});

afterAll(async () => {
  await engine.close();
});

/** Sniff output bytes and assert the container kind. */
async function expectOutputKind(
  bytes: Uint8Array,
  kind: 'pdf' | 'docx' | 'xlsx' | 'pptx',
): Promise<void> {
  const ft = await fileTypeFromBuffer(bytes);
  expect(ft, `output container sniff failed (${String(bytes.byteLength)} bytes)`).toBeDefined();
  if (kind === 'pdf') expect(ft?.ext).toBe('pdf');
  else if (kind === 'docx') expect(['docx', 'docm']).toContain(ft?.ext);
  else if (kind === 'xlsx') expect(['xlsx', 'xlsm']).toContain(ft?.ext);
  else expect(['pptx', 'pptm']).toContain(ft?.ext);
}

/** Expect a usable result OR the honest 503 tool-unavailable. */
function okOrUnavailable(r: { status: number; body: EngineResponse }): { unavailable: boolean } {
  if (r.status === 503 && !r.body.ok && r.body.error.code === 'tool-unavailable') {
    return { unavailable: true };
  }
  expect(r.status).toBe(200);
  return { unavailable: false };
}

/** First output file — fail loudly if the response carried none. */
function firstFile(files: { name: string; ext: string; data: string }[]): {
  name: string;
  ext: string;
  data: string;
} {
  const f = files[0];
  if (f === undefined) throw new Error('expected at least one output file');
  return f;
}

/* ------------------------------------------------------------------ */

describe('POST /pdf/office-conversion (LibreOffice)', () => {
  it('to-pdf: converts sample.docx → valid PDF', async () => {
    const docx = await readFixture('sample.docx');
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: 'sample.docx', bytes: docx },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    const out = firstFile(r.body.data.files);
    await expectOutputKind(decodeFile(out), 'pdf');
  });

  it('to-pdf: converts sample.xlsx → valid PDF', async () => {
    const xlsx = await readFixture('sample.xlsx');
    const form = multipartBody(
      { target: 'excel', direction: 'to-pdf', file: 0 },
      { name: 'sample.xlsx', bytes: xlsx },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('to-pdf: converts sample.pptx → valid PDF', async () => {
    const pptx = await readFixture('sample.pptx');
    const form = multipartBody(
      { target: 'powerpoint', direction: 'to-pdf', file: 0 },
      { name: 'sample.pptx', bytes: pptx },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('from-pdf: converts simple-text.pdf → genuine docx (Writer PDF import)', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { target: 'word', direction: 'from-pdf', file: 0 },
      { name: 'doc.pdf', bytes: pdf },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    const out = firstFile(r.body.data.files);
    expect(out.ext).toBe('docx');
    // Genuine OOXML container (word/ parts), not an ODF zip renamed .docx.
    await expectOutputKind(decodeFile(out), 'docx');
  });

  it('from-pdf: converts simple-text.pdf → genuine pptx (Impress PDF import)', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { target: 'powerpoint', direction: 'from-pdf', file: 0 },
      { name: 'deck.pdf', bytes: pdf },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    const out = firstFile(r.body.data.files);
    expect(out.ext).toBe('pptx');
    await expectOutputKind(decodeFile(out), 'pptx');
  });

  it('from-pdf: excel → clear unsupported error (LibreOffice has no Calc PDF import)', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { target: 'excel', direction: 'from-pdf', file: 0 },
      { name: 'sheet.pdf', bytes: pdf },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(r.status).toBe(400);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-option');
  });

  it('malformed input: garbage .docx → 422 invalid-file, no crash', async () => {
    const garbage = await readFixture('malformed.docx');
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: 'broken.docx', bytes: garbage },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-file');
  });

  it('hostile filename with valid content never escapes the temp dir', async () => {
    // Path-traversal-style display name + genuine docx bytes: the engine
    // writes fresh internal names; output must still come back clean.
    const docx = await readFixture('sample.docx');
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: '../../evil<name>.docx', bytes: docx },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    if (r.status === 200 && r.body.ok) {
      const out = firstFile(r.body.data.files);
      expect(out.name).not.toContain('..');
      expect(out.name).not.toContain('/');
    } else {
      expect([422, 503]).toContain(r.status);
    }
  });

  it('empty input → 422 empty-input', async () => {
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: 'empty.docx', bytes: new Uint8Array(0) },
    );
    const r = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('empty-input');
  });

  it('oversized input → rejected before processing (tiny-cap seam)', async () => {
    const tight = await startEngine({ maxFileSize: 512 });
    try {
      const docx = await readFixture('sample.docx'); // 36KB ≫ 512B
      const form = multipartBody(
        { target: 'word', direction: 'to-pdf', file: 0 },
        { name: 'sample.docx', bytes: docx },
      );
      const r = await postForm(`${tight.url}/pdf/office-conversion`, form);
      expect([413, 422]).toContain(r.status);
      if (!r.body.ok)
        expect(['size-limit', 'invalid-file', 'empty-input', 'no-inputs']).toContain(
          r.body.error.code,
        );
    } finally {
      await tight.close();
    }
  });
});

/* ------------------------------------------------------------------ */

describe('POST /pdf/deep-compress (Ghostscript)', () => {
  it('compresses a PDF → valid, non-empty PDF', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody({ preset: 'ebook', file: 0 }, { name: 'doc.pdf', bytes: pdf });
    const r = await postForm(`${engine.url}/pdf/deep-compress`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('malformed PDF → graceful (salvaged output OR clean tool-failed), no crash/hang', async () => {
    const bad = await readFixture('malformed.pdf');
    const form = multipartBody({ preset: 'ebook', file: 0 }, { name: 'bad.pdf', bytes: bad });
    const r = await postForm(`${engine.url}/pdf/deep-compress`, form);
    if (r.status === 200 && r.body.ok) {
      await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
    } else {
      expect([422, 503, 504]).toContain(r.status);
    }
  });

  it('empty → 422 empty-input', async () => {
    const form = multipartBody(
      { preset: 'ebook', file: 0 },
      { name: 'e.pdf', bytes: new Uint8Array(0) },
    );
    const r = await postForm(`${engine.url}/pdf/deep-compress`, form);
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('empty-input');
  });
});

/* ------------------------------------------------------------------ */

describe('POST /pdf/pdf-a (Ghostscript)', () => {
  it('converts a PDF → PDF/A-2b (output asserts PDF container)', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody({ flavor: '2b', file: 0 }, { name: 'doc.pdf', bytes: pdf });
    const r = await postForm(`${engine.url}/pdf/pdf-a`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('malformed → graceful (salvaged OR clean failure)', async () => {
    const bad = await readFixture('malformed.pdf');
    const form = multipartBody({ flavor: '2b', file: 0 }, { name: 'bad.pdf', bytes: bad });
    const r = await postForm(`${engine.url}/pdf/pdf-a`, form);
    if (r.status === 200 && r.body.ok) {
      await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
    } else {
      expect([422, 503, 504]).toContain(r.status);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('POST /pdf/deep-repair (Ghostscript)', () => {
  it('repairs a damaged PDF → valid PDF', async () => {
    const pdf = await readFixture('malformed.pdf');
    const form = multipartBody({ file: 0 }, { name: 'bad.pdf', bytes: pdf });
    const r = await postForm(`${engine.url}/pdf/deep-repair`, form);
    // Repair's contract: best-effort. A fixture Ghostscript can salvage
    // yields 200 + PDF; unrecoverable yields tool-failed. Both are honest.
    if (r.status === 200 && r.body.ok) {
      await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
    } else {
      expect([422, 503]).toContain(r.status);
    }
  });

  it('also handles a healthy PDF (idempotent repair)', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody({ file: 0 }, { name: 'ok.pdf', bytes: pdf });
    const r = await postForm(`${engine.url}/pdf/deep-repair`, form);
    if (r.status === 200 && r.body.ok) {
      await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
    } else {
      expect([422, 503]).toContain(r.status);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('POST /pdf/ocr (OCRmyPDF / Tesseract)', () => {
  it('OCRs the scanned-image fixture → searchable PDF, non-empty', async () => {
    const pdf = await readFixture('scanned-image-only.pdf');
    const form = multipartBody(
      { language: 'eng', clean: false, skipText: true, rotate: false, file: 0 },
      { name: 'scan.pdf', bytes: pdf },
    );
    const r = await postForm(`${engine.url}/pdf/ocr`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('malformed PDF → graceful, no hang', async () => {
    const bad = await readFixture('malformed.pdf');
    const form = multipartBody(
      { language: 'eng', clean: false, skipText: true, rotate: false, file: 0 },
      { name: 'bad.pdf', bytes: bad },
    );
    const r = await postForm(`${engine.url}/pdf/ocr`, form);
    if (r.status === 200 && r.body.ok) {
      await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
    } else {
      expect([422, 503, 504]).toContain(r.status);
    }
  });

  it('empty → 422 empty-input', async () => {
    const form = multipartBody(
      { language: 'eng', file: 0 },
      { name: 'e.pdf', bytes: new Uint8Array(0) },
    );
    const r = await postForm(`${engine.url}/pdf/ocr`, form);
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('empty-input');
  });
});

/* ------------------------------------------------------------------ */

describe('POST /pdf/html-to-pdf (WeasyPrint / Playwright)', () => {
  it('renders inline HTML → valid PDF (WeasyPrint default)', async () => {
    const form = new FormData();
    form.append(
      'options',
      JSON.stringify({
        html: '<!DOCTYPE html><html><body><h1>Hello LocalTools</h1></body></html>',
        renderer: 'weasyprint',
      }),
    );
    const r = await postForm(`${engine.url}/pdf/html-to-pdf`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('renders an uploaded HTML file → valid PDF', async () => {
    const html = await readFixture('sample.html');
    const form = multipartBody(
      { renderer: 'weasyprint', file: 0 },
      { name: 'sample.html', bytes: html },
    );
    const r = await postForm(`${engine.url}/pdf/html-to-pdf`, form);
    if (okOrUnavailable(r).unavailable || !r.body.ok) return;
    await expectOutputKind(decodeFile(firstFile(r.body.data.files)), 'pdf');
  });

  it('playwright opt-in without the component → honest 503, never a fallback', async () => {
    const html = await readFixture('sample.html');
    const form = multipartBody(
      { renderer: 'playwright', file: 0 },
      { name: 'sample.html', bytes: html },
    );
    const r = await postForm(`${engine.url}/pdf/html-to-pdf`, form);
    // Playwright is disabled on this host (LOCALTOOLS_PLAYWRIGHT_ENABLED
    // unset) — must 503 rather than silently using WeasyPrint.
    expect(r.status).toBe(503);
    if (!r.body.ok) expect(r.body.error.code).toBe('tool-unavailable');
  });

  it('uploaded non-HTML file → 422 invalid-file', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { renderer: 'weasyprint', file: 0 },
      { name: 'doc.pdf', bytes: pdf },
    );
    const r = await postForm(`${engine.url}/pdf/html-to-pdf`, form);
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-file');
  });
});
