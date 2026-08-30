# LocalTools — Project Summary

_Last updated: 2026-08-30, after Phase 2 — Client shell_

## What this project is

LocalTools is an open-source, self-hosted, privacy-first alternative to the whole category of rate-limited/paywalled/ad-choked "free tool" websites (iLovePDF-style PDF tools, social media downloaders, image converters, JSON formatters). It ships as a one-click desktop app (Tauri) and a Docker Compose stack, and every tool is free and unlimited.

## Current status

- Phases complete: 2 of 15 (Section 15)
- PDF suite: not started (design direction + shell only; 27 tools registered in the grid, 21 Group A / 6 Group B)
- Media suite: not started (design direction + shell only; 21 tools registered, incl. the single Group C downloader; TTS/audiobook assigned Phase 9 per D-012)
- Image suite: not started (design direction + shell only; 14 tools registered)
- Text & Dev suite: not started (design direction + shell only; 35 tools registered)
- Desktop app (Tauri): not started (placeholder `apps/desktop/README.md` only)
- Docker Compose target: compose file + both Dockerfiles scaffolded with hardened defaults; images **not yet built/run**
- Test suite (`pnpm verify`): passing (format + lint + typecheck + build across 8 workspaces); functional tests arrive from Phase 3 onward

## What has been built so far

**Phase 0 — repo scaffold**

- pnpm workspaces (`apps/*`, `packages/*`) + Turborepo 2.x monorepo; strict TS baseline via `tooling/tsconfig` presets; shared ESLint/Prettier configs
- Stub apps that build clean: `apps/client` (Vite 6 + React 18), `apps/engine` (Fastify 5, `/healthz`, loopback-only)
- Six workspace packages wired: `pdf-core`, `media-core`, `image-core`, `devtext-core`, `ui`, `shared-types`
- Hardened Docker placeholders, CI workflow (verify matrix ubuntu+windows + compose-validate), repo hygiene files, docs seeded (D-001…D-009)

**Phase 1 — design direction**

- Stitch MCP pass executed **before** any component code (Section 9 mandate): design system `assets/5698721899487494889` + six screens (home suite-nav/tool grid, Merge PDF, Universal Downloader, Image Converter, JSON Formatter, drop-zone states sheet); generated HTML archived verbatim in `packages/ui/stitch-reference/`
- Design tokens in `packages/ui/src/tokens.css`: full light theme + hand-derived dark theme (`--lt-*` namespace, strict type scale, 4px spacing scale, radii, motion, semantic status colors)
- Base components in `packages/ui`: Button (4 variants), Badge (7 tones incl. Instant/One-time setup), Card + ToolCard, Field/Input, DropZone (default/drag-over/uploading/error/compact states, keyboard-operable), ProgressBar, SuiteNav (wordmark + four segmented suite tabs + trailing slot), ThemeToggle
- Client wiring: theme bootstrap (`prefers-color-scheme` default, persisted manual override), minimal hash routing, `/dev/ui-preview` page rendering every component in **both** themes incl. suite-nav (Phase 1 acceptance criterion, verified live on the production build)

**Phase 2 — client shell**

- All 97 Section 3 tools registered in `apps/client/src/lib/tool-registry.ts` (73 Group A / 23 Group B / 1 Group C) with Lucide icons, groups, and phase-aware "instant"/"one-time setup" badges; display strings in `apps/client/src/i18n/en.json` per the Section 7 i18n mandate
- Hash router (`src/lib/router.ts`) + suite pages with live searchable/filterable tool grids (`src/pages/SuitePage.tsx`) + per-tool placeholder pages (`src/pages/ToolPage.tsx`); `/dev/ui-preview` preserved
- Fonts vendored: Inter variable + JetBrains Mono Regular/Medium (woff2 + OFL licenses) in `packages/ui/fonts/`, `@font-face` via tokens.css — no CDNs (closes the Phase 1 tech-debt item)
- PWA: `manifest.webmanifest`, versioned service worker `sw.js` with precache+runtime caching, generated icon set (SVG + 192/512 PNGs), registration in `index.html`
- Offline-reload acceptance: `apps/client/scripts/offline-test.mjs` (puppeteer-core + system Chrome) — warmup → server killed → reload renders the Media suite (h1 + 18 cards) purely from SW cache → **OFFLINE_RELOAD_PASS** (logged in TESTS.md)
- Lighthouse 12 against the prod build: perf 82 / a11y 100 / best-practices 100 / SEO 91; PWA category removed upstream — acceptance reinterpreted per D-012. Bundle 63.9KB gzipped (budget 250KB).
- `lucide-react` cleaned out of `packages/ui` (accidental install); lives only in `apps/client`. `puppeteer-core` added as devDep of `apps/client` for the offline test (D-012).

## What's left

- Phase 3 — PDF suite Group A tools + tests (Sections 14.1–14.3 incl. redaction content-removal test); no main-thread blocking on the 50MB fixture
- Phase 4 — PDF Group B endpoints behind Section 5 controls (Docker target)
- Phase 5 — Image suite (all Group A) + EXIF-stripping byte-level test
- Phase 6 — Text & Dev suite (all Group A)
- Phase 7 — Media conversion (ffmpeg Group B) + ffprobe sanity checks
- Phase 8 — Media downloader (Group C) with full Section 5.8 SSRF set from the start
- Phase 9 — Speech-to-text (whisper.cpp WASM) + auto-captions **+ Piper TTS + PDF→audiobook (assigned here per D-012)**
- Phase 10 — Tauri desktop shell + sidecar + lazy downloads
- Phase 11 — integration polish · Phase 12 — accessibility/responsiveness · Phase 13 — test/CI finalization (incl. wiring PWA/offline checks into `pnpm verify`) · Phase 14 — performance/size · Phase 15 — docs & v1.0.0 release (incl. flipping the repo back to public per D-010)

## Key architectural decisions made so far

All detailed in [DECISIONS.md](DECISIONS.md): MIT license with subprocess-boundary reasoning for AGPL deps (D-001); loopback-only stub engine until security phases land (D-002); Node 22 LTS + pnpm 10 pinned (D-003); Turbo 2 `tasks` schema (D-004); release workflow disabled until Phase 10 (D-005); compiled-dist exports across workspace packages (D-007); `tooling/` shared configs (D-008); repo private during build, public flip in Phase 15 (D-010); Stitch-derived token system + single-stylesheet CSS delivery (D-011); Lighthouse-PWA ≥90 reinterpretation via Chrome installability + demonstrated offline reload, TTS/audiobook→Phase 9, puppeteer-core devDep rationale (D-012).

## Known issues / tech debt

- Engine has zero Section 5 controls yet (by design until Phases 4/7/8; see D-002) — never expose past localhost.
- `apps/desktop` contains no code yet (README placeholder only).
- CI is green on `main`; workflow remains untested against PRs/tags until later phases exercise them.
- PWA/offline checks are not yet part of `pnpm verify` (manual script today); wiring them in is scheduled for Phase 13.

## How to run the project right now

```bash
pnpm install          # pnpm-lock.yaml is committed
pnpm dev              # client → http://localhost:5173 ; engine health → http://127.0.0.1:8787/healthz
pnpm build            # all workspaces
pnpm verify           # format + lint + typecheck + build gate
# Phase 2 acceptance surface: the app shell itself — suite grids at #/suite/pdf|media|image|devtext,
# and /dev/ui-preview (both themes). Offline check: build, then:
#   cd apps/client && pnpm exec vite preview --port 4173 --strictPort
#   node scripts/offline-test.mjs warmup   # then kill the server
#   node scripts/offline-test.mjs verify   # expect OFFLINE_RELOAD_PASS
```

No tools are functional yet beyond the shell — every tool page is a placeholder showing its phase; functional tools arrive Phase 3 onward. If the dev server serves stale `@localtools/ui` output after a package rebuild, restart it (Vite's dep-optimize cache doesn't always invalidate workspace deps; deleting `apps/client/node_modules/.vite` also works).
