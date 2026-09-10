# LocalTools — Project Summary

_Last updated: 2026-09-10, after Phase 11 — Integration polish complete_

## What this project is

LocalTools is an open-source, self-hosted, privacy-first alternative to the whole category of rate-limited/paywalled/ad-choked "free tool" websites (iLovePDF-style PDF tools, social media downloaders, image converters, JSON formatters). It ships as a one-click desktop app (Tauri) and a Docker Compose stack, and every tool is free and unlimited.

## Current status

- Phases complete: 11 of 15 (Section 15)
- PDF suite: **complete — Group A 21/21 (client worker) + Group B 6/6 engine endpoints (LibreOffice ↔Office, OCR, Ghostscript deep-compress/PDF-A/deep-repair, WeasyPrint/Playwright HTML→PDF) behind the full Section 5 control set, wired to client pages via engine-client.ts**
- Media suite: **Group B conversion complete — all 14 ffmpeg tools as `/media/*` engine endpoints (43/43 tests incl. Section 14.5 ffprobe sanity checks); Group C downloader complete — yt-dlp behind the FULL Section 5.8 SSRF set (30/30 tests, mock-target only, D-024…D-027); speech & audio complete — transcribe-media + auto-captions client-side via whisper.cpp WASM (fugood 1.1.3, D-029 dual-environment contract) and text-to-speech + pdf-to-audiobook engine-side via Piper 2023.11.14-2 (D-030/D-031), 18 engine + 17 media-core tests; ffmpeg.wasm small-clip path deferred (D-021/D-032)**
- Image suite: **complete — all 14 Group A tools implemented in `@localtools/image-core` (65/65 tests), worker-offloaded client pages wired**
- Text & Dev suite: **complete — all 30 Group A tools + zip/unzip (Section 3.5) implemented in `@localtools/devtext-core` (172/172 tests), worker-offloaded client pages wired**
- Desktop app (Tauri): **complete — Rust/Tauri 2.11 shell in `apps/desktop` (D-033): window + injected `window.__LOCALTOOLS__` invoke bridge (client never imports @tauri-apps/api), engine as a restricted child process (minimal env, scoped temp, loopback-only, taskkill-tree shutdown), pinned+SHA-verified lazy downloads for every native tool (D-034: yt-dlp, ffmpeg, piper, ghostscript, tesseract+eng data, libreoffice, qpdf-fallback plumbing D-035), engine bundle via pnpm deploy + node runtime (D-038); client download prompts on tool-unavailable (EngineRunnerPage/DownloaderPage + ToolDownloadPrompt); Linux CI smoke green (desktop-build job: build + cargo tests + real sidecar healthz); updater OFF until signing (D-037), unsigned-app bypass steps in README; manual click-through checklist in TESTS.md**
- Docker Compose target: engine Dockerfile real (multi-stage bookworm-slim + ghostscript/tesseract/libreoffice/ffmpeg/pip-weasyprint, non-root, healthcheck); stack acceptance runs as the CI `compose-stack` job incl. a media round-trip (dev host has no Docker — D-015)
- Test suite (`pnpm verify`): format + lint + typecheck + tests (165 pdf-core + 130 engine [82 Group B + 30 downloader + 18 speech] + 65 image-core + 172 devtext-core + 17 media-core + 25 client [Phase 11: taxonomy copy-completeness, raw-error guarantee, health probe, liveness ticker, dispatch coverage]) + build — all green; desktop shell tests run via cargo in the CI desktop-build job (5 rust tests incl. the ignored sidecar smoke)

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

**Phase 7 — Media conversion suite (14/14 Group B tools, complete)**

- `apps/engine` media layer: `routes/media-group-b.ts` (14 endpoints under `/media/*`, all through the Phase 4 request harness — no new security surface) + `media-tools.ts` (ffmpeg/ffprobe subprocess functions; argument arrays only, SIGTERM→SIGKILL + taskkill /T timeout discipline inherited from `subprocess.ts`). ffmpeg resolution in `tool-paths.ts`: env override → repo-local `ffmpeg-<ver>/bin` portable build (gitignored, like Ghostscript) → Docker apt paths → PATH.
- Tools: video format converter (mp4/webm/mov/mkv/avi — libx264 / libvpx-vp9), video compressor (CRF 28/23/20 small/balanced/high-quality + optional maxrate/bufsize cap), video trimmer (lossless `-c copy` default with keyframe-slop-labeled mode; re-encode for exact cuts), merge/concat (concat demuxer + re-encode, video or audio, mixed kinds rejected), extract audio (mp3/wav/flac/ogg/aac/m4a), video→GIF (palettegen+paletteuse two-pass, width/fps options), GIF→video (silent-GIF anullsrc pairing), audio converter, audio compressor (target bitrate), audio trimmer (stream copy), loudness normalize (loudnorm EBU R128, audio or video's track — video stream-copied), burn subtitles (libass via engine-escaped filter path, .srt/.vtt), resolution/aspect changer (resize/crop/pad with aspect computation, mod-2 clamps, yuv420p).
- **Section 14.5 in-engine**: every conversion route probes its OUTPUT with ffprobe and asserts the container tag matches the request (some also codec/dimensions/bitrate) before returning — "ffmpeg exited 0" alone never satisfies a route.
- Shared zod schemas in `packages/shared-types/src/media-engine.ts` (same single-source contract as pdf-engine.ts): 14 request schemas, timecode union (seconds or HH:MM:SS.mmm).
- Upload sniffing extended (`upload-validation.ts`): audio/video extension maps, GIF kind, structural SRT cue-block + WebVTT header sniffs (subtitles have no magic bytes).
- Fixtures `fixtures/media/` (self-generated by `apps/engine/scripts/generate-media-fixtures.ts` — D-022, license-clear by construction): sample-short.mp4 (3s testsrc+440Hz), sample-short.mp3, sample.gif, malformed.mp4 (40% truncation), sample.srt, sample.vtt.
- Engine tests: 43 (Section 14.1 per tool incl. malformed/empty/oversized; 14.5 ffprobe sanity: webm=VP9, compress bitrate ordering, trim durations, 64k audio band, GIF width, 160×120/9:16/1:1 dimension checks; 14.4-style shell-discipline regressions) — all running against the REAL ffmpeg on this host (BtbN n9.0 GPL static, SHA-256-verified, D-020).
- Client: `MediaPageSpec.tsx` real pages for all 14 Group B tool cards via `EngineRunnerPage` (multi-file merge/burn order-hint contract; `buildOptions` now receives the selected-file count); `ToolPage` dispatches media Group B; ffmpeg.wasm deferred (D-021).
- Docker: `apt ffmpeg` added to the engine image; CI compose-stack job now runs a media round-trip (`/media/audio-convert` mp3→wav through the container).

**Phase 8 — Media downloader suite (Group C, complete)**

- `apps/engine` downloader layer: `routes/downloader-group-c.ts` (POST `/downloader/metadata` + `/downloader/download`, JSON bodies, downloader-specific rate limit BEFORE any work, URL-free logging) + `downloader/downloader.ts` (core flow), `downloader/ssrf-guard.ts` (the Section 5.8 set), `downloader/ytdlp.ts` (sandboxed arg builder + subprocess runner with wall-clock timeout, mid-download size watchdog, SIGTERM→SIGKILL + taskkill /T), `downloader/rate-limit.ts` (separate window from the general 429).
- **SSRF set, all from the first commit (D-027)**: scheme validation (http/https only); initial host resolve+classify before ANY subprocess exists; per-hop enforcement via a loopback-only validating forward proxy (`--proxy` to yt-dlp — every connection incl. redirect hops and CONNECT tunnels re-validates scheme + resolved IPs against loopback/private/link-local/CGNAT/ULA/NAT64/multicast/reserved, 169.254.169.254 covered); yt-dlp sandboxing flags verified against the installed 2026.08.19 binary's --help (`--no-config-locations --no-plugin-dirs --no-remote-components --no-exec --no-cache-dir --socket-timeout 30 --restrict-filenames --windows-filenames`); production extractor set `all,-generic` = no raw-fetch fallback; hard 600s timeout; output-size watchdog; pre-download duration gate (Section 8 cap); remote-metadata filename sanitization; `unsupported-site`/`blocked-host`/`rate-limited`/`too-long`/`download-too-large` error codes.
- yt-dlp deployment (D-025): repo-local standalone exe (SHA-256-verified release asset, gitignored `yt-dlp-*/`) with ffmpeg-pattern resolution (env → repo-local → Docker → PATH); Docker engine image adds pip yt-dlp (~+40MB); livestreams explicitly unsupported (D-024).
- Tests: 28 in `downloader.test.ts` + 2 canary — all against the local mock HTTP target (D-026): loopback/private/link-local/metadata-endpoint rejection with zero outbound requests (hit-log asserted), redirect-chain-to-private/metadata/localhost-name blocked at the hop, non-http(s) schemes rejected, production-extractor rejection with ZERO hits (no-open-proxy), oversized drip aborted mid-flight with no file kept, downloader rate limit distinct from engine-busy, malicious-title sanitization, duration gate, happy paths (mp4 ftyp / mp3 ID3 / srt / playlist-items selection) with honest 503 degradation on no-yt-dlp hosts (verified both ways locally).
- Client: `DownloaderPage.tsx` — URL input (not drop-zone), metadata preview card, format/quality picker + audio-only + subtitles, playlist queue with checkboxes, progress, one-time dismissible legal notice (Section 6) persisted in localStorage; `engine-client.ts` gained `runEngineJson` + Group C error copy; `ToolPage` dispatches media Group C.

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

**Phase 10 — Desktop app (Tauri shell, complete)**

- `apps/desktop/src-tauri` (Rust, lib+bin split so cargo tests exercise the shipped code): `manifest.rs` (every lazy-downloadable tool: pinned URL + SHA-256 per artifact, per-OS layouts, engine env bindings — D-034), `downloads.rs` (streaming SHA-256-verified download → per-kind extraction: 7z chain for SFX/NSIS, msiexec /a for MSI, tar for Linux archives, `.installed` marker only after full success — half-finished installs never look installed), `sidecar.rs` (engine as restricted child: minimal env, scoped temp, 127.0.0.1, healthz wait, taskkill-tree/process-group shutdown), `paths.rs` (app-data tools dir, resource-dir engine bundle, dev-checkout fallback), `lib.rs` (Tauri app: single-instance plugin, window built via WebviewWindowBuilder with the injected `bridge.js` init script, four invoke commands: desktop_status / tool_download_info / download_tool / tool_for_endpoint).
- Client (browser behavior unchanged): `lib/desktop-bridge.ts` (typed `window.__LOCALTOOLS__` wrapper — absent in browsers, every call degrades honestly), `engine-client.ts` engineBaseUrl reads the injected port when bridged, `pages/ToolDownloadPrompt.tsx` (spec line 362 one-time friendly prompt + retry/dismiss + Section 13 isolation copy) wired into `EngineRunnerPage` + `DownloaderPage` on `tool-unavailable`.
- Engine bundle: `apps/desktop/scripts/build-engine-dist.mjs` — engine build → `pnpm deploy --prod --legacy` isolation (119MB self-contained) + optional pinned node runtime; Tauri resource; live-verified standalone (healthz + SSRF round trip) before wiring.
- Extraction strategies all live-probed pre-code (D-034): GS 7z-SFX, Tesseract NSIS (NOT Inno — innoextract 1.9 rejects it), LibreOffice msiexec /a (real conversion verified), piper/ffmpeg/qpdf zips, 7zr→7z bootstrap chain.
- CI: `desktop-build` job (ubuntu) — rustup cache-less install of the pinned toolchain deps, engine-dist build, cargo build + cargo test (mock-server pipeline, no network) + `--ignored` sidecar healthz smoke + release build. Unsigned-app bypass steps + one-time-download story added to README (spec line 399).

## What's left

- ffmpeg.wasm small-clip browser path (Group A; deferred per D-021 — schedule after Phase 9)
- ~~Phase 10 — Tauri desktop shell + sidecar + lazy downloads~~ (complete — see above; manual click-through checklist pending owner run, TESTS.md)
- ~~Phase 11 — Integration polish~~ (complete — unified error copy + health gating + consistent progress + batch polish, D-039/D-040; first client test suite added)
- Phase 12 — accessibility/responsiveness · Phase 13 — test/CI finalization (incl. wiring PWA/offline + worker-offload checks into `pnpm verify`) · Phase 14 — performance/size · Phase 15 — docs & v1.0.0 release (incl. flipping the repo back to public per D-010, enabling the desktop release matrix + updater decision per D-037)

**Phase 11 — Integration polish (health gating, progress, error states, batch)**

- **Unified error copy (D-039)**: `apps/client/src/lib/tool-errors.ts` — one home for every taxonomy's human-readable copy (pdf / image / devtext / speech / engine / desktop-bridge) + `friendlyError(err, scope)` that resolves code→copy and always falls back to a friendly sentence, never a technical message. All five runner frames (ToolRunnerPage, ImagePageSpec, DevTextRunner, MediaSpeechPageSpec, DownloaderPage/EngineRunnerPage) render through it; the per-page ERROR_TEXT maps are gone. The "no raw/unstyled error anywhere" acceptance is test-enforced: `apps/client/test/tool-errors.test.ts` extracts every code from each package's own error-union source and asserts copy exists.
- **Engine health gating (D-039)**: `lib/engine-health.ts` (bridge `desktop_status` in the shell, GET /healthz elsewhere; base URL shared via `lib/engine-url.ts`) + `hooks/useEngineTooling.ts` (probe on mount, re-probe on `engine://ready`, gate-before-run, tool-unavailable→download-prompt routing, green installed-confirmation note). Wired into ALL FOUR engine surfaces — EngineRunnerPage, DownloaderPage (Preview gate), text-to-speech, pdf-to-audiobook (TTS + audiobook previously had no download-prompt flow; the Rust `tool_for_endpoint` already mapped them → piper). Engine-down renders a styled warning banner + "Check again"; the rest of the app stays usable (Section 13).
- **Consistent progress (D-040)**: `hooks/useFakeProgress.ts` — one app-wide liveness cadence (start 5, +4 per 400ms, ceiling 90; pure unit-tested `nextLivenessPercent`) replacing four drifted per-page tickers. REAL progress where granularity exists: pdf-core `pdfToImage` gained an `onProgress` seam (per rendered page) and image-core `runBatch` (per file); pdf/image worker clients gained an additive `{id, progress:{done,total}}` response member — non-opted-in handlers unchanged; `runToolWithProgress`/`runImageToolWithProgress` deliver it to the main thread. pdf-to-image and image batch now show true percentages.
- **Batch polish**: image batch outputs keep their ORIGINAL file names (`photo-localtools.webp`, not `image-3.webp`) — the worker carries input names through, order-preserved.
- **First client test suite**: vitest wired into `apps/client` (25 tests, 4 files): taxonomy copy-completeness, raw-error guarantee (known code → copy never technical; unknown/no-code → friendly fallback; bridge errors → retry copy), engine-health probe paths (mocked fetch + bridge), liveness-ticker semantics, registry dispatch coverage (97 tools, unique ids, valid suites/groups).

**Phase 9 — Media speech & audio (STT, auto-captions, TTS, audiobook, complete)**

- `packages/media-core/src/speech.ts`: Group A STT. `@fugood/node-whisper-wasm` 1.1.3 (MIT, whisper.cpp WASM) behind the D-029 dual-environment contract — browser: package defaults (same-origin asset URLs, single-thread auto-fallback without COOP/COEP, Cache-API model caching); Node: `configureWasm({threads:false})` ONE-SHOT guard + `instantiateWasm` hook with locally-read bytes + FS-preseeded model at `/models/<file>` (no network in tests). Model tiers pinned from ggerganov/whisper.cpp with HF LFS SHA-256 (tiny.en 921e4cf8…, base.en a03779c8…, small.en c6138d6d…). WAV decode (16-bit PCM + float, stereo→mono mix) + linear 16kHz resample + SRT/VTT builders (the VTT first-comma replace bug was caught by tests and fixed). Absent/corrupt model in the Temp cache → honest `model-download-failed` with retry copy; never a hidden fetch.
- `apps/engine` speech layer: `speech/voices.ts` (3 curated MIT voices — en_US-lessac/amy, en_GB-alba, medium ~63MB — lazy-downloaded from rhasspy/piper-voices with per-file SHA-256 verification against HF LFS oids + computed json digests; corrupted cache fails the digest gate and redownloads — tested), `speech/piper-tools.ts` (TTS + audiobook: pdfjs v6 single-parse chapter extraction with a COPIED buffer — pdfjs detaches what it is handed — outline chapters or flat fallback; ≤800-char sentence-boundary chunks, ≤500 chunks, ≤5MB text caps per D-030; per-chunk Piper WAVs concatenated via ffmpeg; RIFF/WAVE output sniff), `routes/media-speech.ts` (`POST /media/text-to-speech` options-only like html-to-pdf, `POST /media/pdf-to-audiobook` PDF upload; both behind the Phase 4 GroupBRequestHarness — no new security surface; Piper text travels via stdin, never argv or logs). `subprocess.ts` gained an optional `stdinData` (pipe-then-close, EPIPE-tolerant). Piper resolution in tool-paths.ts: env → repo-local `piper-<tag>/` (gitignored) → Docker `/opt/piper/piper` → PATH; ENOENT → honest 503.
- Fixtures: `fixtures/media/sample-speech.wav` — Piper-generated (en_US-lessac-medium) saying "The quick brown fox jumps over the lazy dog. LocalTools speech test." (D-028: the spec's sample-short.mp3 is a 440Hz sine tone that can never satisfy "roughly-correct text"). Committed bytes are the source of truth; regenerate via `apps/engine/scripts/regenerate-speech-fixture.ts`. The exact committed fixture was live-verified to transcribe exactly via tiny.en before committing. Assertions are keyword-set (≥4 of 6 non-rare words), P(fail) < 1e-4 (a8b196c discipline).
- Tests: 18 engine (`media-speech.test.ts`: TTS/audiobook happy paths with the REAL Piper, zod gates, magic-byte/size/empty gates, no-Piper 503 + /healthz stays alive (Section 13), corrupted-cache retry heals, chunkText limit units) + 17 media-core (`speech.test.ts`: real WASM transcription of the fixture with keyword-set assertions, SRT/VTT builders, WAV decode/stereo/resample units, honest degradation when the model cache is cold — the CI contract).
- Client: `media.worker.ts` + `media-worker-client.ts` (frozen image-worker bridge pattern; whisper + media-core load lazily inside the worker — Vite code-splits them out of the entry) + `MediaSpeechPageSpec.tsx` (transcribe + captions worker pages; TTS + audiobook engine pages) + ToolPage dispatch. Initial JS 422.82KB raw / **118.96KB gzipped** (budget 250KB gzipped); the 4.1MB whisper WASM + models are lazy chunks/runtime fetches.
- Docker: engine image installs piper_linux_x86_64.tar.gz from the 2023.11.14-2 release, SHA-256-pinned (a50cb45f… — no upstream checksums, our pin is the verification, D-030) at /opt/piper with a build-time `--version` sanity run; CI compose-stack gained a speech round-trip (text-to-speech through the containerized engine).

## Key architectural decisions made so far

D-020 (ffmpeg: BtbN GPL static build, subprocess-boundary reasoning — same as Ghostscript), D-021 (ffmpeg.wasm small-clip path deferred, not dropped — routing design recorded for its implementing phase), D-022 (media fixtures self-generated → license-clear by construction), D-023 (merge re-encodes; trim lossless-by-default), plus D-039/D-040 (Phase 11: unified error copy + engine health gating; real worker progress via additive message contract + unified liveness ticker), D-018/D-019 (devtext serializer + QR PNG encoder), D-016 (background-removal: onnxruntime + Apache-2.0 u2netp), D-017 (@jsquash Node init), D-015 and earlier calls, all detailed in [DECISIONS.md](DECISIONS.md): MIT license with subprocess-boundary reasoning for AGPL/GPL deps (D-001); loopback-only stub engine until security phases land (D-002); Node 22 LTS + pnpm 10 pinned (D-003); repo private during build, public flip in Phase 15 (D-010); Stitch-derived token system (D-011); Lighthouse-PWA reinterpretation + TTS→Phase 9 (D-012); vitest harness + committed fixtures + maxBytes seam (D-013); D-014 canvas strategy — pdfjs auto-factory + `@napi-rs/canvas` as pdfjs's own optionalDependency (zero new direct deps), OffscreenCanvasFactory for browser Workers, fs-path asset URLs in Node.

## Known issues / tech debt

- Engine's Section 5 control set covers PDF/media Group B (Phase 4/7) and the Group C downloader's Section 5.8 SSRF set (Phase 8). The SSRF guards are proven against the local mock; before Phase 13, consider one adversarial re-review pass (bounty-style) of ssrf-guard.ts.
- `apps/desktop` ships the full Tauri shell (Phase 10); its manual click-through checklist (TESTS.md) is pending the owner's run on a clean machine.
- CI is green on `main`; workflow remains untested against PRs/tags until later phases exercise them.
- PWA/offline + worker-offload checks are not yet part of `pnpm verify` (manual scripts today); wiring them in is scheduled for Phase 13.
- Safari/WebKit quirks on the new Worker render path (COOP/COEP, OffscreenCanvas limits) untested — Section 13 lists Safari WASM testing as required; schedule it during Phase 12/14 rather than assuming.
- Redaction's v1 contract: text removal is genuine; image XObjects inside a box are covered visually but not pixel-removed (true image redaction needs the render pipeline — noted in-code as a future enhancement, consistent with the spec's algorithm).

## How to run the project right now

```bash
pnpm install          # pnpm-lock.yaml is committed
pnpm dev              # client → http://localhost:5173 ; engine health → http://127.0.0.1:8787/healthz
pnpm build            # all workspaces (client build also copies /pdfjs/* and /wasm/qpdf.wasm assets)
pnpm verify           # format + lint + typecheck + 574 tests (165 pdf + 130 engine + 65 image + 172 devtext + 17 media-core + 25 client) + build gate

# Phase 7 surface: every Media Group B tool card is live at #/tool/<id> —
# video/audio convert, compress, trim, merge, extract-audio, GIF, subtitles,
# loudness, resolution — each POSTs to the engine's /media/* endpoints.
# The engine needs ffmpeg/ffprobe: it auto-detects the repo-local
# ffmpeg-n9.0-latest-win64-gpl-9.0/ portable build (gitignored); on other
# hosts set LOCALTOOLS_FFMPEG_PATH or install ffmpeg on PATH. Docker ships
# apt ffmpeg inside the engine image.
#
# Phase 8 surface: the Media suite's Universal Downloader card is live
# (#/tool/universal-downloader) — paste a link, preview, pick quality,
# download. The engine auto-detects the repo-local yt-dlp-2026.08.19/
# portable exe (gitignored); otherwise set LOCALTOOLS_YTDLP_PATH or
# install yt-dlp on PATH. Docker ships pip yt-dlp in the engine image.
#
# Phase 9 surface: transcribe-media + auto-captions run fully in the
# browser (whisper WASM + model download on first use, then offline);
# text-to-speech + pdf-to-audiobook need the engine's Piper (auto-detects
# the repo-local piper-2023.11.14-2/ dir, gitignored; set
# LOCALTOOLS_PIPER_PATH otherwise; Docker ships /opt/piper). Voice
# models lazy-download on first use.
#
# Phase 3 acceptance surface: every PDF Group A tool is live at #/tool/<id> —
# drop a PDF, set options, run; processing happens in the Web Worker.
# Worker-offload check (Section 14.5): build, then:
#   cd apps/client && npx vite preview --port 4173 --strictPort   (own terminal)
#   node scripts/worker-offload-test.mjs                          # expect WORKER_OFFLOAD_PASS
# Offline check (Phase 2): node scripts/offline-test.mjs warmup|verify
```

If the dev server serves stale `@localtools/ui` output after a package rebuild, restart it (Vite's dep-optimize cache doesn't always invalidate workspace deps; deleting `apps/client/node_modules/.vite` also works).
