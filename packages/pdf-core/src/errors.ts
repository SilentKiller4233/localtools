/**
 * ToolError — the error type every pdf-core tool rejects with. The client maps
 * `code` to a human-readable message; `message` stays technical-but-clear.
 * Never include raw filesystem paths or user content in these.
 */
export class ToolError extends Error {
  readonly code: ToolErrorCode;

  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

export type ToolErrorCode =
  | 'empty-input' // no bytes supplied
  | 'invalid-pdf' // bytes are not a parseable PDF
  | 'encrypted-pdf' // password-protected input on a non-Unlock tool
  | 'page-range' // page selection is empty or out of bounds
  | 'no-inputs' // a multi-file tool received no files
  | 'single-file-only' // multiple files supplied to a one-file tool
  | 'size-limit' // input exceeds the configured cap
  | 'zero-page-pdf' // parseable header but no pages
  | 'invalid-option' // a non-file option (text, size, color…) is invalid
  | 'qpdf-failed'; // the qpdf-wasm step failed (bad password, corrupt input…)

export const MAX_PDF_BYTES: number = 500 * 1024 * 1024; // Section 8: 500MB

/** Human-readable defaults per code; tools may override the message. */
export const ERROR_MESSAGES: Readonly<Record<ToolErrorCode, string>> = {
  'empty-input': 'No file content was supplied.',
  'invalid-pdf': 'This file could not be read as a PDF.',
  'encrypted-pdf':
    'This PDF is password-protected. Unlock it with the Unlock tool first, then retry.',
  'page-range': 'The requested page range is empty or outside this document.',
  'no-inputs': 'Select at least one PDF file.',
  'single-file-only': 'This tool processes one file at a time.',
  'size-limit': `File exceeds the ${String(Math.round(MAX_PDF_BYTES / (1024 * 1024)))}MB processing cap.`,
  'zero-page-pdf': 'This PDF contains no pages.',
  'invalid-option': 'One of the options is not valid.',
  'qpdf-failed': 'The PDF operation failed — the file or password may be invalid.',
};

export function toolError(code: ToolErrorCode, message?: string): ToolError {
  return new ToolError(code, message ?? ERROR_MESSAGES[code]);
}

/** True when any thrown value is a pdf-lib encryption failure. */
export function isPdfLibEncryptionError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'EncryptedPDFError' || /password|encrypt/i.test(err.message))
  );
}
