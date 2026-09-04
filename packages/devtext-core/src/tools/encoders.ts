/**
 * Encoding tools (PROJECT_SPEC 3.4): Base64 (text+file), URL encode/decode,
 * JWT decoder (decode/inspect ONLY — no signature verification, per spec).
 */

import {
  devError,
  requireBytes,
  requireText,
  assertTextCap,
  assertSize,
  MAX_TEXT_CHARS,
  MAX_DEVTEXT_BYTES,
} from '../types';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** B64 alphabet used for JWT segments (URL-safe base64). */
function b64UrlDecode(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ToBytes(cleaned: string): Uint8Array {
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/* ---------------- Base64 ---------------- */

export type B64Direction = 'encode' | 'decode';

export interface Base64Result {
  output: string;
}

export function base64Text(
  text: string,
  direction: B64Direction,
  maxChars: number = MAX_TEXT_CHARS,
): Base64Result {
  requireText(text, 'text');
  assertTextCap(text, maxChars);
  if (direction === 'encode') {
    const bytes = encoder.encode(text);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return { output: btoa(binary) };
  }
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw devError('invalid-input', 'This is not valid Base64 text.');
  }
  try {
    return { output: decoder.decode(b64ToBytes(cleaned)) };
  } catch {
    throw devError('invalid-input', 'This is not valid Base64 text.');
  }
}

export function base64EncodeFile(
  bytes: Uint8Array,
  maxBytes: number = MAX_DEVTEXT_BYTES,
): Base64Result {
  requireBytes(bytes, 'file');
  assertSize(bytes, maxBytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { output: btoa(binary) };
}

export function base64DecodeFile(
  text: string,
  maxChars: number = MAX_TEXT_CHARS,
): { bytes: Uint8Array } {
  requireText(text, 'Base64');
  assertTextCap(text, maxChars);
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw devError('invalid-input', 'This is not valid Base64 text.');
  }
  return { bytes: b64ToBytes(cleaned) };
}

/* ---------------- URL ---------------- */

export type UrlMode = 'encode' | 'encode-component' | 'decode';

export interface UrlResult {
  output: string;
}

export function urlCode(text: string, mode: UrlMode, maxChars: number = MAX_TEXT_CHARS): UrlResult {
  requireText(text, 'text');
  assertTextCap(text, maxChars);
  try {
    if (mode === 'encode') return { output: encodeURI(text) };
    if (mode === 'encode-component') return { output: encodeURIComponent(text) };
    return { output: decodeURIComponent(text.replace(/\+/g, '%20')) };
  } catch {
    throw devError(
      'invalid-input',
      'This text could not be decoded — it contains an invalid percent-escape (e.g. a lone “%”).',
    );
  }
}

/* ---------------- JWT (decode/inspect ONLY) ---------------- */

export interface JwtResult {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** Raw signature segment (base64url, NOT verified). */
  signature: string;
  /** Human-readable note — the tool never implies verification. */
  note: string;
}

const JWT_NOTE =
  'Decoded for inspection only — the signature is NOT verified. Do not treat these claims as authentic.';

export function decodeJwt(token: string, maxChars: number = MAX_TEXT_CHARS): JwtResult {
  requireText(token, 'JWT');
  assertTextCap(token, maxChars);
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] === '' || parts[1] === '' || parts[2] === '') {
    throw devError(
      'invalid-input',
      'A JWT has three dot-separated segments (header.payload.signature) — this does not.',
    );
  }
  const parseSegment = (segment: string, what: string): Record<string, unknown> => {
    let bytes: Uint8Array;
    try {
      bytes = b64UrlDecode(segment);
    } catch {
      throw devError('invalid-input', `The ${what} segment is not valid base64url.`);
    }
    try {
      const value: unknown = JSON.parse(decoder.decode(bytes));
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('not an object');
      }
      return value as Record<string, unknown>;
    } catch {
      throw devError('invalid-input', `The ${what} segment does not contain a JSON object.`);
    }
  };
  return {
    header: parseSegment(parts[0] ?? '', 'header'),
    payload: parseSegment(parts[1] ?? '', 'payload'),
    signature: parts[2] ?? '',
    note: JWT_NOTE,
  };
}

export { bytesToB64Url };
