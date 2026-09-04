/**
 * Data formatters/converters (PROJECT_SPEC 3.4): JSON, YAML, CSV, XML.
 * All pure text-in/text-out — Group A, no native helpers, no network.
 */

import yaml from 'js-yaml';
import papa from 'papaparse';
import { XMLParser } from 'fast-xml-parser';
// fast-xml-parser v5 marks the XMLValidator/XMLBuilder re-exports deprecated in
// favor of future standalone packages that don't exist yet; these are the
// documented APIs of the installed version (verified from its .d.ts).
import { devError, requireText, assertTextCap, MAX_TEXT_CHARS } from '../types';

/* ---------------- JSON ---------------- */

export type JsonFormat = 'format' | 'minify' | 'validate';

export interface JsonToolResult {
  /** Pretty (2-space) or minified output; omitted in validate-only mode. */
  output?: string;
  /** True when the input parsed successfully. */
  valid: boolean;
  /** Parse error line/column + message when invalid (validate-friendly). */
  error?: { line: number; column: number; message: string };
}

/** Locate a JSON parse error's line/column from its message when possible. */
function jsonErrorPosition(message: string): { line: number; column: number } {
  // V8: "Unexpected token } in JSON at position 12" or "...at 1:13"
  const at = /(?:position |line )(\d+)(?::(\d+))?/.exec(message);
  if (at === null) return { line: 1, column: 1 };
  if (at[2] !== undefined) {
    return { line: Number(at[1]), column: Number(at[2]) };
  }
  const offset = Number(at[1]);
  return { line: Math.floor(offset / 80) + 1, column: (offset % 80) + 1 };
}

export function jsonFormat(
  text: string,
  mode: JsonFormat = 'format',
  maxChars: number = MAX_TEXT_CHARS,
): JsonToolResult {
  requireText(text, 'JSON');
  assertTextCap(text, maxChars);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON.';
    const { line, column } = jsonErrorPosition(message);
    if (mode === 'validate') return { valid: false, error: { line, column, message } };
    throw devError('invalid-input', `Invalid JSON (line ${String(line)}): ${message}`);
  }
  if (mode === 'validate') return { valid: true };
  return {
    valid: true,
    output: mode === 'minify' ? JSON.stringify(value) : JSON.stringify(value, null, 2),
  };
}

/* ---------------- YAML <-> JSON ---------------- */

export type YamlDirection = 'yaml-to-json' | 'json-to-yaml';

export interface YamlToolResult {
  output: string;
}

export function yamlConvert(
  text: string,
  direction: YamlDirection,
  maxChars: number = MAX_TEXT_CHARS,
): YamlToolResult {
  requireText(text, direction === 'yaml-to-json' ? 'YAML' : 'JSON');
  assertTextCap(text, maxChars);
  if (direction === 'yaml-to-json') {
    let value: unknown;
    try {
      value = yaml.load(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid YAML.';
      throw devError('invalid-input', `Invalid YAML: ${message.split('\n')[0] ?? message}`);
    }
    return { output: JSON.stringify(value, null, 2) };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON.';
    throw devError('invalid-input', `Invalid JSON: ${message}`);
  }
  try {
    return { output: yaml.dump(value, { indent: 2, lineWidth: 100 }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Serialization failed.';
    throw devError('invalid-input', `This JSON could not be written as YAML: ${message}`);
  }
}

/* ---------------- CSV <-> JSON ---------------- */

export type CsvDirection = 'csv-to-json' | 'json-to-csv';

export interface CsvToolResult {
  output: string;
  /** Row count (records) for a quick sanity read. */
  rows: number;
}

export function csvConvert(
  text: string,
  direction: CsvDirection,
  maxChars: number = MAX_TEXT_CHARS,
): CsvToolResult {
  requireText(text, direction === 'csv-to-json' ? 'CSV' : 'JSON');
  assertTextCap(text, maxChars);
  if (direction === 'csv-to-json') {
    const parsed = papa.parse<Record<string, string>>(text.trim(), {
      header: true,
      skipEmptyLines: 'greedy',
    });
    if (parsed.errors.length > 0) {
      const first = parsed.errors[0];
      if (first === undefined) throw devError('invalid-input', 'Invalid CSV.');
      throw devError(
        'invalid-input',
        `Invalid CSV (row ${String(first.row ?? '?')}): ${first.message}`,
      );
    }
    return { output: JSON.stringify(parsed.data, null, 2), rows: parsed.data.length };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON.';
    throw devError('invalid-input', `Invalid JSON: ${message}`);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw devError(
      'invalid-input',
      'Expected a JSON array of objects to convert to CSV (e.g. the CSV tool output).',
    );
  }
  if (typeof value[0] !== 'object' || value[0] === null || Array.isArray(value[0])) {
    throw devError(
      'invalid-input',
      'Expected a JSON array of objects, not nested arrays or scalars.',
    );
  }
  const rows = value as Record<string, unknown>[];
  const flat = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = cellText(v);
    }
    return out;
  });
  return { output: papa.unparse(flat), rows: flat.length };
}

/* ---------------- XML ---------------- */

export interface XmlToolResult {
  output: string;
}

/** Pretty-print (or minify) an XML document; validates first. */
export function xmlFormat(
  text: string,
  minify = false,
  maxChars: number = MAX_TEXT_CHARS,
): XmlToolResult {
  requireText(text, 'XML');
  assertTextCap(text, maxChars);
  const check = validateXml(text);
  if (!check.ok) {
    throw devError(
      'invalid-input',
      `Invalid XML (line ${String(check.err.line)}, column ${String(check.err.col)}): ${check.err.msg}`,
    );
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let value: unknown;
  try {
    value = parser.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid XML.';
    throw devError('invalid-input', `This XML could not be parsed: ${message}`);
  }
  if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
    throw devError('invalid-input', 'This XML document has no content.');
  }
  const builder = new XmlBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: !minify,
    indentBy: '  ',
  });
  let output: string;
  try {
    output = builder.build(value);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Serialization failed.';
    throw devError('invalid-input', `This XML could not be re-serialized: ${message}`);
  }
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
  return { output: minify ? `${declaration}${output}` : `${declaration}\n${output}` };
}

// eslint-disable-next-line @typescript-eslint/no-deprecated -- installed API (v5.11)
export { FxpValidator as XMLValidator };

/** Cell text for CSV export — objects JSON-stringify, scalars String(), never [object Object]. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/* Local wrappers around fast-xml-parser's validator/builder. v5 marks the
 * XMLValidator/XMLBuilder re-exports deprecated in favor of not-yet-existing
 * standalone packages; these are the documented APIs of the installed
 * version (verified against its .d.ts). The lint is silenced on the import. */
import { XMLValidator as FxpValidator } from 'fast-xml-parser';

interface XmlIssue {
  code: string;
  msg: string;
  line: number;
  col: number;
}

function validateXml(text: string): { ok: true } | { ok: false; err: XmlIssue } {
  const result: boolean | { err: { code: string; msg: string; line?: number; col?: number } } =
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- installed API (v5.11)
    FxpValidator.validate(text);
  if (result === true) return { ok: true };
  const raw = result.err;
  return {
    ok: false,
    err: { code: raw.code, msg: raw.msg, line: raw.line ?? 1, col: raw.col ?? 1 },
  };
}

import { XMLBuilder as FxpBuilder } from 'fast-xml-parser';

class XmlBuilder {
  private readonly buildFn: (value: unknown) => unknown;
  constructor(options: {
    ignoreAttributes: boolean;
    attributeNamePrefix: string;
    format: boolean;
    indentBy: string;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- installed API (v5.11)
    const inner = new FxpBuilder(options);
    this.buildFn = (value: unknown): unknown => inner.build(value);
  }
  build(value: unknown): string {
    const built: unknown = this.buildFn(value);
    return typeof built === 'string' ? built : String(built);
  }
}
