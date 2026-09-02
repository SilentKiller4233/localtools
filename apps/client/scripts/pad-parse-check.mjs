// One-off: confirm pdf-lib parses simple-text.pdf padded to ~52MB with a
// giant comment line (the worker-offload fixture strategy). Resolves
// pdf-lib from pdf-core's context regardless of which dir it runs from.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../packages/pdf-core/package.json', import.meta.url));
const { PDFDocument } = require('pdf-lib');

const src = readFileSync(new URL('../../../fixtures/pdf/simple-text.pdf', import.meta.url));
const target = 52 * 1024 * 1024;
const head = Buffer.from('\n%');
const tail = Buffer.from('\n');
const padLen = Math.max(0, target - src.byteLength - head.byteLength - tail.byteLength);
const big = Buffer.concat([src, head, Buffer.alloc(padLen, 0x61), tail]);
console.log(`padded size: ${(big.byteLength / 1024 / 1024).toFixed(1)}MB`);
try {
  const doc = await PDFDocument.load(new Uint8Array(big), {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  console.log('PARSE_OK pages:', doc.getPageCount());
} catch (err) {
  console.log('PARSE_FAIL:', err instanceof Error ? err.message.slice(0, 120) : err);
}
