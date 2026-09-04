/**
 * Hashing (PROJECT_SPEC 3.4): Web Crypto SHA family + spark-md5 for MD5
 * (Web Crypto has no MD5 — spec names spark-md5 exactly).
 */

import SparkMD5 from 'spark-md5';
import {
  devError,
  requireBytes,
  requireText,
  assertSize,
  assertTextCap,
  asBytes,
  MAX_TEXT_CHARS,
  MAX_DEVTEXT_BYTES,
} from '../types';

export type HashAlgorithm = 'md5' | 'sha-1' | 'sha-256' | 'sha-512';

export interface HashResult {
  algorithm: HashAlgorithm;
  hex: string;
}

function subtle(): SubtleCrypto {
  // Types say non-optional; Workers/Node 22 always provide it. Runtime check
  // stays for exotic contexts, typed to satisfy no-unnecessary-condition.
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.subtle === undefined) {
    throw devError('operation-failed', 'Web Crypto is unavailable in this context.');
  }
  return c.subtle;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export async function hashText(
  text: string,
  algorithms: HashAlgorithm[],
  maxChars: number = MAX_TEXT_CHARS,
): Promise<HashResult[]> {
  requireText(text, 'text');
  assertTextCap(text, maxChars);
  return hashBytes(new TextEncoder().encode(text), algorithms);
}

export async function hashBytes(
  bytes: Uint8Array,
  algorithms: HashAlgorithm[],
  maxBytes: number = MAX_DEVTEXT_BYTES,
): Promise<HashResult[]> {
  requireBytes(bytes, 'data');
  assertSize(bytes, maxBytes);
  if (algorithms.length === 0) {
    throw devError('invalid-option', 'Select at least one algorithm.');
  }
  const results: HashResult[] = [];
  for (const algorithm of algorithms) {
    if (algorithm === 'md5') {
      const spark = new SparkMD5.ArrayBuffer();
      const copy = asBytes(bytes);
      spark.append(copy.buffer as ArrayBuffer);
      results.push({ algorithm, hex: spark.end() });
      continue;
    }
    const digest = await subtle().digest(algorithm.toUpperCase(), bytes as unknown as BufferSource);
    results.push({ algorithm, hex: toHex(asBytes(new Uint8Array(digest))) });
  }
  return results;
}

/** A file's SHA-256 (the download-verification default). */
export async function fileSha256(
  bytes: Uint8Array,
  maxBytes: number = MAX_DEVTEXT_BYTES,
): Promise<HashResult> {
  const results = await hashBytes(bytes, ['sha-256'], maxBytes);
  const first = results[0];
  if (first === undefined) throw devError('operation-failed', 'Hashing failed.');
  return first;
}
