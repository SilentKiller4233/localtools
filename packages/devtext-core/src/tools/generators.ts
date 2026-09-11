/**
 * Identifier + text generators (PROJECT_SPEC 3.4): UUID/ULID, case converter,
 * slug, lorem ipsum, password/passphrase with entropy indicator, unit
 * converter. All pure Group A logic.
 */

import { devError, requireText, assertTextCap, MAX_TEXT_CHARS } from '../types';

/**
 * ULID generation is implemented in-house (dropping the `ulid` package —
 * see DECISIONS.md D-042): ulid@2.4.0's default export runs detectPrng()
 * at MODULE-EVALUATION time, which only recognizes window.crypto; inside a
 * Web Worker (no window) it throws "secure crypto unusable" and takes
 * every devtext-core import in the browser down with it. The algorithm is
 * 30 lines of Crockford base32 over crypto random bytes (MIT reference:
 * ulid's own encodeTime/encodeRandom), fully worker-safe.
 */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const ULID_TIME_LEN = 10;
const ULID_RANDOM_LEN = 16;

/** Safe alphabet lookup — always defined for indexes 0..31. */
function b32(index: number): string {
  return ULID_ALPHABET.charAt(((index % 32) + 32) % 32);
}

function ulid(now = Date.now()): string {
  // Time part: 48-bit big-endian timestamp → 10 base32 chars.
  let time = Math.floor(now);
  if (!Number.isFinite(time) || time < 0 || time > 0xffff_ffff_ffff) {
    throw devError('operation-failed', 'Could not encode the current time as a ULID.');
  }
  let timeChars = '';
  for (let i = 0; i < ULID_TIME_LEN; i += 1) {
    timeChars = b32(time % 32) + timeChars;
    time = Math.floor(time / 32);
  }
  // Random part: 16 chars from crypto random bytes. A byte holds 256
  // values and 256 % 32 === 0, so byte % 32 is uniform over the alphabet
  // (128 bits of entropy total) — no rejection sampling required.
  const buf = new Uint8Array(ULID_RANDOM_LEN);
  globalThis.crypto.getRandomValues(buf);
  let randomChars = '';
  for (let i = 0; i < ULID_RANDOM_LEN; i += 1) {
    randomChars += b32(buf[i] ?? 0);
  }
  return timeChars + randomChars;
}

/* ---------------- UUID / ULID ---------------- */

export type IdKind = 'uuid' | 'ulid';

export interface IdResult {
  values: string[];
  kind: IdKind;
}

function cryptoSource(): Crypto {
  const c = globalThis.crypto;
  if (typeof c.randomUUID !== 'function') {
    throw devError('operation-failed', 'No secure random source is available in this context.');
  }
  return c;
}

export function generateIds(kind: IdKind, count = 1): IdResult {
  const n = Math.max(1, Math.min(500, Math.floor(count)));
  const cryptoObj = kind === 'uuid' ? cryptoSource() : undefined;
  const values: string[] = [];
  for (let i = 0; i < n; i += 1) {
    if (kind === 'uuid') {
      values.push(cryptoObj?.randomUUID() ?? '');
    } else {
      values.push(ulid());
    }
  }
  return { values, kind };
}

/* ---------------- Case converter ---------------- */

export type CaseKind =
  'camel' | 'pascal' | 'snake' | 'kebab' | 'constant' | 'title' | 'sentence' | 'lower' | 'upper';

function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

export function convertCase(
  text: string,
  kind: CaseKind,
  maxChars: number = MAX_TEXT_CHARS,
): { output: string } {
  requireText(text, 'text');
  assertTextCap(text, maxChars);
  const ws = words(text);
  if (ws.length === 0) throw devError('invalid-input', 'This text contains no letters or digits.');
  const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
  switch (kind) {
    case 'camel':
      return { output: ws.map((w, i) => (i === 0 ? w : cap(w))).join('') };
    case 'pascal':
      return { output: ws.map(cap).join('') };
    case 'snake':
      return { output: ws.join('_') };
    case 'kebab':
      return { output: ws.join('-') };
    case 'constant':
      return { output: ws.map((w) => w.toUpperCase()).join('_') };
    case 'title':
      return { output: ws.map(cap).join(' ') };
    case 'sentence': {
      const joined = ws.join(' ');
      return { output: joined.charAt(0).toUpperCase() + joined.slice(1) };
    }
    case 'lower':
      return { output: ws.join(' ') };
    case 'upper':
      return { output: ws.join(' ').toUpperCase() };
    default:
      throw devError('invalid-option', 'Unknown case kind.');
  }
}

/* ---------------- Slug ---------------- */

export function slugify(
  text: string,
  maxLength = 80,
  maxChars: number = MAX_TEXT_CHARS,
): { output: string } {
  requireText(text, 'text');
  assertTextCap(text, maxChars);
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  if (slug.length === 0) {
    throw devError('invalid-input', 'This text contains no characters that survive in a URL slug.');
  }
  return { output: slug };
}

/* ---------------- Lorem ipsum ---------------- */

const LOREM =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(
    ' ',
  );

/** Lorem text — Math.random is fine here (not security-relevant). */
export function lorem(
  count: number,
  unit: 'paragraphs' | 'sentences' | 'words',
): { output: string } {
  if (!Number.isFinite(count) || count <= 0) {
    throw devError('invalid-option', 'Count must be a positive number.');
  }
  const n = Math.max(1, Math.min(100, Math.floor(count)));
  const randWord = (): string => {
    const w = LOREM[Math.floor(Math.random() * LOREM.length)];
    if (w === undefined) throw devError('operation-failed', 'lorem table empty');
    return w;
  };
  const randSentence = (): string => {
    const len = 8 + Math.floor(Math.random() * 10);
    const parts: string[] = [];
    for (let i = 0; i < len; i += 1) parts.push(randWord());
    const s = parts.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  };
  if (unit === 'words') {
    const parts: string[] = [];
    for (let i = 0; i < n; i += 1) parts.push(randWord());
    return { output: parts.join(' ') };
  }
  if (unit === 'sentences') {
    const parts: string[] = [];
    for (let i = 0; i < n; i += 1) parts.push(randSentence());
    return { output: parts.join(' ') };
  }
  const paras: string[] = [];
  for (let p = 0; p < n; p += 1) {
    const sCount = 3 + Math.floor(Math.random() * 3);
    const parts: string[] = [];
    for (let i = 0; i < sCount; i += 1) parts.push(randSentence());
    paras.push(parts.join(' '));
  }
  return { output: paras.join('\n\n') };
}

/* ---------------- Password / passphrase ---------------- */

export type PasswordKind = 'password' | 'passphrase';

export interface PasswordResult {
  value: string;
  /** Entropy estimate in bits (log2 of the generating alphabet). */
  entropyBits: number;
  /** Rough strength band, clearly approximate. */
  strength: 'weak' | 'fair' | 'strong' | 'excellent';
  kind: PasswordKind;
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
} as const;

export type PasswordOptions = {
  kind: PasswordKind;
  length?: number;
  words?: number;
  separator?: string;
  useLower?: boolean;
  useUpper?: boolean;
  useDigits?: boolean;
  useSymbols?: boolean;
};

/** Uniform unbiased pick via rejection sampling over crypto random bytes. */
function pickUniform(alphabet: string): string {
  const cryptoObj = cryptoSource();
  const buf = new Uint32Array(1);
  const setLen = 256 - (256 % alphabet.length);
  for (;;) {
    cryptoObj.getRandomValues(buf);
    const b = buf[0] ?? 0;
    if (b % 256 < setLen) return alphabet[b % alphabet.length] ?? alphabet[0] ?? '';
  }
}

function randInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function generatePassword(options: PasswordOptions): PasswordResult {
  if (options.kind === 'passphrase') {
    const wordCount = Math.max(3, Math.min(12, Math.floor(options.words ?? 4)));
    const separator = options.separator ?? '-';
    const wordsUsed: string[] = [];
    for (let i = 0; i < wordCount; i += 1) {
      const w = LOREM[randInt(LOREM.length)];
      if (w === undefined) throw devError('operation-failed', 'word table empty');
      wordsUsed.push(w);
    }
    const value = wordsUsed.join(separator);
    // ~200k-word diceware-style list assumed; stated as approximate
    const entropyBits = Math.round(wordCount * Math.log2(200000));
    return { value, entropyBits, strength: strengthOf(entropyBits), kind: 'passphrase' };
  }
  const length = Math.max(4, Math.min(128, Math.floor(options.length ?? 16)));
  const useLower = options.useLower !== false;
  const useUpper = options.useUpper !== false;
  const useDigits = options.useDigits !== false;
  const useSymbols = options.useSymbols ?? false;
  const alphabet =
    (useLower ? SETS.lower : '') +
    (useUpper ? SETS.upper : '') +
    (useDigits ? SETS.digits : '') +
    (useSymbols ? SETS.symbols : '');
  if (alphabet.length === 0) {
    throw devError('invalid-option', 'Select at least one character set.');
  }
  const chars: string[] = [];
  for (let i = 0; i < length; i += 1) chars.push(pickUniform(alphabet));
  const entropyBits = Math.round(length * Math.log2(alphabet.length));
  return {
    value: chars.join(''),
    entropyBits,
    strength: strengthOf(entropyBits),
    kind: 'password',
  };
}

function strengthOf(bits: number): PasswordResult['strength'] {
  if (bits < 40) return 'weak';
  if (bits < 60) return 'fair';
  if (bits < 90) return 'strong';
  return 'excellent';
}

/* ---------------- Unit converter ---------------- */

export type UnitCategory =
  'length' | 'weight' | 'temperature' | 'data' | 'speed' | 'area' | 'volume' | 'time';

export interface UnitDef {
  id: string;
  label: string;
  /** 1 unit expressed in the category's base unit. */
  factor: number;
}

export const UNIT_CATEGORIES: Readonly<Record<UnitCategory, readonly UnitDef[]>> = {
  length: [
    { id: 'mm', label: 'millimeter', factor: 0.001 },
    { id: 'cm', label: 'centimeter', factor: 0.01 },
    { id: 'm', label: 'meter', factor: 1 },
    { id: 'km', label: 'kilometer', factor: 1000 },
    { id: 'in', label: 'inch', factor: 0.0254 },
    { id: 'ft', label: 'foot', factor: 0.3048 },
    { id: 'yd', label: 'yard', factor: 0.9144 },
    { id: 'mi', label: 'mile', factor: 1609.344 },
    { id: 'nmi', label: 'nautical mile', factor: 1852 },
  ],
  weight: [
    { id: 'mg', label: 'milligram', factor: 1e-6 },
    { id: 'g', label: 'gram', factor: 0.001 },
    { id: 'kg', label: 'kilogram', factor: 1 },
    { id: 't', label: 'metric ton', factor: 1000 },
    { id: 'oz', label: 'ounce', factor: 0.028349523125 },
    { id: 'lb', label: 'pound', factor: 0.45359237 },
    { id: 'st', label: 'stone', factor: 6.35029318 },
  ],
  temperature: [
    { id: 'c', label: 'Celsius', factor: 1 },
    { id: 'f', label: 'Fahrenheit', factor: 1 },
    { id: 'k', label: 'Kelvin', factor: 1 },
  ],
  data: [
    { id: 'bit', label: 'bit', factor: 1 / 8 },
    { id: 'B', label: 'byte', factor: 1 },
    { id: 'KB', label: 'kilobyte (1000)', factor: 1e3 },
    { id: 'KiB', label: 'kibibyte (1024)', factor: 2 ** 10 },
    { id: 'MB', label: 'megabyte (1000²)', factor: 1e6 },
    { id: 'MiB', label: 'mebibyte (1024²)', factor: 2 ** 20 },
    { id: 'GB', label: 'gigabyte (1000³)', factor: 1e9 },
    { id: 'GiB', label: 'gibibyte (1024³)', factor: 2 ** 30 },
    { id: 'TB', label: 'terabyte (1000⁴)', factor: 1e12 },
    { id: 'TiB', label: 'tebibyte (1024⁴)', factor: 2 ** 40 },
  ],
  speed: [
    { id: 'm/s', label: 'meter/second', factor: 1 },
    { id: 'km/h', label: 'kilometer/hour', factor: 1000 / 3600 },
    { id: 'mph', label: 'mile/hour', factor: 1609.344 / 3600 },
    { id: 'kn', label: 'knot', factor: 1852 / 3600 },
  ],
  area: [
    { id: 'm2', label: 'square meter', factor: 1 },
    { id: 'km2', label: 'square kilometer', factor: 1e6 },
    { id: 'ft2', label: 'square foot', factor: 0.09290304 },
    { id: 'ac', label: 'acre', factor: 4046.8564224 },
    { id: 'ha', label: 'hectare', factor: 1e4 },
  ],
  volume: [
    { id: 'ml', label: 'milliliter', factor: 0.001 },
    { id: 'l', label: 'liter', factor: 1 },
    { id: 'm3', label: 'cubic meter', factor: 1000 },
    { id: 'tsp', label: 'teaspoon (US)', factor: 0.00492892159375 },
    { id: 'tbsp', label: 'tablespoon (US)', factor: 0.01478676478125 },
    { id: 'cup', label: 'cup (US)', factor: 0.2365882365 },
    { id: 'gal', label: 'gallon (US)', factor: 3.785411784 },
  ],
  time: [
    { id: 'ms', label: 'millisecond', factor: 0.001 },
    { id: 's', label: 'second', factor: 1 },
    { id: 'min', label: 'minute', factor: 60 },
    { id: 'h', label: 'hour', factor: 3600 },
    { id: 'd', label: 'day', factor: 86400 },
    { id: 'wk', label: 'week', factor: 604800 },
    { id: 'mo', label: 'month (30d)', factor: 2592000 },
    { id: 'yr', label: 'year (365d)', factor: 31536000 },
  ],
};

export interface UnitResult {
  value: number;
}

export function convertUnit(
  value: number,
  category: UnitCategory,
  from: string,
  to: string,
): UnitResult {
  if (!Number.isFinite(value)) throw devError('invalid-option', 'The value must be a number.');
  if (category === 'temperature') {
    const toC = (unit: string, v: number): number => {
      if (unit === 'c') return v;
      if (unit === 'f') return ((v - 32) * 5) / 9;
      if (unit === 'k') return v - 273.15;
      throw devError('invalid-option', `Unknown temperature unit “${unit}”.`);
    };
    const fromC = (unit: string, c: number): number => {
      if (unit === 'c') return c;
      if (unit === 'f') return (c * 9) / 5 + 32;
      if (unit === 'k') return c + 273.15;
      throw devError('invalid-option', `Unknown temperature unit “${unit}”.`);
    };
    if (from === to) return { value };
    return { value: fromC(to, toC(from, value)) };
  }
  const units = UNIT_CATEGORIES[category];
  const f = units.find((u) => u.id === from);
  const t = units.find((u) => u.id === to);
  if (f === undefined || t === undefined) {
    throw devError('invalid-option', 'Unknown source or target unit for this category.');
  }
  return { value: (value * f.factor) / t.factor };
}
