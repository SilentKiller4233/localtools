import { describe, expect, it } from 'vitest';
import { generateQr, scanQr, generateBarcode } from '../src/tools/qrbarcode';
import { generateFakeData, rowsToCsv } from '../src/tools/fake';
import { createZip, extractZip, previewTextFile } from '../src/tools/zip';
import { decodeAuto } from '@localtools/image-core';
import { expectDevError, fixtureBytes } from './helpers';

describe('qr-code (generate + scan) — Section 14.1', () => {
  it('happy: SVG + PNG generated; PNG is a real image', async () => {
    const r = await generateQr('https://example.localtools.dev/qr-roundtrip', {
      size: 256,
      margin: 4,
    });
    expect(r.svg).toContain('<svg');
    expect(r.png[0]).toBe(0x89); // PNG magic
    expect(r.png[1]).toBe(0x50);
    const dim = await decodeAuto(r.png); // PNG decodes through image-core
    expect(dim.width).toBeGreaterThan(20);
  });

  it('happy: full round-trip — generate PNG then scan it back', async () => {
    const target =
      'https://example.localtools.dev/roundtrip-' + String(Math.floor(Math.random() * 1e6));
    const r = await generateQr(target, { size: 384, margin: 4, ecc: 'H' });
    const scanned = await scanQr(r.png);
    expect(scanned.text).toBe(target);
  });

  it('happy: committed fixture qr.png scans to the known URL', async () => {
    const r = await scanQr(fixtureBytes('qr.png'));
    expect(r.text).toBe('https://example.localtools.dev/qr-roundtrip');
  });

  it('invalid size option → invalid-option', async () => {
    await expectDevError(generateQr('x', { size: 10 }), 'invalid-option');
  });

  it('empty content → empty-input', async () => {
    await expectDevError(generateQr(''), 'empty-input');
  });

  it('malformed: non-image bytes → invalid-input', async () => {
    await expectDevError(scanQr(new TextEncoder().encode('not an image')), 'invalid-input');
  });

  it('empty bytes → empty-input', async () => {
    await expectDevError(scanQr(new Uint8Array(0)), 'empty-input');
  });

  it('malformed: image WITHOUT a QR → invalid-input (no code found)', async () => {
    const { convertImage } = await import('@localtools/image-core');
    // 64x64 all-white BMP → real PNG, decodes fine, contains no QR.
    const w = 64,
      h = 64,
      rowSize = Math.ceil((w * 3) / 4) * 4;
    const buf = new Uint8Array(54 + rowSize * h);
    const dv = new DataView(buf.buffer);
    buf[0] = 0x42;
    buf[1] = 0x4d;
    dv.setUint32(2, buf.length, true);
    dv.setUint32(10, 54, true);
    dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(34, rowSize * h, true);
    const blankPng = await convertImage(buf, { target: 'png' });
    await expectDevError(scanQr(blankPng), 'invalid-input');
  });
});

describe('barcode-generator — Section 14.1', () => {
  it('happy: code128 SVG with text', async () => {
    const r = await generateBarcode('LOCALTOOLS-42', 'code128', { showText: true });
    expect(r.svg).toContain('<svg');
    expect(r.format).toBe('code128');
    expect(r.svg.length).toBeGreaterThan(500);
  });

  it('happy: ean13 from valid digits', async () => {
    const r = await generateBarcode('590123412345', 'ean13');
    expect(r.svg).toContain('<svg');
  });

  it('happy: several formats render distinct SVGs', async () => {
    const svgs = await Promise.all([
      generateBarcode('ABC-123', 'code39'),
      generateBarcode('12345670', 'ean8'),
      generateBarcode('12345678', 'msi'),
    ]);
    expect(new Set(svgs.map((s) => s.svg.length)).size).toBe(3);
  });

  it('malformed: wrong content for format (ean13 letters) → invalid-input', async () => {
    await expectDevError(generateBarcode('NOT-DIGITS', 'ean13'), 'invalid-input');
  });

  it('empty content → empty-input', async () => {
    await expectDevError(generateBarcode('', 'code128'), 'empty-input');
  });
});

describe('fake-data-generator — Section 14.1', () => {
  it('happy: person rows with all columns filled', () => {
    const r = generateFakeData('person', 5);
    expect(r.rows.length).toBe(5);
    for (const row of r.rows) {
      expect(row.fullName?.length).toBeGreaterThan(2);
      expect(row.jobTitle?.length).toBeGreaterThan(2);
    }
    expect(r.note).toContain('synthetic');
  });

  it('happy: seeded generation is reproducible', () => {
    const a = generateFakeData('person', 3, 42);
    const b = generateFakeData('person', 3, 42);
    expect(a.rows).toEqual(b.rows);
  });

  it('happy: CSV export renders headers + rows', () => {
    const r = generateFakeData('mixed', 3);
    const csv = rowsToCsv(r.rows);
    expect(csv.split('\n')[0]).toContain('fullName');
    expect(csv.split('\n').length).toBe(5); // header + 3 rows + trailing newline
  });

  it('invalid count → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() => generateFakeData('person', 0)),
      'invalid-option',
    );
  });
});

describe('zip-unzip — Section 14.1', () => {
  it('happy: create + extract round-trips byte-identical', () => {
    const files = [
      { name: 'hello.txt', bytes: new TextEncoder().encode('hello from localtools') },
      { name: 'nested/bye.txt', bytes: new TextEncoder().encode('bye') },
    ];
    const created = createZip(files);
    expect(created.zip?.[0]).toBe(0x50); // 'P'
    expect(created.zip?.[1]).toBe(0x4b); // 'K'
    const extracted = extractZip(created.zip ?? new Uint8Array(0));
    const byName = new Map((extracted.files ?? []).map((f) => [f.name, f.bytes]));
    expect(byName.get('hello.txt')).toEqual(files[0]?.bytes);
    expect(byName.get('nested/bye.txt')).toEqual(files[1]?.bytes);
  });

  it('happy: committed sample.zip extracts with entry listing', () => {
    const r = extractZip(fixtureBytes('sample.zip'));
    expect(r.entries.length).toBe(2);
    expect(r.entries.map((e) => e.name)).toContain('hello.txt');
    expect(previewTextFile(r.files?.[0]?.bytes ?? new Uint8Array(0))).toContain('hello');
  });

  it('malformed: not a zip → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => extractZip(new TextEncoder().encode('plain text, not a zip'))),
      'invalid-input',
    );
  });

  it('empty bytes → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => extractZip(new Uint8Array(0))),
      'empty-input',
    );
    await expectDevError(
      Promise.resolve().then(() => createZip([])),
      'no-inputs',
    );
  });

  it('oversized: entries over total cap (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() =>
        createZip([{ name: 'big.bin', bytes: new Uint8Array(64).fill(1) }], 32),
      ),
      'size-limit',
    );
  });

  it('security: traversal entry name rejected', async () => {
    // Build a zip whose entry name escapes: fflate allows arbitrary keys.
    const { zipSync } = await import('fflate');
    const z = zipSync({ '../evil.txt': new Uint8Array([1, 2, 3]) });
    await expectDevError(
      Promise.resolve().then(() => extractZip(z)),
      'invalid-input',
    );
  });
});
