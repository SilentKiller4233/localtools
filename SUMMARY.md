# LocalTools — Project Summary

_Last updated: 2026-09-05, after Phase 6 — Text & Dev suite complete_

## What this project is

LocalTools is an open-source, self-hosted, privacy-first alternative to the whole category of rate-limited/paywalled/ad-choked "free tool" websites (iLovePDF-style PDF tools, social media downloaders, image converters, JSON formatters). It ships as a one-click desktop app (Tauri) and a Docker Compose stack, and every tool is free and unlimited.

## Current status

- Phases complete: 6 of 15 (Section 15)
- PDF suite: **complete — Group A 21/21 (client worker) + Group B 6/6 engine endpoints (LibreOffice ↔Office, OCR, Ghostscript deep-compress/PDF-A/deep-repair, WeasyPrint/Playwright HTML→PDF) behind the full Section 5 control set, wired to client pages via engine-client.ts**
- Media suite: not started (design direction + shell only; 18 tools registered, incl. the single Group C downloader; TTS/audiobook assigned Phase 9 per D-012)
- Image suite: **complete — all 14 Group A tools implemented in `@localtools/image-core` (65/65 tests), worker-offloaded client pages wired**
- Text & Dev suite: **complete — all 30 Group A tools + zip/unzip (Section 3.5) implemented in `@localtools/devtext-core` (172/172 tests), worker-offloaded client pages wired**
- Desktop app (Tauri): not started (placeholder `apps/desktop/README.md` only)
- Docker Compose target: engine Dockerfile now real (multi-stage bookworm-slim + ghostscript/tesseract/libreoffice/pip-weasyprint, non-root, healthcheck); stack acceptance runs as the CI `compose-stack` job (dev host has no Docker — D-015)
- Test suite (`pnpm verify`): format + lint + typecheck + tests (165 pdf-core + 39 engine + 65 image-core + 172 devtext-core) + build — all green

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

**Phase 5 — Image suite (14/14 Group A tools, complete)**

- `@localtools/image-core` with the D-017 codec layer (@jsquash WASM codecs in Node via manual binary init; browser self-initializes) + HEIC via libheif-wasm (`heic-decode`) — all dual-environment.
- Tools: format converter (png/jpeg/webp/avif via codecs, hand-rolled BMP both ways, honest gif/tiff unsupported), compressor (quality presets, PNG lossless-only stated honestly), resizer (exact/percent/max-dimension, aspect lock, box-average downscale), batch runner (50-file cap, fail-loud), HEIC→JPG/PNG, base64 data-URI both ways (25MB cap), favicon generator (real ICO container + 16/32/180/192/512 PNGs + snippet), palette extractor (in-house k-means), EXIF viewer + **byte-genuine stripper** (drops APP segments; the 14.1-style acceptance asserts no EXIF/GPS markers anywhere in output bytes), SVG optimizer (svgo, viewBox kept), meme generator (built-in 5×7 bitmap font, stroke-under-ink two-pass), screenshot annotator (box/arrow/mosaic-blur — blur is real pixel averaging), image OCR (tesseract.js, lazy traineddata), background remover (D-016: onnxruntime + Apache-2.0 u2netp, lazy-download + cache, verified real inference: object fixture → alpha mask with fg ratio 0.141, center 255/corner 0).
- Client: `image.worker.ts` + `image-worker-client.ts` (same frozen bridge pattern as pdf) + `ImagePageSpec.tsx` with real pages for all 14 tools (GPS warning in EXIF viewer, size-stat renderers, palette swatches, OCR text view). Initial JS: **78.1KB gzipped** (budget 250KB).

**Phase 6 — Text & Dev suite (30/30 Group A tools + zip/unzip, complete)**

- `@localtools/devtext-core`, entirely Group A per spec Section 3.4/3.5. Error taxonomy mirrors pdf/image-core (`DevTextToolError`) with `maxChars`/`maxBytes` seams for the 14.1 oversized tests.
- Formatters: JSON (format/minify/validate with line/column errors), YAML↔JSON (js-yaml), CSV↔JSON (papaparse), XML validate+pretty/minify (fast-xml-parser).
- Encoders: Base64 text+file, URL encode/component/decode, JWT decode/inspect only (signature-NOT-verified note per spec), hashes (Web Crypto SHA-1/256/512 + spark-md5 for MD5; file hash checker).
- Generators: UUID v4 (crypto) / ULID, 9 case kinds, NFKD slug, lorem, password/passphrase (rejection-sampled crypto chars, entropy bits + strength band), unit converter (8 categories, temperature affine, KB-vs-KiB).
- Dev: regex tester (group breakdown, zero-length-loop guard), text diff (jsdiff — the PDF Compare tool's library, reused per spec), minify/beautify (csso/terser/html-minifier-terser/prettier — exact Section 4.4 choices), Markdown→HTML (marked GFM) + HTML→Markdown (D-018 in-house htmlparser2 serializer; turndown needs a live DOM), Markdown→PDF (pdf-lib typesetting, paginating, WinAnsi-safe).
- Color/gradient: in-house oklch (CSS Color 4 matrices) + hex/rgb/hsl, 4 palette harmonies, linear/radial/repeating gradient CSS.
- Time: cronstrue explainer with field breakdown; timestamp converter (s/ms auto-detect, IANA timezones, relative rendering).
- QR/barcode/fake/zip/webdev: QR SVG + real PNG (D-019: in-house 1-bit PNG encoder — fflate zlibSync, NOT deflateSync) + jsQR scan via image-core decode reuse; bwip-js toSVG (dual Node/browser) for 9 barcode formats; faker (seeded, synthetic-note); fflate zip/unzip with traversal-name rejection; sitemap.xml/robots.txt generator (no network, structural URL validation only); OG preview (meta-tag parser + form builder + visual card).
- Client: `devtext.worker.ts` + `devtext-worker-client.ts` (frozen bridge, same pattern as pdf/image) + `DevTextRunner` text-first frame + per-tool pages for all 30 tools. Initial JS **86.28KB gzipped** (budget 250KB); faker/prettier/pdf-lib/bwip-js are lazy worker chunks.

**Phase 4 — PDF suite Group B (6/6 endpoints, complete)**

- `@localtools/engine` (Fastify 5): request harness owning the full Section 5 control set — multipart size caps (stream-level, envelope-mapped 413), `file-type` magic-byte validation, fresh internal names in per-request temp dirs (finally-removal + 5-min sweeper), zod option schemas shared with the client, subprocess concurrency cap → 429, anonymous-id logging (never filenames). Subprocess runner: spawn argument arrays ONLY (`shell:false` hardcoded), SIGTERM→SIGKILL (+ taskkill /T on Windows).
- Six endpoints: `/pdf/office-conversion` (LibreOffice; pinned `writer_pdf_import`/`impress_pdf_import` + explicit OOXML export for from-PDF; PDF→xlsx rejected with a clear error — no Calc PDF import exists), `/pdf/ocr` (OCRmyPDF or Ghostscript+Tesseract fallback), `/pdf/deep-compress`, `/pdf/pdf-a`, `/pdf/deep-repair` (Ghostscript), `/pdf/html-to-pdf` (WeasyPrint default via per-request `@page` stylesheet + Windows launcher script; Playwright strictly opt-in → 503, never a silent fallback).
- Security plugins (fastify-plugin wrapped — plugin-encapsulation bug found and fixed during testing): CSP/nosniff/no-referrer headers, exact-origin CORS, bearer auth + boot-refusal when `LOCALTOOLS_EXPOSE` without a ≥32-char token. `/healthz` reports busy/capacity.
- Fixtures added: `sample.docx/.xlsx/.pptx/.html`, `malformed.docx`, `empty.*`.
- Engine tests: 39 (Section 14.1 per-tool happy/malformed/empty/oversized with container-sniffed outputs; 14.4 regressions: headers/CORS, hostile filenames, caps, temp cleanup, deterministic 429, auth) — running against the REAL installed tools.
- Client: `lib/engine-client.ts` (fetch bridge, base64 EngineFiles, taxonomy copy) + `EngineRunnerPage` (Section 9 pattern for engine tools) + real pages for all 8 Group B tool cards; `ToolPage` dispatches PDF Group B to them.

**Phase 3 — PDF suite Group A (21/21 tools, complete)**

- **Batches 1–4** (commits `0ac2f9a`, `e05bdaf`, `0e37d1a`, `2118068`): vitest 4 harness wired into `pnpm verify`, committed deterministic Section 14.2 fixtures at root `fixtures/pdf/`, shared `loadPdf` (size-cap-before-parse, `/Encrypt` trailer sniff, zero-page detection), ToolError taxonomy. Tools: Merge, Split (every-N/by-size), Extract, Delete, Rotate, Organize, page numbers, text watermark, metadata edit/read, resize, N-up, protect/unlock/optimize (qpdf-wasm singleton, arg-array callMain), text extraction (pdfjs legacy build in Node), image→PDF (magic-byte sniffing), fill/read forms, **genuine redaction** (Section 14.3 mandatory test PASSES — redacted string absent from raw bytes + text layer with black box drawn), text compare, quick compress, repair, bookmarks.
- **Batch 5** (`84fa0f8`): D-014 canvas strategy decided and recorded — pdfjs 6.3.289's own auto-selected factory per environment (Node renders through its internal `NodeCanvasFactory` → `@napi-rs/canvas`, pdfjs's own optionalDependency, zero new direct deps; browser Worker gets `OffscreenCanvasFactory` via getDocument's `CanvasFactory` option). `src/render.ts` shared pipeline (legacy build in Node, `useWorkerFetch: false`, fs-path `standardFontDataUrl`, 64MP render cap, guaranteed teardown). Tools: **pdf-to-image** (PNG/JPEG, page selection, scale, quality, maxBytes seam), **visual compare** (pixelmatch; auto-routes scanned docs per Section 13; per-page mismatch stats + diff overlay), **grayscale** (render → BT.601 desaturate → re-embed same-size page).
- **Batch 6**: **crop** (CropBox margins pt/percent, 10pt clamp, MediaBox untouched), **sign** (type/draw/image visual signature — Section 7's no-legal-e-signature boundary respected), **redact-by-text** (pdfjs text positions → rects → genuine content removal; passes the same 14.3 substance).
- **Batch 7 — client UI wiring**: `lib/pdf-worker-client.ts` (typed Worker bridge, transferable buffers, ToolError taxonomy across the boundary) + `workers/pdf.worker.ts` (dispatch table for all 21 tools incl. read-modes); `ToolRunnerPage` implementing the Section 9 per-tool pattern (drop zone → options → progress → human-readable errors → downloads); `ToolPageSpec` real pages for every tool; `CameraCapture` (scan-to-pdf, permission-denied/no-camera/insecure-context error copy) and `SignaturePad` (pointer-drawing, content-trimmed PNG export) components; `ToolPage` dispatches PDF Group A → real pages. Vite config: ES-module worker format + inline plugin copying pdfjs/qpdf asset dirs (`/pdfjs/*`, `/wasm/qpdf.wasm`) at build/dev. `@localtools/pdf-core` added as client dependency.
- **Section 14.5 acceptance**: `scripts/worker-offload-test.mjs` — 52MB fixture (real PDF padded with a giant comment line, verified parseable) merged through the production UI in headless Chrome with a `PerformanceObserver` long-task counter: **0 long tasks, 0ms main-thread blocking → WORKER_OFFLOAD_PASS** (logged in TESTS.md).
- Final bundle: initial JS 72.9KB gzipped (budget 250KB); pdfjs/qpdf chunks are lazy per-tool-suite.

## What's left

- Phase 7 — Media conversion (ffmpeg Group B) + ffprobe sanity checks
- Phase 8 — Media downloader (Group C) with full Section 5.8 SSRF set from the start
- Phase 9 — Speech-to-text (whisper.cpp WASM) + auto-captions **+ Piper TTS + PDF→audiobook (assigned here per D-012)**
- Phase 10 — Tauri desktop shell + sidecar + lazy downloads
- Phase 11 — integration polish · Phase 12 — accessibility/responsiveness · Phase 13 — test/CI finalization (incl. wiring PWA/offline + worker-offload checks into `pnpm verify`) · Phase 14 — performance/size · Phase 15 — docs & v1.0.0 release (incl. flipping the repo back to public per D-010)

## Key architectural decisions made so far

D-018 (HTML→Markdown in-house serializer — turndown needs a live DOM), D-019 (bwip-js SVG + in-house 1-bit PNG encoder for QR; fflate zlib-not-deflate gotcha), D-016 (background-removal license: AGPL-only @imgly rejected → onnxruntime + Apache-2.0 u2netp) and D-017 (@jsquash Node init contract) plus D-015 and earlier calls, all detailed in [DECISIONS.md](DECISIONS.md): MIT license with subprocess-boundary reasoning for AGPL deps (D-001); loopback-only stub engine until security phases land (D-002); Node 22 LTS + pnpm 10 pinned (D-003); repo private during build, public flip in Phase 15 (D-010); Stitch-derived token system (D-011); Lighthouse-PWA reinterpretation + TTS→Phase 9 (D-012); vitest harness + committed fixtures + maxBytes seam (D-013); **D-014 canvas strategy — pdfjs auto-factory + `@napi-rs/canvas` as pdfjs's own optionalDependency (zero new direct deps), OffscreenCanvasFactory for browser Workers, fs-path asset URLs in Node**.

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
pnpm verify           # format + lint + typecheck + 441 tests (165 pdf + 39 engine + 65 image + 172 devtext) + build gate

# Phase 3 acceptance surface: every PDF Group A tool is live at #/tool/<id> —
# drop a PDF, set options, run; processing happens in the Web Worker.
# Worker-offload check (Section 14.5): build, then:
#   cd apps/client && npx vite preview --port 4173 --strictPort   (own terminal)
#   node scripts/worker-offload-test.mjs                          # expect WORKER_OFFLOAD_PASS
# Offline check (Phase 2): node scripts/offline-test.mjs warmup|verify
```

If the dev server serves stale `@localtools/ui` output after a package rebuild, restart it (Vite's dep-optimize cache doesn't always invalidate workspace deps; deleting `apps/client/node_modules/.vite` also works).
