/**
 * Time tools (PROJECT_SPEC 3.4): cron expression explainer (cronstrue) and
 * Unix timestamp ↔ human date converter with timezone handling.
 */

import cronstrue from 'cronstrue';
import { devError, requireText } from '../types';

/* ---------------- Cron ---------------- */

export interface CronResult {
  /** Human-readable description of the schedule. */
  text: string;
  /** The 5 (or 6, if seconds-leading) fields, labeled. */
  fields: { label: string; value: string }[];
}

const FIELD_LABELS = ['minute', 'hour', 'day of month', 'month', 'day of week'] as const;

export function explainCron(expression: string): CronResult {
  requireText(expression, 'cron expression');
  const cleaned = expression.trim().replace(/\s+/g, ' ');
  const parts = cleaned.split(' ');
  const isSix = /^\d|\*\/\d/.test(parts[0] ?? '') && parts.length === 6;
  const expr = isSix ? cleaned : cleaned;
  try {
    const text = cronstrue.toString(expr, { throwExceptionOnParseError: true });
    const labels = isSix ? ['second', ...FIELD_LABELS] : FIELD_LABELS;
    const fields = parts.slice(0, labels.length).map((value, i) => ({
      label: labels[i] ?? `field ${String(i + 1)}`,
      value,
    }));
    return { text, fields };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid cron expression.';
    throw devError('invalid-input', message);
  }
}

/* ---------------- Timestamps ---------------- */

export interface TimestampResult {
  /** ISO string in the target timezone. */
  iso: string;
  /** Readable local rendering. */
  human: string;
  /** Unix seconds (or ms, depending on input). */
  unix: number;
  unit: 's' | 'ms';
  /** Extra quick-reference fields. */
  utc: string;
  relative: string;
}

const TZ_RE = /^[A-Za-z_/][A-Za-z0-9_/+-]*$/;

/**
 * Convert a timestamp OR a date string. `input` may be:
 * - digits (auto-detected s vs ms by magnitude)
 * - an ISO/other date string parseable by Date
 * `timezone` must be an IANA name (UTC default).
 */
export function convertTimestamp(input: string, timezone = 'UTC'): TimestampResult {
  requireText(input, 'timestamp or date');
  if (!TZ_RE.test(timezone)) {
    throw devError('invalid-option', `“${timezone}” is not a valid timezone identifier.`);
  }
  const trimmed = input.trim();
  let date: Date;
  if (/^-?\d{1,15}$/.test(trimmed)) {
    const num = Number(trimmed);
    // ms timestamps are > ~1e12 (2001); seconds are below (until year ~33658)
    const secondsShaped = /^-?\d{1,10}$/.test(trimmed);
    const value = secondsShaped ? num * 1000 : num;
    date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw devError('invalid-input', 'This timestamp is out of range.');
    }
    const unit: 's' | 'ms' = /^-?\d{1,10}$/.test(trimmed) ? 's' : 'ms';
    return buildResult(date, unit, timezone);
  }
  date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw devError(
      'invalid-input',
      'This could not be read as a timestamp or date. Try digits (unix time) or an ISO date string.',
    );
  }
  return buildResult(date, 's', timezone, true);
}

function buildResult(
  date: Date,
  unit: 's' | 'ms',
  timezone: string,
  fromDateString = false,
): TimestampResult {
  let iso: string;
  try {
    iso = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    throw devError('invalid-option', `“${timezone}” is not a valid timezone identifier.`);
  }
  const unix = fromDateString
    ? Math.floor(date.getTime() / 1000)
    : unit === 's'
      ? Math.floor(date.getTime() / 1000)
      : date.getTime();
  return {
    iso: iso.replace(',', ''),
    human: iso.replace(',', ''),
    unix,
    unit: 's',
    utc: date.toISOString(),
    relative: relativeTime(date),
  };
}

function relativeTime(date: Date): string {
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [1000, 'second'],
    [60_000, 'minute'],
    [3_600_000, 'hour'],
    [86_400_000, 'day'],
  ];
  let label = 'just now';
  if (abs > 86_400_000 * 365) {
    label = `${String(Math.round(abs / (86_400_000 * 365)))} years`;
  } else if (abs > 86_400_000 * 30) {
    label = `${String(Math.round(abs / (86_400_000 * 30)))} months`;
  } else {
    for (let i = units.length - 1; i >= 0; i--) {
      const [ms, name] = units[i] ?? [1000, 'second'];
      if (abs >= ms) {
        const n = Math.round(abs / ms);
        label = `${String(n)} ${name}${n === 1 ? '' : 's'}`;
        break;
      }
    }
  }
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}
