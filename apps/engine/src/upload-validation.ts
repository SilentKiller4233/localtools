/**
 * Upload validation (PROJECT_SPEC Section 5.2): magic-byte checks via the
 * `file-type` package — never extension or MIME trust.
 *
 * HTML has no signature in file-type's table; we sniff it structurally
 * (doctype/tag prefix). Legacy Office CFB containers (doc/xls/ppt) share
 * one magic and are disambiguated by their stream directory names.
 */

import { fileTypeFromBuffer } from 'file-type';
import { EngineToolError } from './errors.js';

/** Logical kinds the Group B tools accept. */
export type AcceptedKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'doc' | 'xls' | 'ppt' | 'html';

export interface SniffedFile {
  kind: AcceptedKind;
  /** Extension for the on-disk internal name. */
  ext: string;
}

const CFB_MAGIC: readonly number[] = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isCfb(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  return CFB_MAGIC.every((b, i) => bytes[i] === b);
}

/** Distinguish doc/xls/ppt inside one CFB container by stream names. */
function cfbKind(bytes: Uint8Array): AcceptedKind | undefined {
  const text = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.byteLength, 8192)));
  if (text.includes('WordDocument')) return 'doc';
  if (text.includes('Workbook')) return 'xls';
  if (text.includes('PowerPoint Document')) return 'ppt';
  return undefined;
}

async function sniffKind(bytes: Uint8Array): Promise<SniffedFile | undefined> {
  if (bytes.byteLength < 16) return undefined;
  const ft = await fileTypeFromBuffer(bytes);
  if (ft !== undefined) {
    switch (ft.ext) {
      case 'pdf':
        return { kind: 'pdf', ext: 'pdf' };
      case 'docx':
        return { kind: 'docx', ext: 'docx' };
      case 'xlsx':
        return { kind: 'xlsx', ext: 'xlsx' };
      case 'pptx':
        return { kind: 'pptx', ext: 'pptx' };
      case 'docm':
        return { kind: 'docx', ext: 'docm' };
      case 'xlsm':
        return { kind: 'xlsx', ext: 'xlsm' };
      case 'pptm':
        return { kind: 'pptx', ext: 'pptm' };
      default:
        return undefined;
    }
  }
  if (isCfb(bytes)) {
    const k = cfbKind(bytes);
    if (k !== undefined) {
      return { kind: k, ext: k };
    }
    return undefined;
  }
  // HTML structural sniff
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 256))
    .trimStart()
    .toLowerCase();
  if (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.startsWith('<body')
  ) {
    return { kind: 'html', ext: 'html' };
  }
  return undefined;
}

/**
 * Validate an upload against a tool's accepted kinds; throws the engine
 * taxonomy's invalid-file error when it fails.
 */
export async function assertAccepted(
  bytes: Uint8Array,
  displayName: string,
  allowed: readonly AcceptedKind[],
): Promise<SniffedFile> {
  const sniffed = await sniffKind(bytes);
  if (sniffed === undefined || !allowed.includes(sniffed.kind)) {
    throw new EngineToolError(
      'invalid-file',
      `“${displayName}” is not a type this tool can process.`,
    );
  }
  return sniffed;
}
