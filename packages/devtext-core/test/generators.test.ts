import { describe, expect, it } from 'vitest';
import {
  generateIds,
  convertCase,
  slugify,
  lorem,
  generatePassword,
  convertUnit,
  UNIT_CATEGORIES,
} from '../src/tools/generators';
import { expectDevError, OVERSIZED_TEXT } from './helpers';

describe('uuid-generator — Section 14.1', () => {
  it('happy: 5 UUIDs, v4 shape, unique', () => {
    const r = generateIds('uuid', 5);
    expect(r.values.length).toBe(5);
    expect(new Set(r.values).size).toBe(5);
    for (const v of r.values)
      expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('happy: ULIDs are 26 chars, sortable, decode to now', async () => {
    const r = generateIds('ulid', 3);
    for (const v of r.values) expect(v).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const { decodeTime } = await import('ulid');
    const first = r.values[0];
    if (first === undefined) throw new Error('no ulid');
    expect(Math.abs(decodeTime(first) - Date.now())).toBeLessThan(5000);
  });

  it('count=0 clamps to 1 (never zero outputs)', () => {
    expect(generateIds('uuid', 0).values.length).toBe(1);
  });
});

describe('case-converter — Section 14.1', () => {
  const SRC = 'hello world test case';
  it('happy: every supported kind', () => {
    expect(convertCase(SRC, 'camel').output).toBe('helloWorldTestCase');
    expect(convertCase(SRC, 'pascal').output).toBe('HelloWorldTestCase');
    expect(convertCase(SRC, 'snake').output).toBe('hello_world_test_case');
    expect(convertCase(SRC, 'kebab').output).toBe('hello-world-test-case');
    expect(convertCase(SRC, 'constant').output).toBe('HELLO_WORLD_TEST_CASE');
    expect(convertCase(SRC, 'title').output).toBe('Hello World Test Case');
  });

  it('happy: splits camelCase humps', () => {
    expect(convertCase('helloWorldTestCase', 'snake').output).toBe('hello_world_test_case');
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertCase('', 'camel')),
      'empty-input',
    );
  });

  it('malformed: no alphanumeric content → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertCase('!!!', 'camel')),
      'invalid-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertCase('hello', 'camel', 2)),
      'size-limit',
    );
  });
});

describe('slug-generator — Section 14.1', () => {
  it('happy: slugs a noisy title', () => {
    expect(slugify('Héllo Wörld! — 10 Tips & Tricks').output).toBe(
      'hello-welt-10-tips-tricks'.replace('welt', 'world'),
    );
  });

  it('happy: strips diacritics', () => {
    expect(slugify('café rău').output).toBe('cafe-rau');
  });

  it('happy: respects max length without trailing dash', () => {
    const r = slugify('a very long title that goes on and on and on', 10);
    expect(r.output.length).toBeLessThanOrEqual(10);
    expect(r.output.endsWith('-')).toBe(false);
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => slugify('')),
      'empty-input',
    );
  });

  it('malformed: only punctuation → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => slugify('?!')),
      'invalid-input',
    );
  });
});

describe('lorem-ipsum — Section 14.1', () => {
  it('happy: words count honored', () => {
    expect(lorem(7, 'words').output.split(' ').length).toBe(7);
  });

  it('happy: sentences end with periods', () => {
    const r = lorem(3, 'sentences').output;
    expect((r.match(/\./g) ?? []).length).toBe(3);
  });

  it('happy: paragraphs separated by blank lines', () => {
    const parts = lorem(3, 'paragraphs').output.split('\n\n');
    expect(parts.length).toBe(3);
  });

  it('invalid count → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() => lorem(0, 'words')),
      'invalid-option',
    );
    await expectDevError(
      Promise.resolve().then(() => lorem(Number.NaN, 'words')),
      'invalid-option',
    );
  });
});

describe('password-generator — Section 14.1', () => {
  it('happy: password length + charset respected', () => {
    const r = generatePassword({ kind: 'password', length: 20, useSymbols: true });
    expect(r.value.length).toBe(20);
    expect(r.entropyBits).toBeGreaterThanOrEqual(90);
    expect(r.strength).toBe('excellent');
  });

  it('happy: only-lowercase alphabet honored (no upper/digit/symbol chars present)', () => {
    const r = generatePassword({
      kind: 'password',
      length: 32,
      useUpper: false,
      useDigits: false,
      useSymbols: false,
    });
    expect(r.value).toMatch(/^[a-z]+$/);
    // Coverage sanity on the longest allowed run: length clamps at 128,
    // and P(all 26 letters in 128 uniform draws) ≈ 0.84 — demanding all
    // 26 made this test a ~1-in-6 flake (it fired on an ubuntu CI run).
    // ≥24 distinct letters holds with probability ≈ 1 − 4e-5.
    const long = generatePassword({
      kind: 'password',
      length: 500,
      useUpper: false,
      useDigits: false,
      useSymbols: false,
    });
    expect(long.value).toHaveLength(128);
    expect(new Set(long.value).size).toBeGreaterThanOrEqual(24);
  });

  it('happy: passphrase words + separator + entropy', () => {
    const r = generatePassword({ kind: 'passphrase', words: 5, separator: '.' });
    expect(r.value.split('.').length).toBe(5);
    expect(r.entropyBits).toBeGreaterThan(70);
  });

  it('malformed: no charset selected → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() =>
        generatePassword({
          kind: 'password',
          useLower: false,
          useUpper: false,
          useDigits: false,
          useSymbols: false,
        }),
      ),
      'invalid-option',
    );
  });
});

describe('unit-converter — Section 14.1', () => {
  it('happy: length km→mi', () => {
    expect(convertUnit(10, 'length', 'km', 'mi').value).toBeCloseTo(6.21371, 4);
  });

  it('happy: temperature c→f and f→c', () => {
    expect(convertUnit(100, 'temperature', 'c', 'f').value).toBeCloseTo(212, 6);
    expect(convertUnit(32, 'temperature', 'f', 'c').value).toBeCloseTo(0, 6);
    expect(convertUnit(0, 'temperature', 'c', 'k').value).toBeCloseTo(273.15, 6);
  });

  it('happy: data KiB vs KB differ (1024 vs 1000)', () => {
    expect(convertUnit(1, 'data', 'KiB', 'B').value).toBe(1024);
    expect(convertUnit(1, 'data', 'KB', 'B').value).toBe(1000);
  });

  it('happy: every category has units and round-trips through base', () => {
    for (const [cat, units] of Object.entries(UNIT_CATEGORIES)) {
      if (cat === 'temperature') continue;
      expect(units.length).toBeGreaterThan(1);
      const u = units[0];
      const u2 = units[1];
      if (u === undefined || u2 === undefined) throw new Error('missing units');
      const there = convertUnit(1, cat as never, u.id, u2.id).value;
      const back = convertUnit(there, cat as never, u2.id, u.id).value;
      expect(back).toBeCloseTo(1, 9);
    }
  });

  it('malformed: unknown unit → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertUnit(1, 'length', 'km', 'parsecs')),
      'invalid-option',
    );
  });

  it('malformed: non-numeric value → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertUnit(Number.NaN, 'length', 'km', 'mi')),
      'invalid-option',
    );
  });
});

describe('generators oversized guard', () => {
  it('case converter oversized at default cap → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertCase(OVERSIZED_TEXT, 'camel')),
      'size-limit',
    );
  });
});
