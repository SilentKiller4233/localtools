/** Shared test fixtures: the engine error codes list (single source:
 * apps/engine/src/errors.ts union, kept in sync by
 * tool-errors.test.ts's source-extraction test). */

export const toolErrorCodes = {
  engine: [
    'no-inputs',
    'empty-input',
    'invalid-file',
    'size-limit',
    'invalid-option',
    'tool-timeout',
    'tool-failed',
    'tool-unavailable',
    'engine-busy',
    'unauthorized',
    'unsupported-site',
    'blocked-host',
    'rate-limited',
    'too-long',
    'download-too-large',
    'internal',
  ] as const,
};
