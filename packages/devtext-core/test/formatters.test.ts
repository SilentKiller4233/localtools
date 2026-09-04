import { describe, expect, it } from 'vitest';
import { jsonFormat, yamlConvert, csvConvert, xmlFormat } from '../src/tools/formatters';
import { expectDevError, fixtureText, OVERSIZED_TEXT } from './helpers';

describe('json-formatter — Section 14.1', () => {
  it('happy: formats ugly JSON to 2-space pretty', () => {
    const r = jsonFormat('{"a":1,"b":[1,2]}');
    expect(r.valid).toBe(true);
    expect(r.output).toContain('\n  "a": 1');
    expect(JSON.parse(r.output ?? '')).toEqual({ a: 1, b: [1, 2] });
  });

  it('happy: minify mode collapses whitespace', () => {
    const r = jsonFormat('{\n  "a": 1,\n  "b": 2\n}', 'minify');
    expect(r.output).toBe('{"a":1,"b":2}');
  });

  it('happy: validate mode reports valid without output', () => {
    const r = jsonFormat('{"ok":true}', 'validate');
    expect(r.valid).toBe(true);
    expect(r.output).toBeUndefined();
  });

  it('happy: validate mode reports invalid with position', () => {
    const r = jsonFormat('{"a":}', 'validate');
    expect(r.valid).toBe(false);
    expect(r.error?.line).toBeGreaterThan(0);
  });

  it('malformed: fixture → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => jsonFormat(fixtureText('malformed.json'))),
      'invalid-input',
    );
  });

  it('malformed: truncated array → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => jsonFormat('[1,2,')),
      'invalid-input',
    );
  });

  it('empty: no text → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => jsonFormat('')),
      'empty-input',
    );
  });

  it('oversized: over cap (tiny seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => jsonFormat('{"a":1}', 'format', 4)),
      'size-limit',
    );
  });

  it('oversized: default 5M cap → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => jsonFormat(OVERSIZED_TEXT)),
      'size-limit',
    );
  });
});

describe('yaml-json — Section 14.1', () => {
  it('happy: YAML → JSON', () => {
    const r = yamlConvert(fixtureText('sample.yaml'), 'yaml-to-json');
    const parsed = JSON.parse(r.output) as { name: string; tools: string[] };
    expect(parsed.name).toBe('localtools');
    expect(parsed.tools).toEqual(['json', 'yaml']);
  });

  it('happy: JSON → YAML and back round-trips', () => {
    const json = JSON.stringify({ name: 'localtools', suite: 4, tools: ['json'] });
    const y = yamlConvert(json, 'json-to-yaml');
    const back = yamlConvert(y.output, 'yaml-to-json');
    expect(JSON.parse(back.output)).toEqual({ name: 'localtools', suite: 4, tools: ['json'] });
  });

  it('malformed YAML → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => yamlConvert(fixtureText('malformed.yaml'), 'yaml-to-json')),
      'invalid-input',
    );
  });

  it('malformed JSON → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => yamlConvert('{"a":', 'json-to-yaml')),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => yamlConvert('', 'yaml-to-json')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => yamlConvert('a: 1', 'yaml-to-json', 2)),
      'size-limit',
    );
  });
});

describe('csv-json — Section 14.1', () => {
  it('happy: CSV → JSON with header rows as keys', () => {
    const r = csvConvert(fixtureText('sample.csv'), 'csv-to-json');
    const rows = JSON.parse(r.output) as { name: string; suite: string }[];
    expect(rows.length).toBe(2);
    expect(rows[0]?.name).toBe('localtools');
    expect(r.rows).toBe(2);
  });

  it('happy: JSON → CSV and back round-trips', () => {
    const csv = csvConvert('[{"a":"1","b":"2"},{"a":"3","b":"4"}]', 'json-to-csv');
    expect(csv.output).toContain('a,b');
    const back = csvConvert(csv.output, 'csv-to-json');
    expect(JSON.parse(back.output)).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('malformed CSV (unclosed quote) → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => csvConvert(fixtureText('malformed.csv'), 'csv-to-json')),
      'invalid-input',
    );
  });

  it('malformed: JSON scalar array → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => csvConvert('[1,2,3]', 'json-to-csv')),
      'invalid-input',
    );
  });

  it('malformed: JSON object (not array) → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => csvConvert('{"a":1}', 'json-to-csv')),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => csvConvert('', 'csv-to-json')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => csvConvert('a,b\n1,2', 'csv-to-json', 4)),
      'size-limit',
    );
  });
});

describe('xml-formatter — Section 14.1', () => {
  it('happy: pretty-prints compact XML with declaration', () => {
    const r = xmlFormat('<root><item id="1">hello</item></root>');
    expect(r.output).toContain('<?xml version="1.0"');
    expect(r.output).toContain('\n  <item');
  });

  it('happy: minify mode outputs single line', () => {
    const r = xmlFormat(fixtureText('sample.xml'), true);
    expect(r.output.includes('\n  ')).toBe(false);
    expect(r.output).toContain('<item id="1">hello</item>');
  });

  it('happy: round-trips structure (output minus declaration is stable)', () => {
    const pretty = xmlFormat(fixtureText('sample.xml'));
    const stripped = pretty.output.replace(/^<\?xml[^>]*\?>\n/, '');
    const again = xmlFormat(stripped);
    expect(again.output).toBe(pretty.output);
  });

  it('malformed: mismatched tags (async shape) → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => xmlFormat(fixtureText('malformed.xml'))),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => xmlFormat('')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => xmlFormat('<a/>', false, 3)),
      'size-limit',
    );
  });
});
