# Self-hosted webfonts (Phase 1)

Per PROJECT_SPEC Section 7 ("One self-hosted variable font for UI text + one
monospace font for technical output", no third-party CDNs), production builds
must ship these two families locally:

| Family           | File to vendor                           | Source                                 | License |
| ---------------- | ---------------------------------------- | -------------------------------------- | ------- |
| Inter (variable) | `InterVariable.woff2` (~340 KB)          | rsms.me/inter or github.com/rsms/inter | OFL-1.1 |
| JetBrains Mono   | `JetBrainsMono-Regular.woff2` (+ Medium) | github.com/JetBrains/JetBrainsMono     | OFL-1.1 |

## How to add them

1. Download the `.woff2` files into this directory (`fonts/`).
2. Add `@font-face` rules at the top of `../src/tokens.css`:
   `font-family: 'Inter'` / `'JetBrains Mono'`, `font-display: swap`,
   `src: url('./InterVariable.woff2') format('woff2')` (paths resolve relative
   to the CSS file once imported through Vite).
3. The CSS variable stacks (`--lt-font-ui`, `--lt-font-mono`) already name
   these families first, so no component code changes.

Until vendored, the stacks fall back to system fonts; nothing references a
CDN (Section 0 principle 2). This note is tracked as D-011 in DECISIONS.md.
