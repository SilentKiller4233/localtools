import { qpdfReadFile, qpdfWriteFile, runQpdf, getQpdf } from '../qpdf';
import { assertSize, hasPdfSignature } from '../load';
import { toolError } from '../errors';

/**
 * In-process best-effort repair (Section 3.1 Group A): qpdf's recovery
 * parsing rebuilds broken xref/object structures where strict loaders
 * refuse. Distinct from Phase 4's Ghostscript deep repair — this handles
 * structural damage only, no rendering-level reconstruction.
 */
export async function repairPdf(bytes: Uint8Array): Promise<Uint8Array> {
  assertSize(bytes);
  if (!hasPdfSignature(bytes)) {
    throw toolError('invalid-pdf');
  }
  const qpdf = await getQpdf();
  qpdfWriteFile(qpdf, 'in.pdf', bytes);
  await runQpdf(['in.pdf', '--', 'out.pdf']);
  const out = qpdfReadFile(qpdf, 'out.pdf');
  // Verify the repair actually produced something loadable.
  const { PDFDocument } = await import('pdf-lib');
  try {
    const doc = await PDFDocument.load(out, {
      ignoreEncryption: false,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
    if (doc.getPageCount() === 0) {
      throw new Error('no pages after repair');
    }
  } catch {
    throw toolError(
      'qpdf-failed',
      'This PDF is too damaged for in-browser repair. The Ghostscript-based deep repair arrives with the desktop build (Phase 4+).',
    );
  }
  return out;
}
