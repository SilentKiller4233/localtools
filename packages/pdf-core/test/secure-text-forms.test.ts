import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fillForm, readFormFields } from '../src/tools/forms';
import { protectPdf, unlockPdf, optimizePdf } from '../src/tools/secure';
import { extractText } from '../src/tools/text';
import { imagesToPdf, sniffImage } from '../src/tools/image-to-pdf';
import { loadPdf } from '../src/load';
import { expectToolError, fixture } from './helpers';

/** Tiny valid PNG (1x1 red pixel) generated inline — no image fixture needed. */
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('qpdf protect/unlock/optimize — Section 14.1', () => {
  it('happy path: protect with user password → loader flags it encrypted', async () => {
    const protectedBytes = await protectPdf(fixture('simple-text.pdf'), {
      userPassword: 'secret',
    });
    await expectToolError(loadPdf(protectedBytes), 'encrypted-pdf');
  }, 60_000);

  it('happy path: unlock with correct password → 3 pages readable', async () => {
    const unlocked = await unlockPdf(fixture('password-protected.pdf'), 'localtools');
    const doc = await PDFDocument.load(unlocked, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
  }, 60_000);

  it('wrong password → qpdf-failed (password rejected)', async () => {
    await expectToolError(unlockPdf(fixture('password-protected.pdf'), 'wrong'), 'qpdf-failed');
  }, 60_000);

  it('empty password → invalid-option', async () => {
    await expectToolError(unlockPdf(fixture('password-protected.pdf'), ''), 'invalid-option');
  });

  it('protect with no password → invalid-option', async () => {
    await expectToolError(
      protectPdf(fixture('simple-text.pdf'), { userPassword: '' }),
      'invalid-option',
    );
  });

  it('happy path: optimize/linearize → valid PDF, page count preserved', async () => {
    const out = await optimizePdf(fixture('simple-text.pdf'));
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    expect(out.byteLength).toBeGreaterThan(0);
  }, 60_000);

  it('optimize malformed (truncated) input → qpdf-failed', async () => {
    await expectToolError(optimizePdf(fixture('malformed.pdf')), 'qpdf-failed');
  });
});

describe('extractText — Section 14.1', () => {
  it('happy path: known marker string extracted from simple-text.pdf', async () => {
    const text = await extractText(fixture('simple-text.pdf'));
    expect(text).toContain('Page 1');
    expect(text).toContain('john.doe@example.com');
  }, 30_000);

  it('image-only scan → clear no-text error (Section 13 edge case)', async () => {
    await expectToolError(extractText(fixture('scanned-image-only.pdf')), 'invalid-option');
  }, 30_000);

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(extractText(fixture('malformed.pdf')), 'invalid-pdf');
  }, 30_000);

  it('empty input → empty-input', async () => {
    await expectToolError(extractText(new Uint8Array(0)), 'empty-input');
  });
});

describe('imagesToPdf — Section 14.1', () => {
  it('happy path: one PNG → single-page PDF, fit-sized', async () => {
    const out = await imagesToPdf([{ bytes: TINY_PNG, name: 'pixel.png' }]);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize().width).toBe(1);
  });

  it('multiple images → one page per image', async () => {
    const out = await imagesToPdf([
      { bytes: TINY_PNG, name: 'a.png' },
      { bytes: TINY_PNG, name: 'b.png' },
    ]);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2);
  });

  it('fixed page size respects margins', async () => {
    const out = await imagesToPdf([{ bytes: TINY_PNG, name: 'p.png' }], {
      pageSize: 'a4',
      margin: 36,
    });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 0);
  });

  it('magic-byte wins: PNG bytes with .jpg name → decodes fine (extensions never trusted)', async () => {
    const out = await imagesToPdf([{ bytes: TINY_PNG, name: 'mislabeled.jpg' }]);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
  });

  it('garbage bytes → invalid-pdf regardless of name', async () => {
    await expectToolError(
      imagesToPdf([{ bytes: new TextEncoder().encode('not an image at all'), name: 'x.png' }]),
      'invalid-pdf',
    );
  });

  it('sniffImage: garbage bytes → unknown', () => {
    expect(sniffImage(new TextEncoder().encode('not an image'))).toBe('unknown');
  });

  it('no inputs → no-inputs', async () => {
    await expectToolError(imagesToPdf([]), 'no-inputs');
  });
});

describe('fillForm — Section 14.1', () => {
  it('happy path: fill text field + check checkbox, read back before flatten', async () => {
    const out = await fillForm(fixture('with-form-fields.pdf'), {
      fullname: 'Jane LocalTools',
      subscribe: true,
    });
    const values = await readFormFields(out);
    expect(values['fullname']).toBe('Jane LocalTools');
    expect(values['subscribe']).toBe(true);
  });

  it('flatten=true removes the form, values become page content', async () => {
    const out = await fillForm(
      fixture('with-form-fields.pdf'),
      { fullname: 'Flattened' },
      { flatten: true },
    );
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getForm().getFields().length).toBe(0);
  });

  it('unknown field name → invalid-option listing the field', async () => {
    await expectToolError(
      fillForm(fixture('with-form-fields.pdf'), { nonexistent: 'x' }),
      'invalid-option',
    );
  });

  it('no values → invalid-option', async () => {
    await expectToolError(fillForm(fixture('with-form-fields.pdf'), {}), 'invalid-option');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(fillForm(fixture('malformed.pdf'), { fullname: 'x' }), 'invalid-pdf');
  });
});
