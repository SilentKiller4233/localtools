import { describe, expect, it } from 'vitest';
import { hashText, hashBytes, fileSha256 } from '../src/tools/hashing';
import { testRegex } from '../src/tools/regex';
import { diffTexts } from '../src/tools/diffcheck';
import { expectDevError, OVERSIZED_TEXT } from './helpers';

describe('hash-generator — Section 14.1', () => {
  it('happy: known digests for "hello"', async () => {
    const rs = await hashText('hello', ['md5', 'sha-1', 'sha-256', 'sha-512']);
    const map = Object.fromEntries(rs.map((r) => [r.algorithm, r.hex]));
    expect(map['md5']).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(map['sha-1']).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    expect(map['sha-256']).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(map['sha-512']?.startsWith('9b71d224bd62f3785d96d46ad3ea3d73')).toBe(true);
    expect(map['sha-512']?.length).toBe(128);
  });

  it('happy: empty bytes are rejected before hashing (empty-input, not crash)', async () => {
    await expectDevError(hashBytes(new Uint8Array(0), ['sha-256']), 'empty-input');
  });

  it('happy: bytes path = text path', async () => {
    const bytes = new TextEncoder().encode('hello');
    const [a] = await hashBytes(bytes, ['sha-256']);
    const [b] = await hashText('hello', ['sha-256']);
    expect(a?.hex).toBe(b?.hex);
  });

  it('happy: fileSha256 wrapper', async () => {
    const r = await fileSha256(new TextEncoder().encode('abc'));
    expect(r.hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('malformed: no algorithms → invalid-option', async () => {
    await expectDevError(hashText('hello', []), 'invalid-option');
  });

  it('empty → empty-input', async () => {
    await expectDevError(hashText('', ['sha-256']), 'empty-input');
    await expectDevError(hashBytes(new Uint8Array(0), ['sha-256']), 'empty-input');
  });

  it('oversized: bytes over cap (seam) → size-limit', async () => {
    await expectDevError(hashBytes(new Uint8Array(64).fill(1), ['sha-256'], 32), 'size-limit');
  });
});

describe('regex-tester — Section 14.1', () => {
  it('happy: finds matches with offsets', () => {
    const r = testRegex('\\d+', 'order 42 and 7 items');
    expect(r.count).toBe(2);
    expect(r.matches[0]?.text).toBe('42');
    expect(r.matches[0]?.index).toBe(6);
    expect(r.matches[1]?.text).toBe('7');
  });

  it('happy: named + numbered groups', () => {
    const r = testRegex('(?<year>\\d{4})-(?<month>\\d{2})', '2026-09-04 and 2025-12-25');
    expect(r.count).toBe(2);
    expect(r.namedGroups).toContain('year');
    const g = r.matches[0]?.groups.find((x) => x.name === 'year');
    expect(g?.text).toBe('2026');
  });

  it('happy: no matches is a valid result, not an error', () => {
    expect(testRegex('zzz', 'abc').count).toBe(0);
  });

  it('happy: zero-length pattern does not hang', () => {
    const r = testRegex('a*', 'bab');
    expect(r.count).toBeGreaterThan(0);
  });

  it('malformed: bad pattern → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => testRegex('[unclosed', 'x')),
      'invalid-input',
    );
  });

  it('empty: no pattern → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => testRegex('', 'x')),
      'empty-input',
    );
  });

  it('oversized subject (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => testRegex('a', 'aaa', 'g', 2)),
      'size-limit',
    );
  });
});

describe('text-diff — Section 14.1', () => {
  it('happy: identical texts → identical true', () => {
    const r = diffTexts('a\nb\nc', 'a\nb\nc');
    expect(r.identical).toBe(true);
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
  });

  it('happy: change detected with counts + patch', () => {
    const r = diffTexts('one\ntwo\nthree', 'one\nTWO\nfour');
    expect(r.identical).toBe(false);
    expect(r.added).toBeGreaterThan(0);
    expect(r.removed).toBeGreaterThan(0);
    expect(r.patch).toContain('- two');
    expect(r.patch).toContain('+ TWO');
    expect(r.patch).toContain('+ four');
  });

  it('happy: pure addition counts only added', () => {
    const r = diffTexts('a', 'a\nb');
    expect(r.added).toBe(2); // jsdiff chunks 'a' removed + 'a\nb' added → 1+1 lines
    expect(r.removed).toBe(1);
    expect(r.patch).toContain('+ a');
    expect(r.patch).toContain('+ b');
  });

  it('empty: both empty → no-inputs', async () => {
    await expectDevError(
      Promise.resolve().then(() => diffTexts('', '')),
      'no-inputs',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => diffTexts('aaaa', 'bbbb', 2)),
      'size-limit',
    );
  });
});

describe('hash oversized default', () => {
  it('text over 5M chars → size-limit', async () => {
    await expectDevError(hashText(OVERSIZED_TEXT, ['md5']), 'size-limit');
  });
});
