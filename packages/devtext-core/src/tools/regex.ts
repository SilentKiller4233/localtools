/**
 * Regex tester (PROJECT_SPEC 3.4): match highlighting + group breakdown.
 * Guarded compilation — a bad pattern is invalid-input, never a crash.
 */

import { devError, requireText, assertTextCap, MAX_TEXT_CHARS } from '../types';

export interface RegexMatch {
  /** [start, end) offsets into the subject. */
  index: number;
  end: number;
  text: string;
  groups: { name?: string; number: number; text: string | undefined }[];
}

export interface RegexResult {
  matches: RegexMatch[];
  count: number;
  /** Named groups present in the pattern. */
  namedGroups: string[];
}

export function testRegex(
  pattern: string,
  subject: string,
  flags = 'g',
  maxChars: number = MAX_TEXT_CHARS,
): RegexResult {
  requireText(pattern, 'pattern');
  requireText(subject, 'test text');
  assertTextCap(subject, maxChars);
  const cleanFlags = [...new Set(flags.replace(/[^gimsuyd]/g, ''))].join('');
  let re: RegExp;
  try {
    re = new RegExp(pattern, cleanFlags.includes('g') ? cleanFlags : cleanFlags + 'g');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid pattern.';
    throw devError('invalid-input', `Invalid regular expression: ${message}`);
  }
  const namedGroups: string[] = [];
  const matches: RegexMatch[] = [];
  const zeroSeen = new Set<number>();
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(subject)) !== null) {
    guard += 1;
    if (guard > 10000) break;
    const groups: RegexMatch['groups'] = [];
    const groupNames = Object.keys(m.groups ?? {});
    for (const name of groupNames) {
      if (!namedGroups.includes(name)) namedGroups.push(name);
      groups.push({ name, number: 0, text: m.groups?.[name] });
    }
    if (m.length > 1) {
      m.slice(1).forEach((text, i) => {
        if (i >= groupNames.length) groups.push({ number: i + 1, text });
      });
    }
    matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups });
    if (m[0] === '') {
      if (zeroSeen.has(m.index)) break;
      zeroSeen.add(m.index);
      re.lastIndex += 1;
    }
  }
  return { matches, count: matches.length, namedGroups };
}
