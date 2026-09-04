import { describe, expect, it } from 'vitest';
import { minifyCode, beautifyCode } from '../src/tools/minify';
import { markdownToHtml, htmlToMarkdown, markdownToPdf } from '../src/tools/markdown';
import { expectDevError, fixtureText, OVERSIZED_TEXT } from './helpers';
import { PDFDocument } from 'pdf-lib';

describe('minifier-beautifier — Section 14.1', () => {
  it('happy: CSS minify shrinks and keeps rules', async () => {
    const r = await minifyCode('.a { color: #ff0000; margin: 0px 0px; }', 'css');
    expect(r.newSize).toBeLessThan(r.originalSize);
    expect(r.output).toContain('color:red');
  });

  it('happy: JS minify compresses (terser)', async () => {
    const r = await minifyCode('const add = (a, b) => { return a + b; };', 'js');
    expect(r.output).not.toContain('return');
    expect(r.output).toContain('add');
  });

  it('happy: HTML minify collapses whitespace + comments', async () => {
    const r = await minifyCode('<div>  <p>hi</p>  <!-- bye -->\n</div>', 'html');
    expect(r.output).not.toContain('<!--');
    expect(r.output).toBe('<div><p>hi</p></div>');
  });

  it('happy: beautify round-trips minified CSS (prettier)', async () => {
    const min = await minifyCode('.a{color:red;margin:0}', 'css');
    const pretty = await beautifyCode(min.output, 'css');
    expect(pretty.output).toContain('\n  color: red;');
  });

  it('malformed: invalid JS → invalid-input', async () => {
    await expectDevError(minifyCode('function {{{', 'js'), 'invalid-input');
  });

  it('empty → empty-input', async () => {
    await expectDevError(minifyCode('', 'css'), 'empty-input');
    await expectDevError(beautifyCode('', 'js'), 'empty-input');
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(minifyCode('.a{}', 'css', 2), 'size-limit');
  });
});

describe('markdown-converter — Section 14.1', () => {
  it('happy: Markdown → HTML renders headings/emphasis/lists', () => {
    const r = markdownToHtml(fixtureText('sample.md'));
    expect(r.html).toContain('<h1>LocalTools</h1>');
    expect(r.html).toContain('<strong>works</strong>');
    expect(r.html).toContain('<li>one</li>');
    expect(r.html).toContain('class="language-ts"');
    expect(r.html).toContain('const ok = true;');
  });

  it('happy: HTML → Markdown keeps structure', () => {
    const r = htmlToMarkdown(
      '<h1>Title</h1>\n<p>Hello <strong>world</strong></p>\n<ul><li>a</li><li>b</li></ul>',
    );
    expect(r.markdown).toContain('# Title');
    expect(r.markdown).toContain('**world**');
    expect(r.markdown).toContain('- a');
    expect(r.markdown).toContain('- b');
  });

  it('happy: md → html → md round-trip keeps the words', () => {
    const md = fixtureText('sample.md');
    const html = markdownToHtml(md).html;
    const back = htmlToMarkdown(html).markdown;
    expect(back).toContain('# LocalTools');
    expect(back).toContain('**works**');
  });

  it('happy: GFM tables survive', () => {
    const html = markdownToHtml('| a | b |\n| --- | --- |\n| 1 | 2 |').html;
    expect(html).toContain('<table>');
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => markdownToHtml('')),
      'empty-input',
    );
    await expectDevError(
      Promise.resolve().then(() => htmlToMarkdown('')),
      'empty-input',
    );
  });

  it('malformed: HTML with no expressible content → empty-input (comments are not content)', async () => {
    await expectDevError(
      Promise.resolve().then(() => htmlToMarkdown('<!-- only a comment -->')),
      'empty-input',
    );
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(
      Promise.resolve().then(() => markdownToHtml('# x', 2)),
      'size-limit',
    );
  });
});

describe('markdown-to-pdf — Section 14.1', () => {
  it('happy: renders a parseable multi-page PDF', async () => {
    const md = [
      '# Big Title',
      'Paragraph one with words.',
      '',
      '- bullet A',
      '- bullet B',
      '',
      '```',
      'code line',
      '```',
    ].join('\n');
    const bytes = await markdownToPdf(md);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it('happy: long content paginates', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 80; i += 1)
      lines.push(
        `Paragraph ${String(i)} with some content that wraps around the page width eventually maybe.`,
      );
    const bytes = await markdownToPdf(lines.join('\n\n'));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('empty → empty-input', async () => {
    await expectDevError(markdownToPdf(''), 'empty-input');
  });

  it('oversized (seam) → size-limit', async () => {
    await expectDevError(markdownToPdf('# x', {}, 2), 'size-limit');
  });

  it('default-cap oversized → size-limit', async () => {
    await expectDevError(markdownToPdf(OVERSIZED_TEXT), 'size-limit');
  });
});
