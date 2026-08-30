/**
 * Deterministic Section 14.2 PDF fixture generator (PROJECT_SPEC Phase 3).
 *
 * The vitest global setup (test/global-setup.ts) imports `generateAll()` and
 * writes any MISSING fixture before tests run — a fresh clone with fixtures
 * intact uses the committed bytes; deleted fixtures regenerate on next test
 * run. Run standalone (writes all, overwriting) with:
 *   pnpm --filter @localtools/pdf-core exec tsx scripts/generate-fixtures.ts
 *
 * Fixtures are small, logically deterministic (creation metadata disabled) and
 * COMMITTED so CI never depends on a generation step. One fixture is produced
 * outside this script and documented here for provenance:
 *   - password-protected.pdf — encrypted wrapper around simple-text.pdf,
 *     generated one-time with pypdf (host-side tool, not a project dep);
 *     regenerating requires a manual step (see DECISIONS.md D-013).
 * Deferred until the tools that need them land (tracked in HANDOFF.md):
 *   multi-language-text.pdf, bookmarked-toc.pdf, with-embedded-fonts.pdf.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const OUT_DIR = '../../fixtures/pdf';

function marker(pageNo: number): string {
  return `Page ${String(pageNo)} - LocalTools fixture`;
}

/** N distinct A4 pages, each with visible text; page 1 carries the known
 * strings used later by text/redaction tests (Section 14.3). */
export async function makeMultiPagePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([595.28, 841.89]); // A4
    page.drawText(marker(i), { x: 72, y: 720, size: 18, font, color: rgb(0, 0, 0) });
    if (i === 1) {
      page.drawText('Contact: john.doe@example.com', {
        x: 72,
        y: 680,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }
  return doc.save();
}

async function makeSimpleTextPdf(): Promise<Uint8Array> {
  return makeMultiPagePdf(3);
}

/** Form-field fixture: text field + checkbox (fill/flatten tests, 14.2). */
async function makeWithFormFieldsPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('LocalTools form fixture', {
    x: 72,
    y: 720,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });
  const form = doc.getForm();
  const nameField = form.createTextField('fullname');
  nameField.setText('Jane Doe');
  nameField.addToPage(page, { x: 72, y: 640, width: 300, height: 24 });
  const check = form.createCheckBox('subscribe');
  check.addToPage(page, { x: 72, y: 600, width: 18, height: 18 });
  return doc.save();
}

/** Image-only page (a gray rectangle, zero text) — text-op degrade paths. */
async function makeScannedImageOnlyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({
    x: 100,
    y: 100,
    width: 400,
    height: 500,
    color: rgb(0.75, 0.75, 0.75),
  });
  return doc.save();
}

/**
 * Truncated real PDF — a generated simple-text.pdf cut at 40% of its bytes,
 * mid-way through the object/xref region. pdf-lib's parser throws on this,
 * which is the malformed-input path Section 14.1 requires (a fake text body
 * alone is too lenient for pdf-lib — verified: it parses successfully).
 */
async function makeMalformedPdf(): Promise<Uint8Array> {
  const full = await makeSimpleTextPdf();
  const cut = Math.floor(full.byteLength * 0.4);
  return full.slice(0, cut);
}

/** Minimal hand-written PDF whose page tree has zero kids — zero-page path. */
function makeZeroPagePdf(): Uint8Array {
  const text = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [] /Count 0 >>',
    'endobj',
    'xref',
    '0 3',
    '0000000000 65535 f ',
    '0000000015 00000 n ',
    '0000000066 00000 n ',
    'trailer',
    '<< /Size 3 /Root 1 0 R >>',
    'startxref',
    '139',
    '%%EOF',
    '',
  ].join('\n');
  return new TextEncoder().encode(text);
}

/** Every pdf-lib-producible fixture, in a stable order. */
export function fixtureEntries(): readonly [
  name: string,
  make: () => Promise<Uint8Array> | Uint8Array,
][] {
  return [
    ['simple-text.pdf', () => makeSimpleTextPdf()],
    ['with-form-fields.pdf', () => makeWithFormFieldsPdf()],
    ['scanned-image-only.pdf', () => makeScannedImageOnlyPdf()],
    ['malformed.pdf', () => makeMalformedPdf()],
    ['zero-page.pdf', () => makeZeroPagePdf()],
  ];
}

/** Write all fixtures (overwrites). */
export async function generateAll(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, make] of fixtureEntries()) {
    const bytes = await make();
    writeFileSync(`${OUT_DIR}/${name}`, bytes);
    console.log(`wrote fixtures/pdf/${name} (${String(bytes.byteLength)} bytes)`);
  }
}

/** Standalone execution guard: only regenerate when invoked as a script. */
const invokedDirectly = process.argv[1]?.includes('generate-fixtures') ?? false;
if (invokedDirectly) {
  await generateAll();
}
