import { PDFName, PDFRawStream } from 'pdf-lib';
import type { PDFDocument, PDFRef } from 'pdf-lib';

/**
 * Content-stream codec for tools that rewrite streams (redact). pdf-lib
 * Flate-decodes via Node zlib in the engine/tests; in the browser it has no
 * inflate fallback (pako is pdf-lib's optional dep and NOT installed), so
 * browser redaction is v1-limited to streams whose filter we can handle and
 * errors clearly otherwise. Re-encoding always Flate-compresses in Node and
 * stores raw elsewhere.
 */
export function decodeStream(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.lookup(PDFName.of('Filter'));
  const isFlate =
    (filter !== undefined && filter.toString().includes('FlateDecode')) ||
    // No filter at all → raw contents.
    filter === undefined;
  const data = stream.getContents();
  if (!isFlate) {
    throw new Error(
      `Unsupported content stream filter: ${String(filter)} (v1 supports FlateDecode/raw; arrives with the canvas batch)`,
    );
  }
  if (filter === undefined) return data;
  return inflate(data);
}

/** Inflate via Node zlib (engine/tests). Browser path arrives with D-014. */
function inflate(data: Uint8Array): Uint8Array {
  const zlib = nodeZlib();
  if (zlib === null) {
    throw new Error('FlateDecode requires the engine/Node runtime (v1)');
  }
  return zlib.inflateSync(data);
}

interface ZlibLike {
  inflateSync: (d: Uint8Array) => Uint8Array;
  deflateSync: (d: Uint8Array) => Uint8Array;
}

// Runtime environment detection: runs in BOTH browser (Vite bundle, where
// `process`/`require` do not exist) and Node. Cross-environment, so the
// eslint rule cannot see it — targeted disable.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== undefined;

function nodeZlib(): ZlibLike | null {
  if (!IS_NODE || typeof require !== 'function') {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: unknown = require('node:zlib');
  return mod as ZlibLike;
}

/**
 * Create a NEW Flate-compressed content stream in the doc (raw when zlib is
 * unavailable) and return its assigned reference.
 */
export function encodeStream(doc: PDFDocument, bytes: Uint8Array): PDFRef {
  const zlib = nodeZlib();
  if (zlib !== null) {
    const compressed = zlib.deflateSync(bytes);
    const stream = PDFRawStream.of(
      doc.context.obj({
        Length: compressed.byteLength,
        Filter: 'FlateDecode',
      }),
      compressed,
    );
    return doc.context.register(stream);
  }
  const stream = PDFRawStream.of(doc.context.obj({ Length: bytes.byteLength }), bytes);
  return doc.context.register(stream);
}
