/**
 * Web-dev QoL generators (PROJECT_SPEC 3.4): sitemap.xml + robots.txt
 * (form-to-text) and Open Graph / social preview cards. Pure text
 * generation — Group A with zero parsing of live sites.
 */

import { devError } from '../types';

/* ---------------- sitemap.xml + robots.txt ---------------- */

export interface SitemapOptions {
  /** One URL per line; may include priorities/frequencies as "url freq priority". */
  urls: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  defaultPriority?: number;
}

const FREQS: readonly string[] = [
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
];

export function generateSitemap(options: SitemapOptions): { sitemap: string; robots: string } {
  const lines = options.urls
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw devError('empty-input', 'Add at least one page URL.');
  }
  if (lines.length > 50000) {
    throw devError('size-limit', 'A sitemap file is limited to 50,000 URLs — split it.');
  }
  const freq = options.changefreq;
  const priority = options.defaultPriority;
  const urls: string[] = [];
  const robotsDisallow: string[] = [];
  for (const line of lines) {
    const [rawUrl, lineFreq, linePriority] = line.split(/\s+/);
    if (rawUrl === undefined) continue;
    const url = /^https?:\/\/.+/i.test(rawUrl) ? rawUrl : `https://${rawUrl.replace(/^\/+/, '')}`;
    try {
      // Structural validation only — no network call, ever (Group A).
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        throw new Error('bad scheme');
    } catch {
      throw devError('invalid-input', `“${rawUrl}” is not a valid URL.`);
    }
    const f = lineFreq !== undefined && FREQS.includes(lineFreq) ? lineFreq : freq;
    const p = linePriority !== undefined ? Number(linePriority) : priority;
    const parts = ['  <url>', `    <loc>${xmlEscape(url)}</loc>`];
    if (f !== undefined) parts.push(`    <changefreq>${f}</changefreq>`);
    if (p !== undefined && Number.isFinite(p) && p >= 0 && p <= 1) {
      parts.push(`    <priority>${p.toFixed(1)}</priority>`);
    }
    parts.push('  </url>');
    urls.push(parts.join('\n'));
  }
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  // robots.txt: point at the sitemap's origin
  let origin = 'https://example.com';
  try {
    const first = new URL(
      /^https?:\/\//i.test(lines[0] ?? '') ? (lines[0] ?? '') : `https://${lines[0] ?? ''}`,
    );
    origin = first.origin;
  } catch {
    // keep placeholder origin
  }
  const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
  void robotsDisallow;
  return { sitemap, robots };
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------------- Open Graph preview ---------------- */

export interface OgCard {
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogUrl: string;
  ogSiteName: string;
  twitterCard: 'summary' | 'summary_large_image';
  themeColor?: string;
}

export interface OgResult {
  /** Ready-to-paste <head> snippet. */
  metaTags: string;
  /** The card the client renders as a visual preview. */
  card: OgCard;
}

const DEFAULT_CARD: OgCard = {
  ogTitle: 'Your page title',
  ogDescription: 'A one-sentence description that shows under the title in link previews.',
  ogImage: 'https://example.com/preview.png',
  ogUrl: 'https://example.com/page',
  ogSiteName: 'Example Site',
  twitterCard: 'summary_large_image',
};

/** Parse pasted <meta> tags into a card (best-effort, no live fetch). */
export function parseOgTags(input: string): OgCard {
  const text = input.trim();
  if (text.length === 0) throw devError('empty-input', 'Paste meta tags or fill the form fields.');
  const card: OgCard = { ...DEFAULT_CARD };
  const prop = (name: string): string | undefined => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
      'i',
    );
    return re.exec(text)?.[1] ?? alt.exec(text)?.[1];
  };
  const title = prop('og:title') ?? /<title>([^<]*)<\/title>/i.exec(text)?.[1];
  if (title !== undefined) card.ogTitle = title;
  const desc = prop('og:description') ?? prop('description');
  if (desc !== undefined) card.ogDescription = desc;
  const img = prop('og:image');
  if (img !== undefined) card.ogImage = img;
  const url = prop('og:url');
  if (url !== undefined) card.ogUrl = url;
  const site = prop('og:site_name');
  if (site !== undefined) card.ogSiteName = site;
  const tw = prop('twitter:card');
  if (tw === 'summary' || tw === 'summary_large_image') card.twitterCard = tw;
  const theme =
    prop('theme-color') ?? /theme-color["']\s+content=["']([^"']+)["']/i.exec(text)?.[1];
  if (theme !== undefined) card.themeColor = theme;
  return card;
}

export function buildOgCard(card: Partial<OgCard>): OgResult {
  const full: OgCard = { ...DEFAULT_CARD, ...stripEmpty(card) };
  const tags: string[] = [
    `<meta property="og:title" content="${attr(full.ogTitle)}" />`,
    `<meta property="og:description" content="${attr(full.ogDescription)}" />`,
    `<meta property="og:image" content="${attr(full.ogImage)}" />`,
    `<meta property="og:url" content="${attr(full.ogUrl)}" />`,
    `<meta property="og:site_name" content="${attr(full.ogSiteName)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="${full.twitterCard}" />`,
    `<meta name="twitter:title" content="${attr(full.ogTitle)}" />`,
    `<meta name="twitter:description" content="${attr(full.ogDescription)}" />`,
    `<meta name="twitter:image" content="${attr(full.ogImage)}" />`,
  ];
  if (full.themeColor !== undefined && full.themeColor.length > 0) {
    tags.push(`<meta name="theme-color" content="${attr(full.themeColor)}" />`);
  }
  return { metaTags: tags.join('\n'), card: full };
}

function stripEmpty(card: Partial<OgCard>): Partial<OgCard> {
  const out: Partial<OgCard> = {};
  const entries = Object.entries(card);
  for (const [k, v] of entries) {
    if (typeof v === 'string' && v.length > 0) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

function attr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
