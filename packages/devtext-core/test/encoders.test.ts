import { describe, expect, it } from 'vitest';
import {
  base64Text,
  base64EncodeFile,
  base64DecodeFile,
  urlCode,
  decodeJwt,
} from '../src/tools/encoders';
import { expectDevError, OVERSIZED_TEXT } from './helpers';

const HELLO_B64 = 'aGVsbG8gd29ybGQ='; // "hello world"

/** A valid JWT shape: header.payload.signature (unsigned test token). */
function makeJwt(): string {
  const enc = (obj: object): string => {
    const json = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (const b of json) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: '123', name: 'LocalTools Tester' })}.sig-not-verified`;
}

describe('base64 (text) — Section 14.1', () => {
  it('happy: encodes utf-8 text', () => {
    expect(base64Text('hello world', 'encode').output).toBe(HELLO_B64);
  });

  it('happy: decodes back to identical text', () => {
    expect(base64Text(HELLO_B64, 'decode').output).toBe('hello world');
  });

  it('happy: round-trips non-ASCII (emoji)', () => {
    const r = base64Text('héllo — wörld ✓', 'encode');
    expect(base64Text(r.output, 'decode').output).toBe('héllo — wörld ✓');
  });

  it('happy: file encode → decode round-trip bytes', () => {
    const bytes = new TextEncoder().encode('binary-ish content');
    const enc = base64EncodeFile(bytes);
    const dec = base64DecodeFile(enc.output);
    expect(dec.bytes).toEqual(bytes);
  });

  it('malformed: invalid alphabet → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => base64Text('!!!not-b64!!!', 'decode')),
      'invalid-input',
    );
  });

  it('malformed: impossible length (mod 4 == 1) → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => base64Text('abcde', 'decode')),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => base64Text('', 'encode')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => base64Text('hello', 'encode', 2)),
      'size-limit',
    );
  });

  it('oversized: default cap text → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => base64Text(OVERSIZED_TEXT, 'encode')),
      'size-limit',
    );
  });
});

describe('url-encoder — Section 14.1', () => {
  it('happy: encode keeps structure, encodes specials', () => {
    expect(urlCode('https://ex.com/a b?x=1&y=2', 'encode').output).toBe(
      'https://ex.com/a%20b?x=1&y=2',
    );
  });

  it('happy: encode-component escapes reserved chars', () => {
    expect(urlCode('a b&c=d/e?x', 'encode-component').output).toBe('a%20b%26c%3Dd%2Fe%3Fx');
  });

  it('happy: decode reverses component encoding', () => {
    expect(urlCode('a%20b%26c%3Dd', 'decode').output).toBe('a b&c=d');
  });

  it('happy: decode treats + as space (query-string convention)', () => {
    expect(urlCode('a+b', 'decode').output).toBe('a b');
  });

  it('malformed: lone percent → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => urlCode('100%', 'decode')),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => urlCode('', 'encode')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => urlCode('abc', 'encode', 2)),
      'size-limit',
    );
  });
});

describe('jwt-decoder — Section 14.1 (decode/inspect ONLY)', () => {
  it('happy: decodes header + payload, keeps raw signature', () => {
    const r = decodeJwt(makeJwt());
    expect(r.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(r.payload).toEqual({ sub: '123', name: 'LocalTools Tester' });
    expect(r.signature).toBe('sig-not-verified');
  });

  it('happy: note states the signature is NOT verified', () => {
    const r = decodeJwt(makeJwt());
    expect(r.note).toContain('NOT');
  });

  it('malformed: two segments → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => decodeJwt('a.b')),
      'invalid-input',
    );
  });

  it('malformed: non-JSON payload → invalid-input', async () => {
    const bad = btoa('not json').replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_');
    await expectDevError(
      Promise.resolve().then(() => decodeJwt(`x.${bad}.y`)),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => decodeJwt('')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => decodeJwt('a.b.c', 2)),
      'size-limit',
    );
  });
});
