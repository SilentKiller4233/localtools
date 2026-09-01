import { PDFDict, PDFName, PDFString } from 'pdf-lib';
import type { PDFRef } from 'pdf-lib';
import { loadPdf } from '../load';
import { toolError } from '../errors';

export interface BookmarkEntry {
  title: string;
  /** 1-based target page. */
  page: number;
  children?: BookmarkEntry[];
}

/**
 * Bookmarks/TOC editor (Section 3.1): writes a nested outline tree. Built on
 * pdf-lib's low-level object API — pdf-lib has no high-level outline API
 * (verified against 1.17.1 typings) — constructing the /Outlines object
 * graph directly per PDF 32000-1 §12.3, then linking it into the catalog
 * with /PageMode /UseOutlines so viewers open the bookmarks panel.
 */
export async function setBookmarks(
  bytes: Uint8Array,
  entries: BookmarkEntry[],
): Promise<Uint8Array> {
  if (entries.length === 0) {
    throw toolError('invalid-option', 'Provide at least one bookmark.');
  }
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  validateEntries(entries, pageCount);

  const context = doc.context;
  const outlinesRef = context.nextRef();

  interface Node {
    ref: PDFRef;
    dict: PDFDict;
  }

  const buildNodes = (list: BookmarkEntry[]): Node[] => {
    const nodes: Node[] = [];
    for (const entry of list) {
      const ref = context.nextRef();
      const children = entry.children === undefined ? [] : buildNodes(entry.children);
      const page = doc.getPage(entry.page - 1);
      const dict = context.obj({
        Type: 'Item',
        // PDFString — context.obj() maps bare strings to PDFName (/Start),
        // and outline titles MUST be strings, not names (32000-1 §12.3.2.2).
        Title: PDFString.of(entry.title),
        Parent: outlinesRef,
        Dest: [page.ref, 'Fit'],
      });
      if (children.length > 0) {
        const first = children[0];
        const last = children[children.length - 1];
        if (first !== undefined && last !== undefined) {
          dict.set(PDFName.of('First'), first.ref);
          dict.set(PDFName.of('Last'), last.ref);
          dict.set(PDFName.of('Count'), context.obj(children.length));
        }
      }
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        const prev = children[i - 1];
        const next = children[i + 1];
        if (child === undefined) continue;
        if (prev !== undefined) child.dict.set(PDFName.of('Prev'), prev.ref);
        if (next !== undefined) child.dict.set(PDFName.of('Next'), next.ref);
      }
      context.assign(ref, dict);
      nodes.push({ ref, dict });
    }
    return nodes;
  };

  const topNodes = buildNodes(entries);
  for (let i = 0; i < topNodes.length; i += 1) {
    const node = topNodes[i];
    const prev = topNodes[i - 1];
    const next = topNodes[i + 1];
    if (node === undefined) continue;
    if (prev !== undefined) node.dict.set(PDFName.of('Prev'), prev.ref);
    if (next !== undefined) node.dict.set(PDFName.of('Next'), next.ref);
  }

  const outlinesDict = context.obj({
    Type: 'Outlines',
    First: topNodes[0]?.ref,
    Last: topNodes[topNodes.length - 1]?.ref,
    Count: topNodes.length,
  });
  context.assign(outlinesRef, outlinesDict);
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), context.obj('UseOutlines'));

  return doc.save();
}

function validateEntries(entries: BookmarkEntry[], pageCount: number): void {
  for (const entry of entries) {
    if (entry.title.trim() === '') {
      throw toolError('invalid-option', 'Every bookmark needs a title.');
    }
    if (!Number.isInteger(entry.page) || entry.page < 1 || entry.page > pageCount) {
      throw toolError(
        'page-range',
        `Bookmark "${entry.title}" points at page ${String(entry.page)}, which does not exist in this ${String(pageCount)}-page document.`,
      );
    }
    if (entry.children !== undefined) validateEntries(entry.children, pageCount);
  }
}

/**
 * Read the existing outline as BookmarkEntry[] (null when the document has
 * no outline). Best-effort: titles + target pages, nesting via /First walks.
 */
export async function readBookmarks(bytes: Uint8Array): Promise<BookmarkEntry[] | null> {
  const doc = await loadPdf(bytes);
  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines === undefined) return null;
  const pages = doc.getPages();

  const pageOfDest = (dict: PDFDict): number => {
    try {
      const dest = dict.lookup(PDFName.of('Dest'));
      if (Array.isArray(dest)) {
        const pageRef = dest[0] as { toString(): string } | undefined;
        if (pageRef !== undefined) {
          const idx = pages.findIndex((p) => p.ref.toString() === pageRef.toString());
          if (idx >= 0) return idx + 1;
        }
      }
    } catch {
      // Unreadable dest falls back to page 1.
    }
    return 1;
  };

  const walk = (dict: PDFDict): BookmarkEntry => {
    const titleObj = dict.lookup(PDFName.of('Title'));
    // PDFString.asString() gives the raw title; strip PDFName-slash form too
    // (defensive for foreign outlines that used a name).
    const title =
      titleObj
        ?.toString()
        .replace(/^\//, '')
        .replace(/^\(|\)$/g, '') ?? '';
    const entry: BookmarkEntry = { title, page: pageOfDest(dict) };
    const childDict = dict.lookupMaybe(PDFName.of('First'), PDFDict);
    if (childDict !== undefined) {
      const children: BookmarkEntry[] = [walk(childDict)];
      let next = childDict.lookupMaybe(PDFName.of('Next'), PDFDict);
      while (next !== undefined) {
        children.push(walk(next));
        next = next.lookupMaybe(PDFName.of('Next'), PDFDict);
      }
      entry.children = children;
    }
    return entry;
  };

  const first = outlines.lookupMaybe(PDFName.of('First'), PDFDict);
  if (first === undefined) return [];
  const out: BookmarkEntry[] = [walk(first)];
  let next = first.lookupMaybe(PDFName.of('Next'), PDFDict);
  while (next !== undefined) {
    out.push(walk(next));
    next = next.lookupMaybe(PDFName.of('Next'), PDFDict);
  }
  return out;
}
