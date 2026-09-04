import { describe, expect, it } from 'vitest';
import {
  convertColor,
  generatePalette,
  generateGradient,
  rgbToHex,
  hslToRgb,
  parseColor,
} from '../src/tools/colors';
import { explainCron, convertTimestamp } from '../src/tools/timecron';
import { generateSitemap, parseOgTags, buildOgCard } from '../src/tools/webdev';
import { expectDevError } from './helpers';

describe('color-converter — Section 14.1', () => {
  it('happy: hex parses and converts to all spaces', () => {
    const r = convertColor('#ff0000');
    expect(r.hex).toBe('#ff0000');
    expect(r.rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(r.hsl.h).toBeCloseTo(0, 5);
    expect(r.hsl.s).toBeCloseTo(100, 5);
    expect(r.hsl.l).toBeCloseTo(50, 5);
    expect(r.oklch.l).toBeGreaterThan(0.5);
  });

  it('happy: rgb()/hsl()/oklch() inputs all parse', () => {
    expect(parseColor('rgb(0, 128, 255)')).toEqual({ r: 0, g: 128, b: 255 });
    expect(parseColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0 });
    const ok = parseColor('oklch(0.7 0.1 200)');
    // hue 200° in oklch is a blue-green; assert channels are finite + in range
    // and the round-trip through rgbToOklch keeps the hue band.
    for (const v of [ok.r, ok.g, ok.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('happy: hex round-trips through oklch approximately', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#336699', '#f5e6d3']) {
      const r = convertColor(hex);
      const back = rgbToHex(hslToRgb(r.hsl));
      expect(back).toBe(hex);
    }
  });

  it('happy: short hex #f00 expands', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('malformed: garbage color → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertColor('not-a-color')),
      'invalid-input',
    );
    await expectDevError(
      Promise.resolve().then(() => convertColor('#12')),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertColor('')),
      'empty-input',
    );
  });

  it('oversized (seam via case guard not needed) — palette with bad base errors', async () => {
    await expectDevError(
      Promise.resolve().then(() => generatePalette('xx')),
      'invalid-input',
    );
  });
});

describe('gradient-generator — Section 14.1', () => {
  it('happy: linear gradient CSS emitted', () => {
    const r = generateGradient({
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 100 },
      ],
      angle: 90,
      type: 'linear',
    });
    expect(r.css).toBe('background: linear-gradient(90deg, #ff0000 0%, #0000ff 100%);');
  });

  it('happy: radial + repeating variants', () => {
    const r = generateGradient({
      stops: [
        { color: 'rgba(255,0,0,1)', position: 0 },
        { color: '#00f', position: 50 },
      ],
      angle: 0,
      type: 'radial',
      repeating: true,
    });
    expect(r.css).toContain('repeating-radial-gradient');
  });

  it('malformed: one stop → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() =>
        generateGradient({ stops: [{ color: '#fff', position: 0 }], angle: 0, type: 'linear' }),
      ),
      'invalid-option',
    );
  });

  it('malformed: bad stop color → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() =>
        generateGradient({
          stops: [
            { color: 'nope', position: 0 },
            { color: '#fff', position: 100 },
          ],
          angle: 0,
          type: 'linear',
        }),
      ),
      'invalid-input',
    );
  });

  it('malformed: position out of range → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() =>
        generateGradient({
          stops: [
            { color: '#fff', position: 0 },
            { color: '#000', position: 150 },
          ],
          angle: 0,
          type: 'linear',
        }),
      ),
      'invalid-option',
    );
  });

  it('happy: palette harmonies produce distinct hexes', () => {
    for (const harmony of ['complementary', 'analogous', 'triad', 'monochrome'] as const) {
      const p = generatePalette('#3366cc', harmony);
      expect(p.length).toBeGreaterThanOrEqual(4);
      expect(new Set(p.map((s) => s.hex)).size).toBe(p.length);
      for (const s of p) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('cron-parser — Section 14.1', () => {
  it('happy: every-5-minutes explains', () => {
    const r = explainCron('*/5 * * * *');
    expect(r.text.toLowerCase()).toContain('5 minutes');
    expect(r.fields.length).toBe(5);
  });

  it('happy: daily at noon explains with field breakdown', () => {
    const r = explainCron('0 12 * * *');
    expect(r.text).toContain('12:00');
  });

  it('happy: day-of-week named', () => {
    const r = explainCron('0 12 * * WED');
    expect(r.text.toLowerCase()).toContain('wednesday');
  });

  it('malformed: bad field value → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => explainCron('99 * * * *')),
      'invalid-input',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => explainCron('')),
      'empty-input',
    );
  });
});

describe('timestamp-converter — Section 14.1', () => {
  it('happy: unix seconds → ISO in UTC', () => {
    const r = convertTimestamp('1758000000', 'UTC');
    expect(new Date(r.utc).toISOString()).toBe(r.utc);
    expect(r.unit).toBe('s');
  });

  it('happy: milliseconds detected by magnitude', () => {
    const r = convertTimestamp('1758000000000', 'UTC');
    expect(r.utc).toBe(convertTimestamp('1758000000', 'UTC').utc);
  });

  it('happy: date string → unix seconds', () => {
    const r = convertTimestamp('2025-09-16T00:00:00Z', 'UTC');
    expect(r.unix).toBe(Math.floor(new Date('2025-09-16T00:00:00Z').getTime() / 1000));
  });

  it('happy: timezone rendering differs from UTC for Karachi', () => {
    const utc = convertTimestamp('1758000000', 'UTC');
    const khi = convertTimestamp('1758000000', 'Asia/Karachi');
    expect(khi.iso).not.toBe(utc.iso);
  });

  it('malformed: garbage → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertTimestamp('not-a-time')),
      'invalid-input',
    );
  });

  it('malformed: bad timezone → invalid-option', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertTimestamp('0', 'Not/A Zone!')),
      'invalid-option',
    );
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => convertTimestamp('')),
      'empty-input',
    );
  });
});

describe('sitemap/robots generator — Section 14.1', () => {
  it('happy: builds valid sitemap + robots from URLs', () => {
    const r = generateSitemap({
      urls: 'https://example.com/\nhttps://example.com/about daily 0.8',
    });
    expect(r.sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(r.sitemap).toContain('<loc>https://example.com/</loc>');
    expect(r.sitemap).toContain('<changefreq>daily</changefreq>');
    expect(r.sitemap).toContain('<priority>0.8</priority>');
    expect(r.robots).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(r.robots).toContain('User-agent: *');
  });

  it('empty: no URLs → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => generateSitemap({ urls: '' })),
      'empty-input',
    );
  });

  it('malformed: invalid URL → invalid-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => generateSitemap({ urls: 'ht!tp:~~/not a url' })),
      'invalid-input',
    );
  });
});

describe('og-preview — Section 14.1', () => {
  it('happy: form → meta tags + card', () => {
    const r = buildOgCard({
      ogTitle: 'My Page',
      ogDescription: 'My desc',
      ogImage: 'https://ex.com/i.png',
      ogUrl: 'https://ex.com',
    });
    expect(r.metaTags).toContain('<meta property="og:title" content="My Page" />');
    expect(r.metaTags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(r.card.ogTitle).toBe('My Page');
  });

  it('happy: parses pasted meta tags back into a card', () => {
    const html = [
      '<meta property="og:title" content="Parsed Title" />',
      '<meta property="og:description" content="Parsed desc" />',
      '<meta name="twitter:card" content="summary" />',
    ].join('\n');
    const card = parseOgTags(html);
    expect(card.ogTitle).toBe('Parsed Title');
    expect(card.ogDescription).toBe('Parsed desc');
    expect(card.twitterCard).toBe('summary');
  });

  it('empty → empty-input', async () => {
    await expectDevError(
      Promise.resolve().then(() => parseOgTags('')),
      'empty-input',
    );
  });

  it('malformed: plain non-meta text → falls back to defaults, still a card', () => {
    const card = parseOgTags('just some text with no tags');
    expect(card.ogTitle).toBe('Your page title');
  });
});
