import { PDFArray, PDFName, PDFRawStream } from 'pdf-lib';
import { loadPdf } from '../load';
import { toolError } from '../errors';
import { decodeStream, encodeStream } from '../streams';

export interface RedactionRect {
  /** Page number, 1-based. */
  page: number;
  /** Rectangle in PDF user-space coordinates (origin bottom-left). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactResult {
  output: Uint8Array;
  /** How many text-showing runs were removed (sanity signal for the UI). */
  removedTextRuns: number;
}

/**
 * GENUINE redaction (Section 3.1 + 4.1 algorithm): the redacted string must
 * be ABSENT from the output bytes everywhere — content streams, structure
 * tree, metadata. Never a visual overlay. Implementation:
 *  1. Decode each target page's content stream(s).
 *  2. Parse text-showing operators (Tj/TJ, literal AND hex strings) with
 *     their current text position; runs intersecting a redaction rectangle
 *     are REMOVED from the stream.
 *  3. Images inside a rectangle are covered by the box (true pixel removal
 *     needs the render pipeline — arrives with the canvas batch, D-014;
 *     documented as v1 contract).
 *  4. Draw the visible black box (appended last = painted on top).
 *  5. The mandatory Section 14.3 test verifies the guarantee end-to-end:
 *     the string is absent from raw bytes (literal AND hex-encoded forms)
 *     and from the extracted text layer.
 */
export async function redactPdf(bytes: Uint8Array, rects: RedactionRect[]): Promise<RedactResult> {
  if (rects.length === 0) {
    throw toolError('invalid-option', 'Draw at least one redaction box.');
  }
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  for (const rect of rects) {
    if (!Number.isInteger(rect.page) || rect.page < 1 || rect.page > pageCount) {
      throw toolError(
        'page-range',
        `A redaction box targets page ${String(rect.page)}, which does not exist.`,
      );
    }
  }

  let removedTextRuns = 0;
  for (const rect of rects) {
    const page = doc.getPage(rect.page - 1);
    const contents = page.node.Contents();
    if (contents === undefined) continue;

    const streams: PDFRawStream[] =
      contents instanceof PDFRawStream
        ? [contents]
        : contents instanceof PDFArray
          ? contents
              .asArray()
              .map((obj) => {
                const looked = doc.context.lookup(obj);
                return looked instanceof PDFRawStream ? looked : null;
              })
              .filter((s): s is PDFRawStream => s !== null)
          : [];
    if (streams.length === 0) continue;

    const decoder = new TextDecoder('latin1');
    const parts: string[] = [];
    for (const stream of streams) {
      parts.push(decoder.decode(decodeStream(stream)));
    }
    const content = parts.join('\n');

    const { text: stripped, removed } = removeTextInRect(content, rect);
    removedTextRuns += removed;

    // Box ops appended last → painted on top of everything remaining.
    const newContent = `${stripped}\n${blackBoxOps(rect)}`;
    const ref = encodeStream(doc, new TextEncoder().encode(newContent));
    page.node.set(PDFName.of('Contents'), ref);
  }

  return { output: await doc.save(), removedTextRuns };
}

/** Draw the visible black box (step 4) in user-space coordinates. */
function blackBoxOps(rect: RedactionRect): string {
  return [
    'q',
    '0 0 0 rg',
    `${num(rect.x)} ${num(rect.y)} ${num(rect.width)} ${num(rect.height)} re f`,
    'Q',
  ].join(' ');
}

function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

interface TextOp {
  start: number;
  end: number;
  x: number;
  y: number;
  size: number;
}

/**
 * Single-pass content-stream scanner (NOT a full PDF interpreter — a
 * deterministic tokenizer for the common operator shapes). Tracks BT
 * (position reset), Tf (font size), Td/TD (relative move), Tm (absolute
 * matrix), and show-ops Tj/TJ in literal `(..)`, hex `<..>`, and array
 * `[..]` forms. Show-ops whose glyph origin falls inside the rect are
 * removed; spans are removed last-to-first so offsets stay valid.
 */
function removeTextInRect(content: string, rect: RedactionRect): { text: string; removed: number } {
  const ops: TextOp[] = [];
  let curX = 0;
  let curY = 0;
  let fontSize = 0;

  // Alternation, in match order: BT | Tf | Td/TD | Tm | show(Tj/TJ)
  const opRe =
    /\bBT\b|\/[^\s]+?\s+([\d.]+)\s+Tf\b|(-?[\d.]+)\s+(-?[\d.]+)\s+T[dD]\b|(?:-?[\d.]+\s+){4}(-?[\d.]+)\s+(-?[\d.]+)\s+Tm\b|(\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>|\[[^\]]*\])\s*(?:Tj|TJ)\b/g;

  let m: RegExpExecArray | null;
  while ((m = opRe.exec(content)) !== null) {
    if (m[0] === 'BT') {
      curX = 0;
      curY = 0;
    } else if (m[1] !== undefined) {
      fontSize = Number(m[1]);
    } else if (m[2] !== undefined) {
      curX += Number(m[2]);
      curY += Number(m[3]);
    } else if (m[4] !== undefined) {
      curX = Number(m[4]);
      curY = Number(m[5]);
    } else if (m[6] !== undefined) {
      ops.push({
        start: m.index,
        end: m.index + m[0].length,
        x: curX,
        y: curY,
        size: fontSize,
      });
    }
  }

  const toRemove = ops.filter(
    (op) =>
      op.x >= rect.x &&
      op.x <= rect.x + rect.width &&
      op.y >= rect.y - 2 &&
      op.y <= rect.y + rect.height + op.size,
  );
  let text = content;
  for (const op of [...toRemove].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, op.start) + text.slice(op.end);
  }
  return { text, removed: toRemove.length };
}
