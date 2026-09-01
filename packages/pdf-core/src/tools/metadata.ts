import { loadPdf } from '../load';
import { ToolError } from '../errors';

/** Subset of doc-info fields LocalTools exposes (Section 3.1 "Edit metadata"). */
export interface MetadataInput {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  /** Producer is forced to LocalTools on save regardless; this sets Creator. */
  creator?: string;
}

const MAX_FIELD = 2000;

function clean(value: string, field: string): string {
  if (value.length > MAX_FIELD) {
    throw new ToolError(
      'invalid-option',
      `${field} is too long (max ${String(MAX_FIELD)} characters).`,
    );
  }
  // Strip control characters except tab/newline/CR; PDF strings must not
  // carry arbitrary control bytes.
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

/**
 * Read + write document metadata (Section 3.1). Setting a field to a value
 * writes it; fields left undefined are preserved. Passing an empty string
 * clears the field explicitly.
 */
export async function editMetadata(bytes: Uint8Array, input: MetadataInput): Promise<Uint8Array> {
  const fields = Object.keys(input) as (keyof MetadataInput)[];
  if (fields.length === 0) {
    throw new ToolError('invalid-option', 'No metadata fields to change.');
  }
  const doc = await loadPdf(bytes);
  for (const key of fields) {
    const raw = input[key];
    if (raw === undefined) continue;
    const value = clean(raw, key);
    switch (key) {
      case 'title':
        doc.setTitle(value);
        break;
      case 'author':
        doc.setAuthor(value);
        break;
      case 'subject':
        doc.setSubject(value);
        break;
      case 'keywords':
        doc.setKeywords(
          value === ''
            ? []
            : value
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter((s) => s !== ''),
        );
        break;
      case 'creator':
        doc.setCreator(value);
        break;
    }
  }
  doc.setProducer('LocalTools');
  return doc.save();
}

export async function readMetadata(bytes: Uint8Array): Promise<MetadataInput & { raw: unknown }> {
  const doc = await loadPdf(bytes);
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    raw: doc.context.lookup(doc.context.trailerInfo.Info),
  };
}
