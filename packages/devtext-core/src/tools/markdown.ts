/**
 * Markdown tools (PROJECT_SPEC 3.4): Markdown → HTML (marked), HTML →
 * Markdown (in-house serializer over htmlparser2's DOM — turndown needs a
 * browser DOM, rejected for Node/Worker parity), Markdown → PDF reusing
 * the PDF suite's pdf-lib typesetting approach.
 */

import { marked } from 'marked';
import * as htmlparser2 from 'htmlparser2';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { devError, requireText, assertTextCap, MAX_TEXT_CHARS } from '../types';

/* ---------------- Markdown -> HTML ---------------- */

marked.use({ gfm: true, breaks: false });

export function markdownToHtml(text: string, maxChars: number = MAX_TEXT_CHARS): { html: string } {
  requireText(text, 'Markdown');
  assertTextCap(text, maxChars);
  return { html: marked.parse(text, { async: false }) };
}

/* ---------------- HTML -> Markdown (in-house serializer) ---------------- */

type Node = {
  type: string;
  name?: string;
  data?: string;
  children?: Node[];
  attribs?: Record<string, string>;
};

const BLOCK_TEXT = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'td',
  'th',
  'pre',
  'div',
  'br',
  'hr',
]);

function textOf(node: Node): string {
  if (node.type === 'text') return node.data ?? '';
  if (node.children === undefined) return '';
  return node.children.map(textOf).join('');
}

function inlineOf(nodes: Node[] | undefined): string {
  if (nodes === undefined) return '';
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        out += (node.data ?? '').replace(/\s+/g, ' ');
        break;
      }
      case 'tag': {
        const name = node.name ?? '';
        switch (name) {
          case 'br':
            out += '\n';
            break;
          case 'strong':
          case 'b':
            out += `**${inlineOf(node.children).trim()}**`;
            break;
          case 'em':
          case 'i':
            out += `*${inlineOf(node.children).trim()}*`;
            break;
          case 'code':
            out += `\`${textOf(node)}\``;
            break;
          case 'a': {
            const href = node.attribs?.href ?? '';
            out += `[${inlineOf(node.children).trim()}](${href})`;
            break;
          }
          case 'img': {
            const src = node.attribs?.src ?? '';
            const alt = node.attribs?.alt ?? '';
            out += `![${alt}](${src})`;
            break;
          }
          default:
            out += inlineOf(node.children);
        }
        break;
      }
      default:
        break;
    }
  }
  return out.replace(/ {2,}/g, ' ');
}

function blocksOf(nodes: Node[] | undefined, depth = 0, listOrdered: boolean[] = []): string {
  if (nodes === undefined) return '';
  const out: string[] = [];
  const indent = '  '.repeat(depth);
  for (const node of nodes) {
    if (node.type === 'text') {
      const t = (node.data ?? '').trim();
      if (t.length > 0) out.push(t);
      continue;
    }
    if (node.type !== 'tag') continue;
    const name = node.name ?? '';
    switch (name) {
      case 'h1':
        out.push(`# ${inlineOf(node.children).trim()}`);
        break;
      case 'h2':
        out.push(`## ${inlineOf(node.children).trim()}`);
        break;
      case 'h3':
        out.push(`### ${inlineOf(node.children).trim()}`);
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        out.push(`#### ${inlineOf(node.children).trim()}`);
        break;
      case 'p':
        out.push(inlineOf(node.children).trim());
        break;
      case 'hr':
        out.push('---');
        break;
      case 'br':
        out.push('');
        break;
      case 'blockquote': {
        const inner = blocksOf(node.children).trim();
        out.push(
          inner
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'),
        );
        break;
      }
      case 'pre': {
        const code = textOf(node).replace(/\n$/, '');
        out.push('```\n' + code + '\n```');
        break;
      }
      case 'code':
        out.push(`\`${textOf(node)}\``);
        break;
      case 'ul':
        out.push(blocksOf(node.children, depth, [...listOrdered, false]));
        break;
      case 'ol':
        out.push(blocksOf(node.children, depth, [...listOrdered, true]));
        break;
      case 'li': {
        const marker = listOrdered[listOrdered.length - 1] === true ? '1.' : '-';
        const inner = inlineOf(node.children).trim();
        out.push(`${indent}${marker} ${inner}`);
        // nested lists inside an li
        for (const child of node.children ?? []) {
          if (child.type === 'tag' && (child.name === 'ul' || child.name === 'ol')) {
            out.push(blocksOf([child], depth + 1, listOrdered));
          }
        }
        break;
      }
      case 'table': {
        const rows = collectRows(node);
        if (rows.length > 0) {
          const header = rows[0] ?? [];
          out.push(`| ${header.join(' | ')} |`);
          out.push(`| ${header.map(() => '---').join(' | ')} |`);
          for (const row of rows.slice(1)) out.push(`| ${row.join(' | ')} |`);
        }
        break;
      }
      default: {
        // Unknown/blockish containers: recurse block-level
        const hasBlock = (node.children ?? []).some(
          (c) => c.type === 'tag' && BLOCK_TEXT.has(c.name ?? ''),
        );
        out.push(hasBlock ? blocksOf(node.children, depth, listOrdered) : inlineOf([node]).trim());
      }
    }
  }
  return out.filter((l) => l.length > 0).join('\n\n');
}

function collectRows(table: Node): string[][] {
  const rows: string[][] = [];
  const walk = (nodes: Node[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.type !== 'tag') continue;
      if (node.name === 'tr') {
        const cells = (node.children ?? [])
          .filter((c) => c.type === 'tag' && (c.name === 'td' || c.name === 'th'))
          .map((c) => inlineOf(c.children).trim());
        rows.push(cells);
      } else {
        walk(node.children);
      }
    }
  };
  walk(table.children);
  return rows;
}

export function htmlToMarkdown(
  html: string,
  maxChars: number = MAX_TEXT_CHARS,
): { markdown: string } {
  requireText(html, 'HTML');
  assertTextCap(html, maxChars);
  const dom = htmlparser2.parseDocument(html);
  const hasTags = dom.children.some((c) => (c as Node).type === 'tag');
  if (!hasTags) {
    // No elements: fall back to plain text — but comments are not content.
    const text = html.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (text.length === 0) {
      throw devError('empty-input', 'No HTML content was supplied.');
    }
    return { markdown: text };
  }
  const markdown = blocksOf(dom.children);
  if (markdown.trim().length === 0) {
    throw devError('invalid-input', 'This HTML has no Markdown-expressible content.');
  }
  return { markdown };
}

/* ---------------- Markdown -> PDF ---------------- */

export interface MarkdownPdfOptions {
  /** Base font size in pt. */
  fontSize?: number;
  /** Page size: a4 or letter. */
  pageSize?: 'a4' | 'letter';
  /** Top margin in pt. */
  marginTop?: number;
}

interface Line {
  text: string;
  style: 'body' | 'h1' | 'h2' | 'h3' | 'code';
  bullet?: boolean;
}

const PAGE_SIZES: Readonly<Record<'a4' | 'letter', [number, number]>> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/** Sanitize to WinAnsi — the 14 standard fonts cannot embed arbitrary Unicode. */
function winAnsi(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E]/g, '');
}

export async function markdownToPdf(
  text: string,
  options: MarkdownPdfOptions = {},
  maxChars: number = MAX_TEXT_CHARS,
): Promise<Uint8Array> {
  requireText(text, 'Markdown');
  assertTextCap(text, maxChars);
  const pageSize = options.pageSize ?? 'a4';
  const [pw, ph] = PAGE_SIZES[pageSize];
  const fontSize = options.fontSize ?? 11;
  const marginTop = options.marginTop ?? 56;
  const marginX = 56;

  const doc = await PDFDocument.create();
  doc.setTitle('LocalTools Markdown Export');
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const lines: Line[] = [];
  let inCode = false;
  for (const raw of text.split(/\r?\n/)) {
    if (/^```/.test(raw.trim())) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      lines.push({ text: raw, style: 'code' });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(raw);
    if (heading !== null) {
      const level = heading[1]?.length ?? 1;
      lines.push({ text: heading[2] ?? '', style: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3' });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(raw);
    if (bullet !== null) {
      lines.push({ text: bullet[1] ?? '', style: 'body', bullet: true });
      continue;
    }
    lines.push({ text: raw, style: 'body' });
  }

  const fontFor = (style: Line['style']): PDFFont =>
    style === 'code' ? body : style === 'body' ? body : bold;
  const sizeFor = (style: Line['style']): number =>
    style === 'h1'
      ? fontSize * 2
      : style === 'h2'
        ? fontSize * 1.5
        : style === 'h3'
          ? fontSize * 1.25
          : fontSize;

  function wrap(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
    bulletPad: number,
  ): string[] {
    const usable = maxWidth - bulletPad;
    if (text.length === 0) return [''];
    const words = text.split(/\s+/);
    const outLines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      try {
        if (font.widthOfTextAtSize(candidate, size) <= usable) {
          current = candidate;
        } else {
          if (current.length > 0) outLines.push(current);
          current = word;
        }
      } catch {
        current = candidate;
      }
    }
    if (current.length > 0) outLines.push(current);
    return outLines.length > 0 ? outLines : [''];
  }

  let page: PDFPage = doc.addPage([pw, ph]);
  let y = ph - marginTop;
  const advance = (lineHeight: number): void => {
    y -= lineHeight;
    if (y < marginTop) {
      page = doc.addPage([pw, ph]);
      y = ph - marginTop;
    }
  };

  for (const line of lines) {
    const font = fontFor(line.style);
    const size = sizeFor(line.style);
    const leading = size * 1.45;
    if (line.text.length === 0) {
      advance(size * 0.6); // paragraph gap
      continue;
    }
    const bulletPad = line.bullet === true ? 16 : 0;
    const wrapped = wrap(winAnsi(line.text), font, size, pw - marginX * 2, bulletPad);
    wrapped.forEach((segment, i) => {
      advance(leading);
      const prefix = line.bullet === true && i === 0 ? '- ' : '';
      const text = `${prefix}${segment}`;
      try {
        page.drawText(text, { x: marginX + bulletPad, y, size, font, color: rgb(0.1, 0.12, 0.16) });
      } catch {
        // Unmeasurable glyph post-sanitize — skip (best effort).
      }
    });
  }

  if (doc.getPageCount() === 0) {
    throw devError('invalid-input', 'This Markdown produced an empty document.');
  }
  return await doc.save();
}
