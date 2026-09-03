/**
 * Engine error taxonomy (PROJECT_SPEC Section 5.6 + 9).
 *
 * Mirrors the shape of pdf-core's ToolError (code + human-safe message)
 * so the client renders Group A and Group B failures with one pattern,
 * but Layer 2 owns its own codes — it never imports Layer 1's pdf-core.
 */

export type EngineErrorCode =
  | 'no-inputs' // no file part in the request
  | 'empty-input' // file part with zero bytes
  | 'invalid-file' // magic-byte sniff failed or wrong type for the tool
  | 'size-limit' // per-file or total-request cap exceeded (5.2)
  | 'invalid-option' // options failed zod validation
  | 'tool-timeout' // subprocess exceeded its wall-clock cap (5.3)
  | 'tool-failed' // subprocess exited non-zero
  | 'tool-unavailable' // native binary missing on this host
  | 'engine-busy' // concurrency cap reached → HTTP 429 (5.2/13)
  | 'unauthorized' // exposed engine + missing/invalid bearer token (5.1)
  | 'internal'; // unexpected failure

/** Every engine error. `message` is always safe to show (no paths). */
export class EngineToolError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineToolError';
  }
}

/** Codes that map to a specific HTTP status. */
export function statusForCode(code: EngineErrorCode): number {
  switch (code) {
    case 'no-inputs':
    case 'empty-input':
    case 'invalid-file':
      return 422;
    case 'size-limit':
      return 413;
    case 'invalid-option':
      return 400;
    case 'tool-timeout':
      return 504;
    case 'tool-failed':
      return 422;
    case 'tool-unavailable':
      return 503;
    case 'engine-busy':
      return 429;
    case 'unauthorized':
      return 401;
    default:
      return 500;
  }
}

/** Default human-readable copy per code (client may override). */
export const ENGINE_ERROR_MESSAGES: Readonly<Record<EngineErrorCode, string>> = {
  'no-inputs': 'Select at least one file first.',
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-file': 'This file is not a type this tool can process.',
  'size-limit': 'A file exceeds the processing size limit.',
  'invalid-option': 'One of the settings is not valid — check the highlighted fields.',
  'tool-timeout': 'The operation took too long and was stopped.',
  'tool-failed': 'The file could not be processed — it may be damaged or unsupported.',
  'tool-unavailable': 'This tool needs a component that isn’t installed on this device.',
  'engine-busy': 'The processing engine is busy — try again in a moment.',
  unauthorized: 'This request is not authorized.',
  internal: 'The operation failed unexpectedly.',
};
