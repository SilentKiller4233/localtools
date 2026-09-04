/**
 * Shared types + error taxonomy for the Text & Dev suite. Mirrors
 * pdf-core/image-core ToolError so the client renders one human-readable
 * pattern (code → copy) across every suite.
 */

export type DevTextToolErrorCode =
  | 'empty-input' // no text/bytes supplied
  | 'invalid-input' // unparseable content (bad JSON/YAML/XML/JWT…)
  | 'invalid-option' // a non-content option is invalid
  | 'no-inputs' // a multi-input tool got nothing
  | 'size-limit' // input exceeds the configured cap
  | 'too-many-files' // more files than the tool accepts
  | 'operation-failed'; // library failed on nominally-valid input

export class DevTextToolError extends Error {
  readonly code: DevTextToolErrorCode;
  constructor(code: DevTextToolErrorCode, message: string) {
    super(message);
    this.name = 'DevTextToolError';
    this.code = code;
  }
}

export function devError(code: DevTextToolErrorCode, message?: string): DevTextToolError {
  return new DevTextToolError(code, message ?? DEFAULT_MESSAGES[code]);
}

export const DEFAULT_MESSAGES: Readonly<Record<DevTextToolErrorCode, string>> = {
  'empty-input': 'No input was supplied.',
  'invalid-input': 'This content could not be parsed. Check the syntax and try again.',
  'invalid-option': 'One of the options is not valid.',
  'no-inputs': 'Provide the required inputs first.',
  'size-limit': 'The input exceeds the processing size cap.',
  'too-many-files': 'Too many files were supplied.',
  'operation-failed': 'The operation failed.',
};

/** Section 8 processing cap for file-backed dev tools. */
export const MAX_DEVTEXT_BYTES: number = 500 * 1024 * 1024;

/** Guard helpers shared by every tool. */
export function requireText(text: string, what = 'input'): string {
  if (typeof text !== 'string' || text.length === 0) {
    throw devError('empty-input', `No ${what} text was supplied.`);
  }
  return text;
}

export function requireBytes(bytes: Uint8Array, what = 'input'): Uint8Array {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw devError('empty-input', `No ${what} bytes were supplied.`);
  }
  return bytes;
}

export function assertSize(bytes: Uint8Array, maxBytes = MAX_DEVTEXT_BYTES): void {
  if (bytes.byteLength > maxBytes) {
    throw devError(
      'size-limit',
      `Input exceeds the ${String(Math.round(maxBytes / (1024 * 1024)))}MB cap.`,
    );
  }
}

/** Normalize @jsquash-style outputs that may come back as ArrayBuffer. */
export function asBytes(out: Uint8Array | ArrayBuffer): Uint8Array {
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

/** Default cap for pure-text tools (Section 8 sanity guard; seam for tests). */
export const MAX_TEXT_CHARS: number = 5_000_000;

/** Throw size-limit when a text input exceeds its cap. */
export function assertTextCap(text: string, maxChars: number): void {
  if (text.length > maxChars) {
    throw devError(
      'size-limit',
      `This input exceeds the text size cap (${String(maxChars)} characters).`,
    );
  }
}
