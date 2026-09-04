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
export type AcceptedKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'doc'
  | 'xls'
  | 'ppt'
  | 'html'
  | 'video'
  | 'audio'
  | 'gif'
  | 'srt'
  | 'vtt';

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

/** Audio extensions file-type knows (flac/mp3/ogg/m4a/aac/wav etc.). */
const AUDIO_EXTS: ReadonlySet<string> = new Set([
  'mp3',
  'wav',
  'flac',
  'ogg',
  'oga',
  'aac',
  'm4a',
  'opus',
  'wma',
  'aiff',
  'aif',
  'amr',
]);

/** Video extensions file-type knows (mp4/webm/mov/mkv/avi etc.). */
const VIDEO_EXTS: ReadonlySet<string> = new Set([
  'mp4',
  'm4v',
  'webm',
  'mov',
  'mkv',
  'avi',
  'wmv',
  'flv',
  'mpg',
  'mpeg',
  '3gp',
  'ts',
]);

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
      case 'gif':
        return { kind: 'gif', ext: 'gif' };
      default:
        if (AUDIO_EXTS.has(ft.ext)) return { kind: 'audio', ext: ft.ext };
        if (VIDEO_EXTS.has(ft.ext)) return { kind: 'video', ext: ft.ext };
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
  // Subtitle structural sniff: WebVTT header or SRT cue-block shape.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 2048))
    .replace(/^\uFEFF/, '');
  if (/^WEBVTT(\s|\n|$)/m.test(head.slice(0, 64))) return { kind: 'vtt', ext: 'vtt' };
  if (/^\s*\d+\s*\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*/m.test(head)) {
    return { kind: 'srt', ext: 'srt' };
  }
  // HTML structural sniff
  const htmlHead = head.trimStart().toLowerCase();
  if (
    htmlHead.startsWith('<!doctype html') ||
    htmlHead.startsWith('<html') ||
    htmlHead.startsWith('<head') ||
    htmlHead.startsWith('<body')
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
