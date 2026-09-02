# LocalTools — Project Summary

_Last updated: 2026-09-02, after Phase 3 — PDF suite (Group A) complete_

## What this project is

LocalTools is an open-source, self-hosted, privacy-first alternative to the whole category of rate-limited/paywalled/ad-choked "free tool" websites (iLovePDF-style PDF tools, social media downloaders, image converters, JSON formatters). It ships as a one-click desktop app (Tauri) and a Docker Compose stack, and every tool is free and unlimited.

## Current status

- Phases complete: 3 of 15 (Section 15)
- PDF suite: **Group A complete — 21/21 tools implemented, tested (165/165), and wired into real client tool pages**; Group B (6 tools) is Phase 4
- Media suite: not started (design direction + shell only; 18 tools registered, incl. the single Group C downloader; TTS/audiobook assigned Phase 9 per D-012)
- Image suite: not started (design direction + shell only; 14 tools registered)
- Text & Dev suite: not started (design direction + shell only; 30 tools registered)
- Desktop app (Tauri): not started (placeholder `apps/desktop/README.md` only)
- Docker Compose target: compose file + both Dockerfiles scaffolded with hardened defaults; images **not yet built/run**
- Test suite (`pnpm verify`): format + lint + typecheck + tests (165 pdf-core) + build, all green across 8 workspaces

## What has been built so far

**Phase 0 — repo scaffold**

- pnpm workspaces (`apps/*`, `packages/*`) + Turborepo 2.x monorepo; strict TS baseline via `tooling/tsconfig` presets; shared ESLint/Prettier configs
- Stub apps that build clean: `apps/client` (Vite 6 + React 18), `apps/engine` (Fastify 5, `/healthz`, loopback-only)
- Six workspace packages wired: `pdf-core`, `media-core`, `image-core`, `devtext-core`, `ui`, `shared-types`
- Hardened Docker placeholders, CI workflow (verify matrix ubuntu+windows + compose-validate), repo hygiene files, docs seeded (D-001…D-009)

**Phase 1 — design direction**

- Stitch MCP pass executed **before** any component code (Section 9 mandate): design system + six screens; generated HTML archived verbatim in `packages/ui/stitch-reference/`
- Design tokens in `packages/ui/src/tokens.css` (full light theme + hand-derived dark theme, `--lt-*` namespace, strict type scale, 4px spacing scale)
- Base components in `packages/ui`: Button, Badge, Card + ToolCard, Field/Input, DropZone (5 states, keyboard-operable), ProgressBar, SuiteNav, ThemeToggle
- Client wiring: theme bootstrap (`prefers-color-scheme` default, persisted override), minimal hash routing, `/dev/ui-preview` page rendering every component in **both** themes (Phase 1 acceptance, verified live)

**Phase 2 — client shell**

- All 97 Section 3 tools registered in `apps/client/src/lib/tool-registry.ts` (73 Group A / 23 Group B / 1 Group C) with Lucide icons, groups, phase-aware badges; display strings in `apps/client/src/i18n/en.json`
- Hash router + suite pages with live searchable/filterable tool grids + per-tool pages; `/dev/ui-preview` preserved
- Fonts vendored (Inter variable + JetBrains Mono, woff2 + OFL licenses) — no CDNs
- PWA: `manifest.webmanifest`, versioned service worker with precache+runtime caching, generated icon set; offline-reload acceptance **OFFLINE_RELOAD_PASS** (logged in TESTS.md)
- Lighthouse 12 baseline: perf 82 / a11y 100 / best-practices 100 / SEO 91 (PWA category removed upstream — acceptance reinterpreted per D-012). Bundle 63.9KB gzipped at Phase 2.

**Phase 3 — PDF suite Group A (21/21 tools, complete)**

- **Batches 1–4** (commits `0ac2f9a`, `e05bdaf`, `0e37d1a`, `2118068`): vitest 4 harness wired into `pnpm verify`, committed deterministic Section 14.2 fixtures at root `fixtures/pdf/`, shared `loadPdf` (size-cap-before-parse, `/Encrypt` trailer sniff, zero-page detection), ToolError taxonomy. Tools: Merge, Split (every-N/by-size), Extract, Delete, Rotate, Organize, page numbers, text watermark, metadata edit/read, resize, N-up, protect/unlock/optimize (qpdf-wasm singleton, arg-array callMain), text extraction (pdfjs legacy build in Node), image→PDF (magic-byte sniffing), fill/read forms, **genuine redaction** (Section 14.3 mandatory test PASSES — redacted string absent from raw bytes + text layer with black box drawn), text compare, quick compress, repair, bookmarks.
- **Batch 5** (`84fa0f8`): D-014 canvas strategy decided and recorded — pdfjs 6.3.289's own auto-selected factory per environment (Node renders through its internal `NodeCanvasFactory` → `@napi-rs/canvas`, pdfjs's own optionalDependency, zero new direct deps; browser Worker gets `OffscreenCanvasFactory` via getDocument's `CanvasFactory` option). `src/render.ts` shared pipeline (legacy build in Node, `useWorkerFetch: false`, fs-path `standardFontDataUrl`, 64MP render cap, guaranteed teardown). Tools: **pdf-to-image** (PNG/JPEG, page selection, scale, quality, maxBytes seam), **visual compare** (pixelmatch; auto-routes scanned docs per Section 13; per-page mismatch stats + diff overlay), **grayscale** (render → BT.601 desaturate → re-embed same-size page).
- **Batch 6**: **crop** (CropBox margins pt/percent, 10pt clamp, MediaBox untouched), **sign** (type/draw/image visual signature — Section 7's no-legal-e-signature boundary respected), **redact-by-text** (pdfjs text positions → rects → genuine content removal; passes the same 14.3 substance).
- **Batch 7 — client UI wiring**: `lib/pdf-worker-client.ts` (typed Worker bridge, transferable buffers, ToolError taxonomy across the boundary) + `workers/pdf.worker.ts` (dispatch table for all 21 tools incl. read-modes); `ToolRunnerPage` implementing the Section 9 per-tool pattern (drop zone → options → progress → human-readable errors → downloads); `ToolPageSpec` real pages for every tool; `CameraCapture` (scan-to-pdf, permission-denied/no-camera/insecure-context error copy) and `SignaturePad` (pointer-drawing, content-trimmed PNG export) components; `ToolPage` dispatches PDF Group A → real pages. Vite config: ES-module worker format + inline plugin copying pdfjs/qpdf asset dirs (`/pdfjs/*`, `/wasm/qpdf.wasm`) at build/dev. `@localtools/pdf-core` added as client dependency.
- **Section 14.5 acceptance**: `scripts/worker-offload-test.mjs` — 52MB fixture (real PDF padded with a giant comment line, verified parseable) merged through the production UI in headless Chrome with a `PerformanceObserver` long-task counter: **0 long tasks, 0ms main-thread blocking → WORKER_OFFLOAD_PASS** (logged in TESTS.md).
- Final bundle: initial JS 72.9KB gzipped (budget 250KB); pdfjs/qpdf chunks are lazy per-tool-suite.

## What's left

- Phase 4 — PDF Group B endpoints behind Section 5 controls (Docker target): LibreOffice conversion, OCR, Ghostscript deep compress/PDF-A/deep repair, WeasyPrint/Playwright HTML→PDF
- Phase 5 — Image suite (all Group A) + EXIF-stripping byte-level test
- Phase 6 — Text & Dev suite (all Group A)
- Phase 7 — Media conversion (ffmpeg Group B) + ffprobe sanity checks
- Phase 8 — Media downloader (Group C) with full Section 5.8 SSRF set from the start
- Phase 9 — Speech-to-text (whisper.cpp WASM) + auto-captions **+ Piper TTS + PDF→audiobook (assigned here per D-012)**
- Phase 10 — Tauri desktop shell + sidecar + lazy downloads
- Phase 11 — integration polish · Phase 12 — accessibility/responsiveness · Phase 13 — test/CI finalization (incl. wiring PWA/offline + worker-offload checks into `pnpm verify`) · Phase 14 — performance/size · Phase 15 — docs & v1.0.0 release (incl. flipping the repo back to public per D-010)

## Key architectural decisions made so far

All detailed in [DECISIONS.md](DECISIONS.md): MIT license with subprocess-boundary reasoning for AGPL deps (D-001); loopback-only stub engine until security phases land (D-002); Node 22 LTS + pnpm 10 pinned (D-003); repo private during build, public flip in Phase 15 (D-010); Stitch-derived token system (D-011); Lighthouse-PWA reinterpretation + TTS→Phase 9 (D-012); vitest harness + committed fixtures + maxBytes seam (D-013); **D-014 canvas strategy — pdfjs auto-factory + `@napi-rs/canvas` as pdfjs's own optionalDependency (zero new direct deps), OffscreenCanvasFactory for browser Workers, fs-path asset URLs in Node**.

## Known issues / tech debt

- Engine has zero Section 5 controls yet (by design until Phases 4/7/8; see D-002) — never expose past localhost.
- `apps/desktop` contains no code yet (README placeholder only).
- CI is green on `main`; workflow remains untested against PRs/tags until later phases exercise them.
- PWA/offline + worker-offload checks are not yet part of `pnpm verify` (manual scripts today); wiring them in is scheduled for Phase 13.
- Safari/WebKit quirks on the new Worker render path (COOP/COEP, OffscreenCanvas limits) untested — Section 13 lists Safari WASM testing as required; schedule it during Phase 12/14 rather than assuming.
- Redaction's v1 contract: text removal is genuine; image XObjects inside a box are covered visually but not pixel-removed (true image redaction needs the render pipeline — noted in-code as a future enhancement, consistent with the spec's algorithm).

## How to run the project right now

```bash
pnpm install          # pnpm-lock.yaml is committed
pnpm dev              # client → http://localhost:5173 ; engine health → http://127.0.0.1:8787/healthz
pnpm build            # all workspaces (client build also copies /pdfjs/* and /wasm/qpdf.wasm assets)
pnpm verify           # format + lint + typecheck + 165 tests + build gate

# Phase 3 acceptance surface: every PDF Group A tool is live at #/tool/<id> —
# drop a PDF, set options, run; processing happens in the Web Worker.
# Worker-offload check (Section 14.5): build, then:
#   cd apps/client && npx vite preview --port 4173 --strictPort   (own terminal)
#   node scripts/worker-offload-test.mjs                          # expect WORKER_OFFLOAD_PASS
# Offline check (Phase 2): node scripts/offline-test.mjs warmup|verify
```

If the dev server serves stale `@localtools/ui` output after a package rebuild, restart it (Vite's dep-optimize cache doesn't always invalidate workspace deps; deleting `apps/client/node_modules/.vite` also works).
