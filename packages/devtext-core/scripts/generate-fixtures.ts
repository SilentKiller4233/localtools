/**
 * Generates the devtext fixtures under <repo>/fixtures/devtext — committed
 * so CI stays deterministic (pdf-core's approach, D-013).
 *   npx tsx scripts/generate-fixtures.ts   (or via vitest global-setup gap-fill)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { generateQr, createZip } from '../src/index';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = resolve(HERE, '..', '..', '..', 'fixtures', 'devtext');

mkdirSync(OUT, { recursive: true });

writeFileSync(
  resolve(OUT, 'sample.json'),
  JSON.stringify(
    { name: 'localtools', suite: 4, tools: ['json', 'yaml'], nested: { ok: true } },
    null,
    2,
  ),
);
writeFileSync(resolve(OUT, 'malformed.json'), '{"name": "localtools", oops}');
writeFileSync(
  resolve(OUT, 'sample.yaml'),
  'name: localtools\nsuite: 4\ntools:\n  - json\n  - yaml\nnested:\n  ok: true\n',
);
writeFileSync(resolve(OUT, 'malformed.yaml'), 'name: [unbalanced\nsuite: 4\n');
writeFileSync(
  resolve(OUT, 'sample.csv'),
  'name,suite,tool\nlocaltools,4,json\nlocaltools,4,yaml\n',
);
writeFileSync(resolve(OUT, 'malformed.csv'), 'name,suite\n"unclosed quote,4\n');
writeFileSync(
  resolve(OUT, 'sample.xml'),
  '<?xml version="1.0"?>\n<root>\n  <item id="1">hello</item>\n</root>\n',
);
writeFileSync(resolve(OUT, 'malformed.xml'), '<root><item>hello</root>');
writeFileSync(
  resolve(OUT, 'sample.md'),
  '# LocalTools\n\nText & Dev suite **works**.\n\n- one\n- two\n\n```ts\nconst ok = true;\n```\n',
);
writeFileSync(resolve(OUT, 'empty.json'), '');

const qr = await generateQr('https://example.localtools.dev/qr-roundtrip', {
  size: 256,
  margin: 4,
});
writeFileSync(resolve(OUT, 'qr.png'), qr.png);
writeFileSync(resolve(OUT, 'qr.svg'), qr.svg);

const zip = createZip([
  { name: 'hello.txt', bytes: new TextEncoder().encode('hello from localtools') },
  { name: 'nested/bye.txt', bytes: new TextEncoder().encode('bye') },
]);
if (zip.zip === undefined) throw new Error('zip fixture failed');
writeFileSync(resolve(OUT, 'sample.zip'), zip.zip);

console.log('devtext fixtures written to', OUT);
