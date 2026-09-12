# LocalTools — Full Project Review Document

_Compiled 2026-09-12, end of Phase 13 (session 16). Written for an external reviewer with zero prior context. Sources of truth: `PROJECT_SPEC.md` (618 lines, the contract), `DECISIONS.md` (D-001…D-043), `SUMMARY.md`, `TESTS.md`, `HANDOFF.md`, and 67 commits of history. This document intentionally lives OUTSIDE git (uncommitted) — it is a point-in-time review artifact, not a living doc._

**Reviewer instructions:** The most valuable things to scrutinize are marked **[REVIEW]**. The claim-vs-reality discipline in this project is strict — every acceptance below is backed by a committed test, script, or CI run, and unfinished things are labeled unfinished. The single most valuable review pass would be: (1) the SSRF guard (`apps/engine/src/downloader/ssrf-guard.ts`) adversarially, (2) the subprocess/shell discipline end-to-end, (3) whether any of the 43 decisions recorded in `DECISIONS.md` are wrong in substance rather than taste.

---

## 1. What LocalTools is

An open-source, self-hosted, privacy-first alternative to the entire category of rate-limited / paywalled / ad-choked "free tool" websites (iLovePDF-style PDF tools, social-media downloaders, image converters, JSON formatters). **97 tools across 4 suites** (PDF, Media, Image, Text & Dev), every tool free and unlimited, all processing local. Two distribution tiers:

1. **Docker Compose stack** — hardened nginx-served client + Fastify engine, one-command self-host.
2. **Tauri desktop app** — the engine as a restricted child process, native tools lazily downloaded (URL-pinned + SHA-256-verified) on first use.

Core promise (spec Section 0): no telemetry ever, no third-party CDNs, no accounts, honest error states, and every heavy operation either in a Web Worker (client-side tools) or behind a hardened loopback engine (native tools).

Status: **13 of 15 phases complete.** Phase 14 (performance/size pass) and Phase 15 (docs & v1.0.0 release) remain. See §10 for the current blocker.

---

## 2. Repository & tooling architecture

- **Monorepo**: pnpm 10 workspaces (`apps/*`, `packages/*`) + Turborepo 2.x; Node 22 LTS pinned (D-003); strict TypeScript via shared `tooling/tsconfig` presets; shared ESLint/Prettier configs in `tooling/`.
- **Apps**: `apps/client` (Vite 6 + React 18, PWA), `apps/engine` (Fastify 5), `apps/desktop` (Rust + Tauri 2.11).
- **Packages**: `pdf-core`, `image-core`, `devtext-core`, `media-core` (pure tool logic, dual-environment Node/browser), `ui` (tokens + components), `shared-types` (zod contracts shared between client & engine — one source of truth per tool's options schema). Workspace packages export compiled `dist` (D-007) so consumers resolve types from build output.
- **`pnpm verify`** (the one gate to rule everything): `format:check → lint → typecheck → test (580 tests) → build (with 14.5 bundle-size gate as client postbuild) → 14.8 licensing check → worker-offload check → PWA offline check`.
- **Continuity protocol**: `SUMMARY.md` (living state), `HANDOFF.md` (rewritten every session as the exact resume point), `DECISIONS.md` (every non-obvious call, D-001…D-043), `TESTS.md` (every acceptance logged with kind PASS/pending).

---

## 3. System architecture

### 3.1 Client (`apps/client`)

- **Hash router** (`#/suite/:id`, `#/tool/:id`) — no history API, trivially static-hostable. Suite pages with live-search tool grids; 97 per-tool pages; `/dev/ui-preview` renders every UI component in both themes (Phase 1 acceptance).
- **Tool registry** (`lib/tool-registry.ts`): all 97 tools with Lucide icons, suite/group tags (A = client-side, B = engine, C = downloader), build-phase badges; display strings in `i18n/en.json`; a dispatch-coverage test enforces 97 unique ids and a page for every tool.
- **Design system** (`packages/ui`): Stitch MCP design pass ran BEFORE any component code (spec Section 9 mandate); hand-derived tokens in `tokens.css` (`--lt-*` namespace, full light + dark themes, strict type scale, 4px spacing grid). Components: Button, Badge/Card/ToolCard, Field/Input, DropZone (rebuilt in Phase 12 so the native file input IS the interactive control — see D-042), ProgressBar, SuiteNav (wraps <720px, skip-to-content first Tab stop), ThemeToggle.
- **Fonts vendored** (Inter variable + JetBrains Mono, woff2 + OFL licenses) — zero CDNs.
- **PWA**: `manifest.webmanifest`, versioned service worker (precaches the shell, runtime-caches hashed same-origin assets, navigation fallback to cached index.html; no cross-origin caching, no telemetry), full generated icon set. Offline reload is a wired acceptance test (§7).
- **Web Workers** (`workers/pdf|image|devtext|media.worker.ts`, ES-module format so workers can code-split): frozen-bridge typed clients (`lib/*-worker-client.ts`) — the same pattern four times; ToolError taxonomy crosses the Worker boundary; transferable buffers; additive `{id, progress:{done,total}}` progress messages (D-040) so pdf-to-image and image batch show TRUE percentages.
- **Engine client** (`lib/engine-client.ts`): fetch bridge, files as base64 `EngineFile`s, taxonomy-aware copy; reads the desktop's injected port when bridged.
- **Desktop bridge** (`lib/desktop-bridge.ts`): typed `window.__LOCALTOOLS__` wrapper — absent in browsers, every call degrades honestly (the client NEVER imports `@tauri-apps/api`).
- **Unified error copy** (`lib/tool-errors.ts`, D-039): one home for every taxonomy's human-readable copy; `friendlyError(err, scope)` always resolves to a friendly sentence, never a raw technical message; test-enforced: the suite extracts every code from each package's error-union source and asserts copy exists (the "no raw/unstyled error anywhere" acceptance is a test, not a hope).
- **Engine health gating** (`lib/engine-health.ts` + `useEngineTooling`): probe on mount, re-probe on `engine://ready`, gate-before-run; tool-unavailable → `ToolDownloadPrompt` (desktop) or styled warning + "Check again" (Docker); the rest of the app stays usable when the engine is down (Section 13).
- **Liveness ticker** (`useFakeProgress`): one app-wide indeterminate cadence (start 5, +4 per 400ms, ceiling 90, pure unit-tested function) — real progress replaces it wherever granularity exists.

### 3.2 Engine (`apps/engine`, Fastify 5)

- **Loopback-only by default**; binding beyond localhost requires `LOCALTOOLS_EXPOSE=true` AND a ≥32-char `LOCALTOOLS_AUTH_TOKEN`, else boot refusal (tested).
- **The request harness** (`request-harness.ts`) owns the full spec-Section-5 control set for every Group B/C endpoint — no route reimplements security: stream-level multipart size caps (envelope-mapped 413), `file-type` magic-byte validation per tool, **fresh internal filenames in per-request temp dirs** (user filenames never touch the filesystem), finally-removal + 5-minute sweeper, zod option schemas (the very schemas from `shared-types`), subprocess concurrency cap → deterministic 429 `engine-busy`, anonymous-id logging (never filenames — Section 5.6, asserted in tests).
- **Subprocess discipline** (`subprocess.ts`): `spawn` with argument arrays ONLY, `shell: false` hardcoded, NUL-byte argv rejection before spawn, SIGTERM→SIGKILL + `taskkill /T` on Windows, `windowsHide`, optional `stdinData` (pipe-then-close, EPIPE-tolerant — Piper text never touches argv or logs). **[REVIEW]** This is guarded three ways: functional tests (hostile filenames process fine via internal names), a static canary test (`test/shell-canary.test.ts`, bans `shell:true`/`exec`/spawn-without-`shell:false` in every `child_process` importer), and the canary was live-proven by flipping `shell:false→true` (see §7).
- **Security plugins**: strict CSP + `nosniff` + `Referrer-Policy: no-referrer` + `frame-ancestors 'none'` on every response, exact-origin CORS (never a wildcard), bearer auth when exposed.
- **`/healthz`**: alive + busy/capacity — the health gate's data source.
- **Routes**: `/pdf/*` (6 Group B endpoints), `/media/*` (14 conversion + 2 speech), `/downloader/*` (metadata + download). All option schemas shared with the client; responses envelope-mapped (`{ok, data|error}`) with the taxonomy's stable codes.
- **Tool resolution** (`tool-paths.ts`): env override → repo-local portable build (gitignored) → Docker path → PATH, per tool; missing tool → honest 503 `tool-unavailable`, never a 500.
- **Group B PDF**: office-conversion (LibreOffice with pinned `writer_pdf_import`/`impress_pdf_import` filters + explicit OOXML export; PDF→xlsx rejected with a clear error — no Calc PDF import exists), OCR (OCRmyPDF or Ghostscript+Tesseract fallback), deep-compress, pdf-a, deep-repair (Ghostscript), html-to-pdf (WeasyPrint via per-request `@page` stylesheet, Windows GTK launcher script; Playwright strictly opt-in → 503, never a silent fallback) — D-015.
- **Group B Media**: 14 ffmpeg endpoints via `media-tools.ts` (see §5.2); **every conversion route probes its own OUTPUT with ffprobe and asserts container/codec/dimensions/bitrate match the request** before returning — "ffmpeg exited 0" alone never satisfies a route (spec 14.5).
- **Speech**: `text-to-speech` (Piper) and `pdf-to-audiobook` (pdfjs chapter extraction with a COPIED buffer — pdfjs detaches what it's handed; ≤800-char sentence-boundary chunks, ≤500 chunks, ≤5MB caps per D-030; per-chunk WAVs concatenated via ffmpeg; RIFF sniff) — rides the same request harness (D-031, no new security surface).

### 3.3 Group C downloader (the highest-risk feature — spec 5.8)

`routes/downloader-group-c.ts` (JSON bodies; downloader-specific rate limit BEFORE any work; URL-free logging) + three modules:

- `ssrf-guard.ts` — **[REVIEW: the single most valuable adversarial target in the codebase]**: scheme validation (http/https only); initial host resolve + classification before ANY subprocess exists; then a **loopback-only validating forward proxy**: yt-dlp runs with `--proxy` pointed at it, so every connection — including redirect hops and CONNECT tunnels — re-validates scheme + freshly resolved IPs against loopback/private/link-local/CGNAT/ULA/NAT64/multicast/reserved ranges (169.254.169.254 covered) on every hop.
- `ytdlp.ts` — sandboxed arg builder + runner: argument arrays only, `--no-config-locations --no-plugin-dirs --no-remote-components --no-exec --no-cache-dir --socket-timeout 30 --restrict-filenames --windows-filenames` (each verified against the installed binary's `--help`), production extractor set `all,-generic` (no raw-fetch fallback), wall-clock timeout, mid-download size watchdog.
- `rate-limit.ts` — separate window from the engine-busy 429, distinct error code.

Plus: pre-download duration gate (Section 8 cap), remote-metadata filename sanitization (traversal/`..`/null bytes → sanitized), livestreams explicitly unsupported (D-024), error taxonomy (`unsupported-site`, `blocked-host`, `rate-limited`, `too-long`, `download-too-large`).

Tests (30, `downloader.test.ts`) run against a **local mock HTTP target** (D-026 — CI never touches live sites): loopback/private/link-local/metadata rejection with ZERO outbound requests (hit-log asserted), redirect-chain-to-private blocked at the hop, scheme rejection, production-extractor rejection with zero hits, oversized drip aborted mid-flight with no file kept, rate-limit distinctness, malicious-title sanitization, duration gate, happy paths (mp4 ftyp / mp3 ID3 / srt / playlist-items) with honest 503 degradation verified both ways (binary present and absent). A static canary test enforces that no engine module outside the guard can fetch a user URL.

### 3.4 Desktop app (`apps/desktop`, Rust + Tauri 2.11)

- **lib+bin split** so cargo tests exercise the shipped code. Modules: `manifest.rs` (every lazy-downloadable tool: pinned URL + SHA-256 per artifact, per-OS layouts, engine env bindings — D-034), `downloads.rs` (streaming SHA-256-verified download; per-format extraction probed LIVE before coding: GS 7z-SFX, Tesseract NSIS via innoextract-rejection discovery, LibreOffice `msiexec /a`, tar for Linux, piper/ffmpeg/qpdf zips, 7zr→7z bootstrap; `.installed` marker only after FULL success — half-installs never look installed), `sidecar.rs` (engine as a restricted child process — minimal env, scoped temp, 127.0.0.1, healthz wait; shutdown via taskkill-tree on Windows and process-group/libc::kill on Unix — D-033, never the kill builtin), `paths.rs`, `lib.rs` (WebviewWindowBuilder + injected `bridge.js` init script; four invoke commands: `desktop_status`, `tool_download_info`, `download_tool`, `tool_for_endpoint`).
- The client never knows it's in Tauri except through `window.__LOCALTOOLS__` — browser behavior unchanged.
- **Engine bundle**: `build-engine-dist.mjs` — engine build → `pnpm deploy --prod --legacy` isolation (119MB self-contained, includes a pinned Node runtime as a Tauri resource) — D-038.
- **Updater OFF in v1.0** (D-037): unsigned-app bypass steps documented for each OS in the README; the release matrix ships with Phase 15's signing decision.

### 3.5 Docker tier

- `docker/engine.Dockerfile`: multi-stage — build stage (pnpm install/build/prune-deploy), runtime `node:22-bookworm-slim` + ghostscript + tesseract-ocr + eng + libreoffice + ffmpeg + pip weasyprint/yt-dlp + piper (release tarball, **our SHA-256 pin is the verification** — upstream ships none, D-030) + build-time `--version` sanity run; **npm CLI stripped from the runtime image** (Phase 13: Trivy found 1 CRITICAL + 10 HIGH, all in npm's own tree — CVE-2026-59873 tar et al; the runtime needs only `node`; ~80MB smaller); non-root `USER node`; healthcheck against `/healthz`.
- `docker/client.Dockerfile`: nginx, unprivileged.
- `docker-compose.yml`: `no-new-privileges:true`, `cap_drop: ALL`, `read_only: true`, tmpfs mounts; engine published on `127.0.0.1:8787` only; optional caddy edge profile for power users.

### 3.6 Data-flow contracts (the three processing tiers)

1. **Group A (client-side, 73 tools)**: file never leaves the browser; a typed Worker bridge runs `@localtools/*-core`; progress messages cross the boundary; result blobbed for download. Verified off-main-thread by the 50MB worker-offload check.
2. **Group B (engine, 23 tools)**: client POSTs multipart (options validated by the SAME zod schema the client used); harness validates/sniffs/caps; native tool runs via argument-array subprocess; output sniffed (magic bytes / ffprobe / RIFF) before return; base64 back over loopback.
3. **Group C (downloader, 1 tool)**: URL in, SSRF gauntlet, validating proxy, sandboxed yt-dlp, sanitized file out.

---

## 4. The design/doc infrastructure

- **PROJECT_SPEC.md** (618 lines): the contract — Sections 1-17 cover tree, tools, tech, security (5.1-5.8), UX, distribution, NFRs, the 14.x test definitions, 15 build phases, 16 out-of-scope, 17 continuity templates.
- **DECISIONS.md**: 43 numbered decisions, each with rationale; entries marked **[required-by-CI]** are grepped for by the licensing job (D-001 Ghostscript AGPL reasoning, D-016 background-removal outcome, D-020 ffmpeg variant, D-025 yt-dlp, D-026 mock-downloader, D-027/D-029/D-030, …).
- **TESTS.md**: every acceptance from every phase with kind (automated-local / automated-CI / manual) and PASS/pending + evidence.
- **HANDOFF.md**: rewritten every session; a zero-context session resumes from it alone.

---

## 5. The 97 tools (all implemented)

### 5.1 PDF suite — 26 Group A + 8 Group B = 34

Group A (all in `@localtools/pdf-core`, pdf-lib + pdfjs legacy-build + qpdf-wasm + pixelmatch; 165 tests): merge, split (every-N/by-size), extract, delete, organize, rotate, crop (CropBox margins, MediaBox untouched), page numbers, text watermark, pdf-to-image (PNG/JPEG via the D-014 canvas pipeline), image-to-pdf (magic-byte sniffing), scan-to-pdf (CameraCapture component), sign-pdf (typed/drawn/image visual signature via SignaturePad — Section 7's no-legal-e-signature boundary respected), protect/unlock (qpdf-wasm singleton, arg-array callMain), optimize-linearize, **redact-pdf** (genuine: strings removed from content streams + black box drawn — the spec 14.3 mandatory test asserts the redacted string is absent from raw bytes AND text layer) + redact-by-text (pdfjs text positions → rects), compare-pdfs (text), quick-compress, repair, fill/read forms, edit/read metadata, resize, n-up, grayscale (render→BT.601→re-embed), visual compare (pixelmatch, auto-routes scanned docs per Section 13, diff overlay), pdf-to-text. Shared `loadPdf`: size-cap-before-parse, `/Encrypt` trailer sniff, zero-page detection.

Canvas strategy (D-014): pdfjs 6 auto-selects its factory per environment — Node renders through its internal `NodeCanvasFactory` → `@napi-rs/canvas` (pdfjs's OWN optionalDependency — zero new direct deps); browser Workers get `OffscreenCanvasFactory`; 64MP render cap; guaranteed teardown.

Group B (8 engine endpoints, §3.2): word/excel/powerpoint conversion, ocr, deep-compress, pdf-to-a, deep-repair, html-to-pdf. Client pages via `EngineRunnerPage`; multi-file contract (merge/burn) order-hinted.

### 5.2 Media suite — 14 Group B + 1 Group C + 3 speech = 18

Group B (ffmpeg, 43 tests incl. 14.5 ffprobe sanity): video converter (mp4/webm/mov/mkv/avi; libx264/libvpx-vp9), video compressor (CRF 28/23/20 + optional maxrate/bufsize), trimmer (lossless `-c copy` default, keyframe-slop labeled; re-encode for exact), merger (concat demuxer + re-encode — D-023: re-encode, no `-c copy` concat), extract-audio (mp3/wav/flac/ogg/aac/m4a), video→GIF (palettegen+paletteuse two-pass), GIF→video (anullsrc pairing for silent GIFs), audio converter, audio compressor (target bitrate), audio trimmer (stream copy), loudness normalizer (EBU R128 loudnorm; video input stream-copied), burn-subtitles (libass via engine-escaped filter path, srt/vtt), resolution/aspect changer (resize/crop/pad, aspect computation, mod-2 clamps, yuv420p).

Group C: universal-downloader (`DownloaderPage`: URL input, metadata preview card, format/quality + audio-only + subtitles, playlist queue with checkboxes, progress, one-time dismissible legal notice persisted in localStorage).

Speech: transcribe-media + auto-captions (whisper.cpp WASM via `@fugood/node-whisper-wasm` 1.1.3 — D-029 dual-environment contract: browser uses package defaults/same-origin assets/single-thread fallback without COOP/COEP, Node gets a one-shot `configureWasm({threads:false})` + locally-read bytes + FS-preseeded model; model tiers pinned from whisper.cpp's HF ggml repo with LFS SHA-256; WAV decode + linear 16kHz resample; SRT/VTT builders) and text-to-speech + pdf-to-audiobook (Piper 2023.11.14-2 — D-030: three curated MIT voices lazy-downloaded from rhasspy/piper-voices with per-file SHA-256 verification against HF LFS oids; corrupted cache fails the digest gate and redownloads — tested).

### 5.3 Image suite — 14 Group A (`@localtools/image-core`, 65 tests)

format converter (png/jpeg/webp/avif via @jsquash WASM codecs — D-017 manual binary init in Node; hand-rolled BMP both ways; gif/tiff honestly unsupported), compressor (PNG lossless-only stated honestly), resizer (exact/percent/max-dimension, aspect lock, box-average downscale), batch runner (50-file cap, fail-loud, ORIGINAL filenames preserved), background-remover (**D-016**: spec's `@imgly/background-removal` is AGPL → the spec's own fallback chosen: onnxruntime + Apache-2.0 u2netp; lazy-download + cache; verified real inference), HEIC→JPG/PNG (libheif-wasm), base64 data-URI both ways (25MB cap), favicon generator (real ICO container + 16/32/180/192/512 PNGs + snippet), palette extractor (in-house k-means), EXIF viewer + **byte-genuine stripper** (drops APP segments; the 14.1-style acceptance greps the output bytes for EXIF/GPS markers — verified absent, not just viewer-hidden), SVG optimizer (svgo, viewBox kept), meme generator (built-in 5×7 bitmap font, stroke-under-ink two-pass), screenshot annotator (box/arrow/mosaic — blur is real pixel averaging), image OCR (tesseract.js, lazy traineddata).

### 5.4 Text & Dev suite — 30 Group A + zip/unzip (`@localtools/devtext-core`, 172 tests)

Formatters: JSON (format/minify/validate with line/column errors), YAML↔JSON (js-yaml), CSV↔JSON (papaparse), XML (fast-xml-parser). Encoders: Base64 text+file, URL encode/component/decode, JWT decode/inspect (signature-NOT-verified note per spec), hashes (Web Crypto SHA-1/256/512 + spark-md5; file hash checker). Generators: UUID v4, ULID (**in-house** Crockford base32 over crypto bytes — see D-042 bug), 9 case kinds, NFKD slug, lorem, password/passphrase (rejection-sampled crypto chars, entropy bits + strength band), unit converter (8 categories, temperature affine, KB-vs-KiB). Dev: regex tester (group breakdown, zero-length-loop guard), text diff (jsdiff), minify/beautify (csso/terser/html-minifier-terser/prettier — **prettier/standalone + explicit plugins** after D-042), Markdown→HTML (marked GFM), HTML→Markdown (**in-house htmlparser2 serializer**, D-018 — turndown needs a live DOM), Markdown→PDF (pdf-lib typesetting, paginating, WinAnsi-safe). Color: in-house oklch (CSS Color 4 matrices) + hex/rgb/hsl, 4 palette harmonies, gradient CSS. Time: cronstrue with field breakdown, timestamp converter (s/ms auto, IANA, relative). QR/barcode/web: QR SVG + real PNG (**in-house 1-bit PNG encoder** via fflate zlibSync, D-019) + jsQR scan (image-core decode reuse), bwip-js 9 barcode formats, faker (seeded, synthetic-note), fflate zip/unzip with traversal-name rejection, sitemap.xml/robots.txt (no network, structural validation), OG preview (meta parser + form builder + visual card).

---

## 6. Security architecture summary (spec Section 5, all implemented + tested)

| Control                   | Implementation                                                                                                                       | Test proof                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 5.1 network bind / expose | loopback default; boot-refusal on EXPOSE w/o 32-char token; bearer auth                                                              | security.test.ts (bind, boot-refusal, auth)            |
| 5.2 upload gauntlet       | stream caps, magic bytes, internal names, temp lifecycle, 429                                                                        | security.test.ts (15 tests)                            |
| 5.3 subprocess            | arg arrays, shell:false, NUL rejection, timeouts, tree-kill                                                                          | security tests + shell-canary.test.ts (live-proven)    |
| 5.4 container hardening   | non-root, read-only, cap-drop, no-new-priv, pinned tools, Trivy in CI                                                                | compose-stack + supply-chain CI jobs                   |
| 5.5 supply chain          | committed lockfiles, pnpm audit gate (fail high/crit), cargo audit, Trivy HIGH/CRITICAL, Dependabot config, SHA-256-pinned downloads | CI jobs (all green where run)                          |
| 5.6 logging privacy       | op type, duration, anon id — never filenames/URLs                                                                                    | asserted in downloader tests                           |
| 5.7 app-layer headers     | CSP, nosniff, no-referrer, frame-ancestors, exact-origin CORS                                                                        | header tests                                           |
| 5.8 SSRF (Group C)        | validating forward proxy, per-hop re-validation, sandboxed yt-dlp                                                                    | 30 downloader tests vs local mock, zero-hit assertions |

Known honest limits: the SSRF guards are proven against the local mock; a bounty-style adversarial re-review of `ssrf-guard.ts` is recommended before v1.0 (listed as tech debt). Redaction covers text + visual image XObjects but not pixel-removal of image content (in-code note; consistent with spec's algorithm).

---

## 7. Testing & CI (the Section 14 suite, wired in Phase 13)

**Local `pnpm verify`** (10-12 min, fully green): format + lint + typecheck + **580 tests** (165 pdf + 133 engine [82 Group B + 30 downloader + 18 speech + 2 shell-canary + 1 security addendum] + 65 image + 172 devtext + 17 media-core + 28 client) + build with **14.5 bundle gate** (client postbuild walks the Vite manifest entry graph, gzip-9: initial = 121.60KB vs 250KB budget) + **14.8 licensing check** (`tools/licensing-check.mjs` greps DECISIONS.md for the five required notes) + **worker-offload check** (self-contained: own `vite preview` :4181, 52MB padded-but-parseable fixture through merge-pdf, PerformanceObserver long-task counter: **0 tasks / 0ms**) + **PWA offline check** (own preview :4182, CDP network emulation offline, SW renders the Media suite with all 18 cards).

**Browser-check anti-wedge discipline** (learned the hard way — three CI hardening rounds): ubuntu runners twice wedged these scripts silently (26-min step; 6-HOUR verify job ended only by the default job timeout). Final form: watchdog armed BEFORE any async work, `withTimeout()` Promise.race on browser launch/close, `--host 127.0.0.1` + `AbortSignal.timeout` readiness probes, explicit `process.exit` both paths, step-level `timeout-minutes: 6`. **[REVIEW]** the two scripts `apps/client/scripts/worker-offload-test.mjs` + `offline-test.mjs` for any remaining unbounded await.

**14.4 shell-string canary acceptance** (spec: "verified once manually then reverted"): `shell:false`→`true` flipped in subprocess.ts — security.test.ts still passed 15/15 (hostile input never reaches argv — layered defense), but the new canary failed `SHELL_CANARY_FAIL: subprocess.ts: shell:true`; reverted; canary committed permanently (import-aware: bans `shell:true`, `exec/execSync`, spawn-without-explicit-`shell:false` in `child_process` importers; RegExp.exec and comment-"spawn" don't false-positive).

**CI jobs** (`.github/workflows/ci.yml`): `verify` matrix (ubuntu+windows; verify + `pnpm audit --audit-level high`), `compose-stack` (Docker build/up + FOUR round-trips through containers: PDF deep-compress, media audio-convert, downloader SSRF rejection, speech TTS), `accessibility` (axe-core on every route × both themes — 206 route-theme scans, 0 violations; 390px responsive check; keyboard sweep on all 103 routes + 4 real keyboard-only tool runs; WebKit WASM smoke incl. qpdf-wasm end-to-end and the no-COOP/COEP contract; worker-offload; offline), `desktop-build` (Linux Tauri build + cargo tests + real sidecar healthz smoke under setsid), `licensing` (14.8), `supply-chain` (Trivy HIGH/CRITICAL on the engine image — `--ignore-unfixed`; cargo audit — plain, unmaintained warnings don't fail). Plus `.github/dependabot.yml` (npm/cargo/actions, weekly — inert until the repo goes public) and `release-desktop.yml` (real three-OS tauri-action matrix, `if: false` until Phase 15 signing — D-037).

**Supply-chain fixes made while wiring the gates** (the gates found real issues immediately): js-yaml 4.3.1→4.3.2 (GHSA-2883-xcg3-v3hh, high — merge-key CPU DoS in the YAML tool's parser), adm-zip 0.6.0→0.6.1 root override (GHSA-vwc7-r8mq-g2x9, moderate, transitive of onnxruntime-node), npm CLI stripped from the engine image (Trivy: tar CVE-2026-59873 CRITICAL + 10 HIGH, all in npm's own bundled tree).

**Phase 12 accessibility recap** (D-042): initial axe scan found 292 critical/serious violations (DropZone nested-interactive pattern = 268 of them) — fixed at source: DropZone rebuilt (native input IS the control), 7 unlabeled selects, light `--lt-text-muted` darkened to 4.39:1→5.78:1. A token-level WCAG test computes real contrast ratios for every composed token pair in both themes and caught 3 states axe can't see (hover/text-role accent fills). **Also fixed a MAJOR pre-existing bug**: every Text & Dev tool had been broken in real browsers since Phase 6 — the devtext worker threw at module-eval (ulid's `detectPrng()` needs `window`; clean-css/terser read `process.platform` at init; prettier's browser bundle can't resolve parsers) while 172 Node tests stayed green. Lesson recorded: Node-only suites cannot catch module-eval environment assumptions — Worker-imported packages must be exercised IN a Worker (now guarded by the keyboard sweep + WebKit smoke).

---

## 8. Decision log (D-001 … D-043, one line each — full rationale in DECISIONS.md)

**Licensing & native-tool supply**

- **D-001** MIT for LocalTools; AGPL/GPL deps (Ghostscript, ffmpeg, AGPL @imgly) OK via subprocess/boundary reasoning — **[required-by-CI]** note.
- **D-016** Background-removal: @imgly is AGPL → spec's fallback chosen (ONNX Runtime + Apache-2.0 u2netp).
- **D-020** ffmpeg: BtbN GPL static build, subprocess boundary. **D-025** yt-dlp: standalone per-OS exe (dev, SHA-verified) + pip (Docker).
- **D-030** Piper: release binary, our SHA pin is the verification (upstream ships none). **D-034** every desktop lazy-download: URL-pinned + SHA-256 + live-probed extraction formats. **D-036** Linux desktop limited to tools with official portable artifacts.
- RAR (bonus v1.1 tool, not built): extraction-only constraint recorded as forward note.

**Scaffold & infra**

- **D-002** stub engine minimal until security phases. **D-003** pnpm 10 + Node 22 pinned. **D-004** Turbo 2.x tasks schema. **D-005** release workflow committed disabled. **D-006** SECURITY.md contact placeholder. **D-007** packages export dist. **D-008** `tooling/` dir. **D-009** verify composition. **D-010** repo PRIVATE during build, public flip in Phase 15.

**Design & client**

- **D-011** Stitch direction → hand-derived tokens. **D-012** Lighthouse-12 PWA category removed upstream → acceptance reinterpreted to installability + offline-reload proof; TTS moved to Phase 9; puppeteer-core (no Chromium download) as devDep.
- **D-039** unified error copy + engine health gating. **D-040** real worker progress via additive message contract + one liveness ticker.

**PDF**

- **D-014** canvas: pdfjs auto-factory; `@napi-rs/canvas` as pdfjs's own optionalDep (zero direct deps); OffscreenCanvasFactory in browser Workers. **D-015** engine: OCR fallback chain, LibreOffice pinned filters, WeasyPrint Windows launcher, Docker validation in CI (dev host has no Docker).

**Image / DevText**

- **D-017** @jsquash manual WASM init in Node. **D-018** HTML→Markdown in-house serializer (turndown needs live DOM). **D-019** QR PNG: in-house 1-bit encoder (fflate zlibSync, NOT deflateSync).

**Media**

- **D-021/D-032** ffmpeg.wasm small-clip browser path DEFERRED (routing design recorded; revisit before v1 tag). **D-022** media fixtures self-generated → license-clear by construction. **D-023** merge re-encodes; trim lossless-by-default. **D-024** livestreams unsupported. **D-026** downloader tests vs local mock; production extractors stay disabled. **D-027** SSRF shape: validating forward proxy per request. **D-028** speech fixture generated with Piper itself; keyword-set assertions (P(fail) < 1e-4). **D-029** whisper packaging + dual-environment contract + no-COOP/COEP requirement. **D-031** TTS/audiobook ride the Phase 4 harness.

**Desktop**

- **D-033** sidecar = restricted spawned process, not Tauri externalBin. **D-035** "qpdf fallback" = plumbing only; qpdf-wasm stays engine of record. **D-037** updater OFF until signing; per-OS bypass steps. **D-038** engine bundle via pnpm deploy --legacy + pinned node runtime.

**Testing / CI**

- **D-013** vitest per-package, committed fixtures, `maxBytes` seams for oversized tests. **D-041** per-suite temp-root isolation for parallel suites.
- **D-042** Phase 12: the 292-violation fix set, token WCAG math, the devtext module-eval discovery (in-house ULID, process shim, prettier/standalone), skip-link button, ThemeToggle in production nav.
- **D-043** Phase 13: manifest-walked bundle gate (counts entry JS+CSS), browser-level offline check, canary committed permanently, Trivy `--ignore-unfixed`, audit gate covers dev deps, adm-zip override, npm stripped from image, cargo audit without `--deny warnings` (Tauri's unmaintained-crate advisories aren't removable), dependabot inert-until-public, release matrix gated to Phase 15.

---

## 9. What remains (Phases 14–15)

1. **Phase 14 — performance & size**: Lighthouse re-measure on the current build (Phase 2 baseline: perf 82 / a11y 100 / BP 100 / SEO 91 — recorded before 90+ tools landed); Docker image size note (Section 11) in README; bundle numbers already gated.
2. **Phase 15 — docs & release**: full README (screenshots, quick-starts, tool list, Mermaid diagram), LEGAL.md (Section 6), CONTRIBUTING.md, TESTS fully logged, DECISIONS finalized vs 14.8, **public flip (D-010 — activates Dependabot)**, **signing/updater decision (D-037 → un-gate the three-OS release matrix)**, tag v1.0.0.
3. **Owner manual items before v1.0.0** (TESTS.md): desktop click-through on a clean machine/VM (one tool per suite, zero terminal), screen-reader spot-check ×4 suites, true macOS Safari hardware pass (OffscreenCanvas limits on the pdf render path is the specific watch-item).
4. **Open question for the reviewer/owner**: ffmpeg.wasm small-clip rider — ship in v1 or move to roadmap (D-021/D-032).

---

## 10. Current state & the blocker (read this first if resuming)

- Branch `phase-13-ci-finalization`, PR **#1** (the repo's first PR), head `086ea8b`. Phase 13 is code-complete; local verify fully green with every gate.
- **CI proven green pre-blocker**: compose-stack, licensing, supply-chain (Trivy + cargo audit), verify(windows) [incl. browser checks], desktop-build — 5/7 on run 34644521693. The two failures there were the browser-check wedges, root-caused and fixed in `9e2af40` (anti-wedge discipline) — verified locally, **never CI-proven because of the blocker**.
- **THE BLOCKER**: run 34710264986 — all 7 jobs rejected: _"recent account payments have failed or your spending limit needs to be increased."_ GitHub Actions billing died (plausibly drained by the 6-hour wedged job + ~8 fix-forward reruns). Owner must fix Billing & plans; then re-run PR #1; then merge = the Phase 13 acceptance ("CI green on a clean PR") completes.
- **CI-minutes note for the next session**: the browser checks currently run TWICE per push (inside verify's tail AND as accessibility-job steps). A `LOCALTOOLS_SKIP_BROWSER_CHECKS=1` env on the verify matrix would halve that burn — recommended, undecided (record in DECISIONS if adopted). Also consider a root-level `timeout-minutes` for the verify jobs (the 6-hour hang was only ended by GitHub's default).

---

## 11. Honest tech-debt register

- SSRF guard: proven vs local mock; adversarial re-review recommended pre-v1 (§6) — **post-review update: done** (C1 verified clean, C2 hardened, IPv6 CONNECT fixed; see D-044).
- One monitored manual run of the real downloader binary against real public URLs before v1.0.0 (review H4 — the mock can't reproduce hostile extractor responses, real redirect/DNS timing, or `--proxy` behavior on non-standard transports).
- Browser-check flakiness on hosted runners: fixed in code, first CI proof pending (billing).
- Redaction: image XObjects covered visually, not pixel-removed (future enhancement noted in-code). **User-facing warning shipped at the point of use (review H2, D-044).**
- ffmpeg.wasm small-clip path: **CUT from v1.0.0 by owner decision (D-044 supersedes D-021/D-032)** — moved to the README roadmap as post-1.0 maybe.
- Verify-matrix jobs lack explicit job timeouts; browser checks double-burn (§10).
- Workflow never tested against tags (release-desktop is `if: false` until Phase 15).
- Dependabot inert until the public flip — **explicit coverage note (review M7): repo-private-during-build means dependency-graph/Dependabot alerts had zero continuous coverage for the entire build period; supply-chain coverage was point-in-time only (CI Trivy/audit runs per push). Tied to the Phase 15 public flip (D-010).**
- Trivy blind spot (review M1): `--ignore-unfixed` hides HIGH/CRITICAL base-layer CVEs with no upstream fix — a necessary-but-real gap (D-043), re-checked per release; the §6 "5.4 container hardening" table row carries this caveat, not an unconditionally-clean reading.

_End of review document. For verification, the repo itself is the source of truth: `PROJECT_SPEC.md`, `DECISIONS.md`, `TESTS.md`, `SUMMARY.md`, `HANDOFF.md`, and the commit log (67 commits, conventional style, fix-forward only)._
