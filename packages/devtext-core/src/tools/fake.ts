/**
 * Fake test-data generator (PROJECT_SPEC 3.4): @faker-js/faker, clearly
 * labeled fake/test data — never real PII.
 */

import { faker } from '@faker-js/faker';
import { devError } from '../types';

export type FakeCategory = 'person' | 'address' | 'contact' | 'company' | 'lorem' | 'mixed';

export interface FakeRow {
  [key: string]: string;
}

export interface FakeDataResult {
  rows: FakeRow[];
  note: string;
}

const NOTE =
  'Generated fake data for testing — names, emails, and addresses are synthetic and do not belong to real people.';

const COLUMNS: Readonly<Record<FakeCategory, string[]>> = {
  person: ['fullName', 'firstName', 'lastName', 'jobTitle', 'gender'],
  address: ['streetAddress', 'city', 'state', 'zipCode', 'country'],
  contact: ['email', 'phoneNumber', 'username'],
  company: ['companyName', 'catchPhrase', 'bsPhrase', 'department'],
  lorem: ['sentence', 'paragraph'],
  mixed: ['fullName', 'email', 'city', 'companyName', 'phoneNumber'],
};

export function generateFakeData(
  category: FakeCategory,
  count = 10,
  seed?: number,
): FakeDataResult {
  const n = Math.max(1, Math.min(200, Math.floor(count)));
  if (!Number.isFinite(count) || count <= 0) {
    throw devError('invalid-option', 'Count must be a positive number.');
  }
  if (seed !== undefined) {
    faker.seed(seed);
  }
  const columns = COLUMNS[category];
  const rows: FakeRow[] = [];
  for (let i = 0; i < n; i++) {
    const row: FakeRow = {};
    for (const col of columns) {
      row[col] = valueFor(col);
    }
    rows.push(row);
  }
  return { rows, note: NOTE };
}

function valueFor(column: string): string {
  switch (column) {
    case 'fullName':
      return faker.person.fullName();
    case 'firstName':
      return faker.person.firstName();
    case 'lastName':
      return faker.person.lastName();
    case 'jobTitle':
      return faker.person.jobTitle();
    case 'gender':
      return faker.person.gender();
    case 'streetAddress':
      return faker.location.streetAddress();
    case 'city':
      return faker.location.city();
    case 'state':
      return faker.location.state();
    case 'zipCode':
      return faker.location.zipCode();
    case 'country':
      return faker.location.country();
    case 'email':
      return faker.internet.email();
    case 'phoneNumber':
      return faker.phone.number();
    case 'username':
      return faker.internet.username();
    case 'companyName':
      return faker.company.name();
    case 'catchPhrase':
      return faker.company.catchPhrase();
    case 'bsPhrase':
      return faker.company.buzzPhrase();
    case 'department':
      return faker.commerce.department();
    case 'sentence':
      return faker.lorem.sentence();
    case 'paragraph':
      return faker.lorem.paragraph();
    default:
      return '';
  }
}

/** CSV rendering of generated rows (hand-rolled, quoting as needed). */
export function rowsToCsv(rows: FakeRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] ?? {});
  const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}
