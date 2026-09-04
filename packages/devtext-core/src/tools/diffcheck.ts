/**
 * Text diff checker (PROJECT_SPEC 3.4): reuses the diff library already in
 * the PDF suite's Compare tool (spec: "reuses the diff library").
 */

import { diffLines } from 'diff';
import { devError } from '../types';
import { MAX_TEXT_CHARS } from '../types';

export interface DiffChange {
  kind: 'added' | 'removed' | 'same';
  text: string;
}

export interface DiffResult {
  changes: DiffChange[];
  identical: boolean;
  /** +-prefixed unified-style patch, same shape as the PDF Compare tool. */
  patch: string;
  added: number;
  removed: number;
}

export function diffTexts(a: string, b: string, maxChars: number = MAX_TEXT_CHARS): DiffResult {
  if (a.length === 0 && b.length === 0) {
    throw devError('no-inputs', 'Paste text into both sides first.');
  }
  if (a.length > maxChars || b.length > maxChars) {
    throw devError('size-limit', 'One of the texts exceeds the size cap.');
  }
  const changes = diffLines(a, b);
  const out: DiffChange[] = [];
  const patch: string[] = [];
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    const kind: DiffChange['kind'] = c.added ? 'added' : c.removed ? 'removed' : 'same';
    out.push({ kind, text: c.value });
    const lines = c.value.replace(/\n$/, '').split('\n');
    if (kind === 'added') {
      added += lines.length;
      for (const line of lines) patch.push(`+ ${line}`);
    } else if (kind === 'removed') {
      removed += lines.length;
      for (const line of lines) patch.push(`- ${line}`);
    }
  }
  return {
    changes: out,
    identical: added === 0 && removed === 0,
    patch: patch.join('\n'),
    added,
    removed,
  };
}
