import { qpdfReadFile, qpdfWriteFile, runQpdf, getQpdf } from '../qpdf';
import { assertSize, hasPdfSignature } from '../load';
import { ToolError, toolError } from '../errors';

export type AesLevel = 'aes-128' | 'aes-256';

export interface ProtectOptions {
  /** Password needed to OPEN the document. Required, non-empty. */
  userPassword: string;
  /** Password controlling permissions. Defaults to the user password. */
  ownerPassword?: string;
  /** Default aes-256 per Section 3.1. */
  level?: AesLevel;
}

const MAX_PASSWORD = 128;

function validatePasswords(options: ProtectOptions): void {
  const { userPassword, ownerPassword } = options;
  if (userPassword === '') {
    throw new ToolError('invalid-option', 'Enter a password to protect this PDF with.');
  }
  if (userPassword.length > MAX_PASSWORD) {
    throw new ToolError(
      'invalid-option',
      `Passwords are limited to ${String(MAX_PASSWORD)} characters.`,
    );
  }
  if (ownerPassword !== undefined && ownerPassword.length > MAX_PASSWORD) {
    throw new ToolError(
      'invalid-option',
      `Passwords are limited to ${String(MAX_PASSWORD)} characters.`,
    );
  }
}

/**
 * Protect (encrypt) a PDF with real AES-128/256 via qpdf-wasm (Section 3.1).
 * qpdf refuses empty owner passwords on 256-bit keys (openable-without-
 * password is insecure), so the owner password defaults to the user password
 * — explicit, never silent, surfaced in the returned options the client
 * shows. Arg-array invocation only (Section 5.3 discipline, WASM edition).
 */
export async function protectPdf(bytes: Uint8Array, options: ProtectOptions): Promise<Uint8Array> {
  validatePasswords(options);
  assertSize(bytes);
  if (!hasPdfSignature(bytes)) {
    throw toolError('invalid-pdf');
  }
  const qpdf = await getQpdf();
  qpdfWriteFile(qpdf, 'in.pdf', bytes);
  const args = [
    'in.pdf',
    '--encrypt',
    options.userPassword,
    options.ownerPassword ?? options.userPassword,
    options.level === 'aes-128' ? '128' : '256',
    '--',
    'out.pdf',
  ];
  await runQpdf(args);
  return qpdfReadFile(qpdf, 'out.pdf');
}

/**
 * Unlock (decrypt) a password-protected PDF. The password is required; wrong
 * passwords surface qpdf's failure as a clear qpdf-failed error, never a
 * crash. Output is a clean unencrypted PDF usable by every other tool.
 */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (password === '') {
    throw new ToolError('invalid-option', 'Enter the password for this PDF.');
  }
  assertSize(bytes);
  if (!hasPdfSignature(bytes)) {
    throw toolError('invalid-pdf');
  }
  const qpdf = await getQpdf();
  qpdfWriteFile(qpdf, 'in.pdf', bytes);
  await runQpdf(['in.pdf', `--password=${password}`, '--decrypt', 'out.pdf']);
  return qpdfReadFile(qpdf, 'out.pdf');
}

/**
 * Optimize/linearize a PDF for fast web viewing via qpdf-wasm
 * (Section 3.1 Group A list).
 */
export async function optimizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  assertSize(bytes);
  if (!hasPdfSignature(bytes)) {
    throw toolError('invalid-pdf');
  }
  const qpdf = await getQpdf();
  qpdfWriteFile(qpdf, 'in.pdf', bytes);
  await runQpdf(['in.pdf', '--linearize', 'out.pdf']);
  return qpdfReadFile(qpdf, 'out.pdf');
}
