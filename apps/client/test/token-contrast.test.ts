/**
 * Phase 12 acceptance (Section 14.6): WCAG 2.1 AA color-contrast for every
 * design-token text/background PAIR the UI actually composes, in BOTH
 * themes. The axe route scan proves the composed pages; this test pins
 * the token system itself so a future token tweak can't silently regress
 * contrast (that's how #6b7280-on-#f3f4f6 shipped — 4.39:1).
 *
 * Text pairs are asserted at >= 4.5:1 (AA normal text). The accent-on-
 * surface pairs used for large/bold display text (nav glyphs) are asserted
 * at >= 3:1 where that's their only use — the pairs list states which.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TOKENS_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'packages',
  'ui',
  'src',
  'tokens.css',
);

/** Parse a theme block's custom properties into a hex/rgb dictionary. */
function parseTheme(css: string, theme: string): Record<string, string> {
  const start = css.indexOf(`[data-theme='${theme}']`);
  if (start < 0) throw new Error(`theme block ${theme} not found`);
  const end = css.indexOf('}', css.indexOf('--lt-shadow-hover', start));
  const block = css.slice(start, end);
  const props: Record<string, string> = {};
  for (const m of block.matchAll(/--lt-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    const name = m[1];
    const value = m[2];
    if (name === undefined || value === undefined) continue;
    props[`--lt-${name}`] = value;
  }
  return props;
}

/** WCAG 2.1 relative luminance + contrast ratio (no dependencies). */
function contrastRatio(aHex: string, bHex: string): number {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(i, i + 2), 16) / 255;
  const lum = (hex: string): number => {
    const lin = [1, 3, 5].map((i) => {
      const c = channel(hex, i);
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const r = lin[0] ?? 0;
    const g = lin[1] ?? 0;
    const b = lin[2] ?? 0;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [la, lb] = [lum(aHex), lum(bHex)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Pair = [fg: string, bg: string, min: number, note: string];

/** The composed token pairs (fg on bg) the UI renders text with. */
const LIGHT_PAIRS: readonly Pair[] = [
  ['--lt-text', '--lt-bg', 4.5, 'body text on page'],
  ['--lt-text', '--lt-surface', 4.5, 'body text on card'],
  ['--lt-text-muted', '--lt-bg', 4.5, 'muted text on page'],
  ['--lt-text-muted', '--lt-surface', 4.5, 'muted text on card'],
  ['--lt-text-muted', '--lt-canvas', 4.5, 'nav tabs + badges on canvas'],
  ['--lt-on-accent', '--lt-accent', 4.5, 'primary button + active tab'],
  ['--lt-on-accent', '--lt-accent-hover', 4.5, 'primary button hover'],
  ['--lt-accent-text', '--lt-surface', 4.5, 'accent text/links on card'],
  ['--lt-accent-text', '--lt-canvas', 4.5, 'accent text on canvas'],
  ['--lt-success-text', '--lt-success-bg', 4.5, 'success badge/banner'],
  ['--lt-warning-text', '--lt-warning-bg', 4.5, 'warning badge/banner'],
  ['--lt-error-text', '--lt-error-bg', 4.5, 'error badge/banner'],
  ['--lt-info-text', '--lt-info-bg', 4.5, 'info badge'],
];

const DARK_PAIRS: readonly Pair[] = [
  ['--lt-text', '--lt-bg', 4.5, 'body text on page'],
  ['--lt-text', '--lt-surface', 4.5, 'body text on card'],
  ['--lt-text-muted', '--lt-bg', 4.5, 'muted text on page'],
  ['--lt-text-muted', '--lt-surface', 4.5, 'muted text on card'],
  ['--lt-text-muted', '--lt-canvas', 4.5, 'nav tabs + badges on canvas'],
  ['--lt-on-accent', '--lt-accent', 4.5, 'primary button + active tab'],
  ['--lt-on-accent', '--lt-accent-hover', 4.5, 'primary button hover'],
  ['--lt-accent-text', '--lt-surface', 4.5, 'accent text/links on card'],
  ['--lt-accent-text', '--lt-canvas', 4.5, 'accent text on canvas'],
  ['--lt-success-text', '--lt-surface', 4.5, 'success text (bg is translucent)'],
  ['--lt-warning-text', '--lt-surface', 4.5, 'warning text (bg is translucent)'],
  ['--lt-error-text', '--lt-surface', 4.5, 'error text (bg is translucent)'],
  ['--lt-info-text', '--lt-surface', 4.5, 'info text (bg is translucent)'],
];

describe('design-token WCAG contrast (Phase 12)', () => {
  it('light theme: every composed text pair clears AA', async () => {
    const css = await readFile(TOKENS_PATH, 'utf8');
    const tokens = parseTheme(css, 'light');
    const failures: string[] = [];
    for (const [fg, bg, min, note] of LIGHT_PAIRS) {
      const ratio = contrastRatio(tokens[fg] ?? '', tokens[bg] ?? '');
      if (ratio < min) {
        failures.push(`${fg} on ${bg} (${note}): ${ratio.toFixed(2)} < ${String(min)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('dark theme: every composed text pair clears AA', async () => {
    const css = await readFile(TOKENS_PATH, 'utf8');
    const tokens = parseTheme(css, 'dark');
    const failures: string[] = [];
    for (const [fg, bg, min, note] of DARK_PAIRS) {
      const ratio = contrastRatio(tokens[fg] ?? '', tokens[bg] ?? '');
      if (ratio < min) {
        failures.push(`${fg} on ${bg} (${note}): ${ratio.toFixed(2)} < ${String(min)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('placeholder-faint stays decorative: >= 3:1 (non-essential text)', async () => {
    // Placeholders are supplementary (the label carries the meaning), so
    // the 3:1 non-text/large-text bar applies; still asserted so a token
    // change can't make them invisible.
    const css = await readFile(TOKENS_PATH, 'utf8');
    const light = parseTheme(css, 'light');
    const dark = parseTheme(css, 'dark');
    expect(
      contrastRatio(light['--lt-text-faint'] ?? '', light['--lt-surface'] ?? ''),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(dark['--lt-text-faint'] ?? '', dark['--lt-surface'] ?? ''),
    ).toBeGreaterThanOrEqual(3);
  });
});
