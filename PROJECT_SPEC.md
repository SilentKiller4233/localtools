# PROJECT SPEC: LocalTools — Self-Hosted, Open-Source Quality-of-Life Toolkit (v3)

**Document purpose:** Complete, final specification, written to be executed directly by an AI coding agent with no further clarification needed. If something genuinely isn't covered, make the most conservative, secure, spec-consistent choice, document it in `DECISIONS.md`, and continue.

**Product one-liner:** An open-source, self-hosted, privacy-first alternative to the whole category of "free tool but rate-limited/paywalled/ad-choked" websites — iLovePDF, social media video downloader sites, PNG-to-JPG converter sites, JSON formatter sites, and similar. Every tool those sites gate is free and unlimited here. Ships two ways: a one-click desktop app for non-technical users, and a Docker Compose stack for self-hosters. Fast, small, simple, and visually deliberate — not a generic AI-scaffolded SaaS clone.

---

## 0. Non-Negotiable Principles

1. **Privacy by default.** Anything that can be done without a native helper or network call MUST be done that way (Group A). No file bytes leave the machine unless a tool explicitly requires a native helper (Group B) or an outbound request to a third-party site (Group C, media downloader only).
2. **No telemetry, no analytics, no third-party trackers, no external CDNs for core functionality.** Everything self-hosted/bundled. Works fully offline except Group C's inherent network need.
3. **Security is first-class.** The repo is public; the local processing layer runs subprocesses against untrusted input, and the downloader layer makes outbound requests on the user's behalf — treat all of it as attack surface, not just file input.
4. **No ambiguity left for later.** Every phase has explicit, testable acceptance criteria (Section 16).
5. **Small, fast, simple.** Prefer fewer dependencies and in-process/WASM approaches, but never at the cost of correctness — never hand-roll crypto, never hand-roll media parsing.
6. **Not "vibe coded."** Mandatory, specific design system (Section 7).
7. **Must be usable by a non-technical person with zero setup.** Desktop app is the primary distribution target; Docker is for power users (Section 9).
8. **Legal/ethical use is addressed explicitly, not ignored.** The media downloader suite ships with clear, visible usage guidance (Section 6). This tool is legal to build and distribute (the same category as yt-dlp, gallery-dl, and similar long-established open-source projects); how an individual uses it is their responsibility, same as any browser or `curl`.
9. **The project must always be resumable by a fresh session with zero prior context.** Two living documents — `SUMMARY.md` and `HANDOFF.md` — are maintained continuously throughout the entire build, not written once at the end. See Section 17 for the exact mandate, update cadence, and required templates. This is a hard requirement, not a nice-to-have: treat failing to update `HANDOFF.md` before ending a session as equivalent to leaving uncommitted work.

---

## 1. Architecture Overview

Three layers, two ship targets, organized internally into **suites** (a suite is a tool category with its own nav section in the UI — PDF, Media, Image, Text & Dev). All suites share the same infrastructure; only the tool list differs.

### Layer 1 — Core app (shared, runs everywhere)

Single codebase (Vite + React + TypeScript) implementing the whole UI and every **Group A** tool (in-process/WASM, no native helper, no network call). Identical whether it ends up in a browser tab, a Tauri desktop shell, or a Docker container.

### Layer 2 — Local processing helper (optional, powers Group B and Group C tools)

A small local process exposing endpoints per suite, shelling out to native open-source CLI tools (Section 4) or, for Group C, making outbound HTTP requests via `yt-dlp`. Listens on `localhost` only. Runs as a Tauri Rust sidecar in the desktop build, as its own `engine` container in the Docker build.

### Layer 3 — Distribution wrapper

- **Desktop app (primary):** Tauri wraps Layer 1 as a native window; Layer 2 runs as a local sidecar with lazy-downloaded native tools. One installer per OS.
- **Docker Compose (secondary/power-user):** Layer 1 served as static files behind Caddy, Layer 2 as its own container.

Both targets share 100% of Layer 1 and the same Layer 2 API contract.

### Monorepo layout

```
localtools/
├── apps/
│   ├── client/                 # Layer 1 — Vite + React + TS, all suites' UI + Group A logic
│   ├── engine/                 # Layer 2 — Fastify + TS, all suites' Group B/C endpoints
│   └── desktop/                # Tauri shell (Rust) — wraps client, manages engine sidecar + lazy tool downloads
├── packages/
│   ├── pdf-core/                 # PDF suite Group A logic (pdf-lib / pdfjs-dist / qpdf-wasm)
│   ├── media-core/                # Media suite Group A logic (ffmpeg.wasm for small clips)
│   ├── image-core/                # Image suite Group A logic (@jsquash/*, @imgly/background-removal, heic2any)
│   ├── devtext-core/              # Text & Dev suite logic (all Group A — see Section 3.4)
│   ├── ui/                        # shared design-system components
│   └── shared-types/               # shared TS types/zod schemas used by client + engine
├── docker/
│   ├── engine.Dockerfile
│   ├── client.Dockerfile
│   └── Caddyfile
├── docker-compose.yml
├── .env.example
├── .github/workflows/ci.yml
├── .github/workflows/release-desktop.yml
├── SECURITY.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── CONTRIBUTING.md
├── TESTS.md
├── SUMMARY.md              # living project-state doc, updated every phase — see Section 17
├── HANDOFF.md              # living session-resume doc, updated every session — see Section 17
└── README.md
```

Package manager: **pnpm** workspaces, **Turborepo**. TypeScript everywhere in Layers 1/2 (`strict: true`), Rust for the thin Tauri shell only.

---

## 2. Suite Overview

| Suite                | What it covers                                                           | Dominant group                              |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| **PDF Tools**        | Merge/split/edit/convert/secure PDFs                                     | Mostly Group A                              |
| **Media Tools**      | Social/video downloader + video/audio convert, compress, trim, extract   | Group C (downloader) + Group B (conversion) |
| **Image Tools**      | Format conversion, compression, resize, background removal, HEIC support | Mostly Group A                              |
| **Text & Dev Tools** | Formatters, converters, generators, encoders — the "utility belt"        | Entirely Group A                            |

Each suite gets its own top-level nav item and its own filterable tool grid (Section 7), consistent with the existing per-tool page pattern.

---

## 3. Full Tool List by Suite

Group definitions (apply across all suites):

- **Group A** — in-process/WASM, no native helper, no network call. Instant, offline, zero setup.
- **Group B** — requires a native local helper binary (Layer 2), operates only on user-provided local files/input, no third-party network calls.
- **Group C** — requires Layer 2 AND makes outbound requests to third-party websites on the user's behalf. Media downloader only. Extra security requirements in Section 5.

### 3.1 PDF Tools Suite

_(Unchanged from the prior version of this spec — full detail retained for completeness.)_

**Group A:** Merge, Split (by range/every N pages/by size), Extract pages, Delete pages, Reorder/Organize (drag-drop thumbnails), Rotate, Crop, Add page numbers, Add watermark (text/image), PDF→JPG/PNG, JPG/PNG→PDF, Scan to PDF (camera capture), Sign PDF (draw/type/image), Protect/Unlock (AES-128/256 via qpdf-wasm), Optimize/Linearize, Redact (genuine content removal, not overlay), Compare (visual + text diff), Quick Compress, Fill & flatten forms, Edit metadata, Bookmarks/TOC editor, Resize page dimensions, N-up layout, Grayscale, PDF→text/Markdown, in-process best-effort Repair.

**Group B:** PDF↔Word/Excel/PowerPoint (LibreOffice headless), OCR (OCRmyPDF/Tesseract), Deep Compress (Ghostscript), PDF→PDF/A (Ghostscript), Deep Repair (Ghostscript), HTML→PDF (WeasyPrint default, Playwright+Chromium opt-in for JS-heavy pages).

### 3.2 Media Tools Suite (new)

**Group C — Universal downloader:**

- Paste a URL from any site `yt-dlp` supports (YouTube, Instagram Reels/posts, TikTok — no watermark, Twitter/X, Facebook, Reddit, Vimeo, Pinterest, SoundCloud, Twitch clips, and 1000+ others) → preview available formats/qualities → download video (best/specific quality), audio-only extraction, or (where available) subtitles.
- Playlist/multi-item URL support with a per-item queue and progress list.
- Metadata preview (title, duration, thumbnail, uploader) fetched and shown before committing to a download.

**Group B — Convert/compress/edit (all via ffmpeg on the engine):**

- Video format converter (mp4/webm/mov/mkv/avi)
- Video compressor (CRF/bitrate presets: small/balanced/high-quality)
- Video trimmer/cutter (lossless stream-copy where the codec allows it, for speed)
- Merge/concatenate multiple videos or audio files
- Extract audio track from video
- Video → GIF, GIF → video
- Audio format converter (mp3/wav/flac/ogg/aac/m4a)
- Audio compressor / bitrate reducer
- Audio trimmer
- Loudness normalization (audio and video's audio track)
- Add/burn subtitles (from an uploaded `.srt`/`.vtt`, or one fetched by the downloader)
- Video resolution/aspect changer (resize/crop/pad, e.g. for social re-uploads)

**Group A — Lightweight in-browser path (ffmpeg.wasm):**

- For small clips only (configurable threshold, default 50MB): trim and format-convert directly in the browser with no engine call at all. The UI must clearly indicate when a file exceeds the threshold and offer to route to the Group B engine path instead — do not silently degrade performance by forcing huge files through WASM.

**Group A — Speech-to-text (high value, genuinely client-side feasible):**

- Transcribe an uploaded audio/video file to text/SRT via `whisper.cpp` compiled to WASM. Model weights (tiny/base/small tiers) are lazy-downloaded and cached on first use, same mechanism as Section 10's lazy-download flow. Ship this as part of the v1 Media suite, not a stretch goal — it's a strong differentiator and fully in keeping with the privacy-first principle.
- **Auto-caption / subtitle generator:** a thin, explicit tool built on the STT pipeline above — transcribe a video's audio track and output a ready-to-use `.srt`/`.vtt` timed to the video, which feeds straight into the "burn subtitles" tool. Ship as its own named tool card since "auto-generate captions for my video" is a distinct, high-search-volume QoL need people specifically look for, separate from generic transcription.

**Group B — Text-to-speech and audiobook generation:**

- Text-to-speech: convert typed/pasted text to a downloadable audio file using **Piper TTS** (small, fast, offline neural voices). Offer a curated set of lazy-downloaded voice models (a few languages/accents to start; document how to add more).
- PDF/text → audiobook: extracts a document's text (reusing the PDF suite's text-extraction logic) and feeds it through the same Piper TTS pipeline to produce a downloadable audio file per chapter/section or as one file — a genuinely popular paywalled feature on "PDF to audio" sites, and a natural composition of tools already being built rather than new infrastructure.

### 3.3 Image Tools Suite (new)

**Group A (all of it — this entire suite is achievable without a native helper):**

- Format converter: PNG ↔ JPG ↔ WebP ↔ AVIF ↔ BMP ↔ GIF ↔ TIFF
- Compressor with per-format quality controls
- Resizer (exact dimensions, percentage, or max-width/height with aspect lock)
- Batch conversion/compression/resize (process a folder at once)
- Background remover (client-side ONNX model)
- HEIC/HEIF → JPG/PNG (iPhone photos)
- Favicon generator (outputs the full standard icon set: `.ico`, multiple PNG sizes, `apple-touch-icon`, manifest snippet)
- Image ↔ Base64 data URI converter
- Screenshot annotator (crop, arrow, box, blur/pixelate a region — useful for redacting sensitive info in screenshots before sharing)
- Simple meme text overlay tool
- EXIF metadata viewer/stripper (privacy tool — many people don't realize photos carry GPS coordinates)
- Image → Text (OCR): extract text from a photo/screenshot, fully client-side via `tesseract.js` (a WASM build of Tesseract, separate from the engine-side Tesseract used in the PDF suite's OCR tool — this one needs no native helper at all)
- SVG optimizer (strip unnecessary metadata/precision from SVG files, GUI equivalent of SVGOMG)
- Color palette extractor (pull the dominant/representative colors out of an uploaded image, output as hex/rgb swatches — small, cheap, genuinely useful for designers)

**Group B (bonus, v1.1, not blocking v1 Definition of Done):**

- AI image upscaler (Real-ESRGAN via a native `ncnn-vulkan` binary) — explicitly documented as best-effort, meaningfully slower without a dedicated GPU, lazy-downloaded like other Group B tools.

### 3.4 Text & Dev Tools Suite (new — entirely Group A, cheapest suite to build, highest tool-count-per-effort)

- JSON formatter / validator / minifier
- YAML ↔ JSON converter
- CSV ↔ JSON converter
- XML formatter/validator
- Base64 encode/decode (text and file)
- URL encode/decode
- JWT decoder (decode/inspect only — display header/payload/signature segments; do not imply signature verification unless a secret/public key is explicitly supplied and verification is explicitly implemented)
- Hash generator (MD5, SHA-1, SHA-256, SHA-512 — Web Crypto API for SHA family, a small dedicated library for MD5 since Web Crypto doesn't provide it)
- UUID / ULID generator
- Regex tester with live match highlighting and group breakdown
- Text diff checker (reuses the `diff` library already in the PDF suite's Compare tool)
- CSS / JS / HTML minifier and beautifier
- Markdown ↔ HTML converter, plus Markdown → PDF (reuses the PDF suite's export pipeline)
- Color converter/picker (hex/rgb/hsl/oklch) with palette generation
- CSS gradient generator
- Cron expression parser/explainer (human-readable output)
- Unix timestamp ↔ human date converter (with timezone handling)
- Case converter (camelCase/snake_case/kebab-case/Title Case/CONSTANT_CASE)
- Slug generator
- Lorem ipsum / placeholder text generator
- QR code generator + scanner (scan via device camera or uploaded image)
- Barcode generator (common 1D formats)
- Password / passphrase generator (with entropy indicator)
- Fake/random test data generator (names, addresses, emails — clearly labeled as fake/test data, not real PII)
- Unit converter (length, weight, temperature, data size, etc.)
- Zip / unzip (pure JS/WASM, no native helper)
- File hash checker (drag a file, get its SHA-256 for verifying downloads)
- Sitemap.xml / robots.txt generator (small web-dev QoL utility, pure form-to-text generation)
- Open Graph / social preview card generator and previewer (paste meta tags or fill a form, see how a link preview will render on major platforms)

**Group B (bonus, v1.1, offline machine intelligence — flag clearly as heavier/optional so it doesn't block v1):**

- Offline machine translation between common language pairs via **Argos Translate** (Apache-2.0/MIT, fully offline neural MT, lazy-downloaded per-language-pair models). A genuinely strong differentiator versus paywalled translation-API-based sites, but resource-heavier than the rest of this suite — keep it clearly separated as its own opt-in download rather than bundled by default.
- Grammar & spell checker via a self-hosted **LanguageTool** instance (LGPL core, runs as a local Java process on Layer 2). Same lazy-download/opt-in treatment as translation.

### 3.5 Archive Tools (folded into Text & Dev suite navigation, listed separately here for clarity)

- **Group A:** Zip/unzip (create and extract `.zip`)
- **Group B, bonus/v1.1:** 7z and RAR extraction (RAR licensing note: RARLAB's `unrar` is freely redistributable for extraction-only use, but creating `.rar` archives is patent/license-restricted — this toolkit only ever extracts RAR, never creates it, and this constraint must be documented in `DECISIONS.md`)

---

## 4. Underlying Tooling — Exact Choices

### 4.1 PDF suite

Unchanged from the prior spec version:

- `pdf-lib` (MIT) — content edits (watermark, page numbers, signatures, forms, metadata, bookmarks, resize, N-up, merge/split/rotate/extract/delete/reorder).
- `pdfjs-dist` (Apache-2.0) — rendering/thumbnails/PDF→image/Compare's visual diff.
- `@neslinesli93/qpdf-wasm` (Apache-2.0) — Protect/Unlock (real AES-128/256), Optimize/Linearize, structural repair attempt.
- `pixelmatch` (ISC) — visual diff. `diff`/jsdiff (BSD-3) — text diff, shared with the Dev suite.
- Redaction — build from scratch on `pdf-lib`'s low-level object APIs per the algorithm below (unchanged from prior version):
  1. Map user-drawn redaction rectangles to content-stream coordinate space.
  2. Identify text-showing (`Tj`/`TJ`) and image (`Do`) operators intersecting the rectangle.
  3. Remove/clip those operators (clip text runs on partial overlap; remove or blacken image XObjects).
  4. Draw the visible black box.
  5. Strip matching text from any structure tree/hidden text layer too.
  - **Bonus enhancement (v1.1, not blocking v1):** auto-suggest redaction candidates by running a lightweight, client-side NER (named-entity-recognition) pass over the extracted text — flag likely emails, phone numbers, and similar PII-shaped strings (e.g. via regex for structured formats and a small ONNX NER model through `onnxruntime-web` for names) for the user to accept/reject before committing the redaction. This must remain a _suggestion_ the user explicitly confirms per-item — never auto-redact without confirmation.
- Office conversion: **LibreOffice headless** (MPL-2.0). OCR: **OCRmyPDF** (MPL-2.0) wrapping **Tesseract** (Apache-2.0). Deep compress/PDF-A/deep repair: **Ghostscript** (AGPL-3.0/commercial dual license — invoked as a subprocess, not linked; document this licensing boundary explicitly in `DECISIONS.md`, same reasoning used by Stirling-PDF and OCRmyPDF's own dependency chain). HTML→PDF: **WeasyPrint** (BSD-3) default, **Playwright**+Chromium (Apache-2.0) opt-in for JS-heavy pages, lazy-downloaded only if used.
- Reference (study, don't fork): **Stirling-PDF** (AGPL-3.0), **pdfcpu** (Apache-2.0, Go — evaluate for WASM if `pdf-lib`/`qpdf-wasm` prove insufficient for a specific operation, document any substitution), and **PrivaTools** (MIT, a broad open-source multi-category QoL toolkit covering PDF/video/audio/dev-tool categories very close to this project's own scope) as a useful cross-check for tool coverage and UX patterns — do not copy its code, but its existence confirms this overall approach (broad, self-hosted, MIT-licensed, no quotas) is a validated direction.

### 4.2 Media suite

- **`yt-dlp`** (Unlicense/public domain, the actively maintained successor to youtube-dl, supports 1800+ sites) — the universal downloader engine, run as a subprocess on Layer 2. Bundle its standalone per-OS executable (yt-dlp ships these on its own GitHub Releases) rather than requiring a system Python install.
- **`ffmpeg`** (LGPL/GPL depending on build configuration — use an LGPL-only build without GPL-licensed components like `x264`/`x265` encoders enabled by default if `DECISIONS.md` needs to keep the whole stack LGPL-compatible; otherwise use a standard GPL static build and document that this specific binary component is GPL, same subprocess-boundary reasoning as Ghostscript) — used for all video/audio conversion, compression, trimming, GIF conversion, subtitle burning, loudness normalization. Use a static build (e.g. from the `BtbN/FFmpeg-Builds` project or `johnvansickle.com` static builds) for easy lazy-download bundling.
- **`ffmpeg.wasm`** (MPL-2.0, wraps a WASM-compiled ffmpeg core) — the Group A small-clip in-browser path.
- **`whisper.cpp`** (MIT) compiled to WASM (the project ships an official WASM example/build target) — client-side speech-to-text. Model weights hosted on Hugging Face by the whisper.cpp project; lazy-download and cache the selected size tier.
- Reference (study, don't fork): **gallery-dl** (Unlicense, another strong multi-site downloader, useful cross-check for image-gallery-style sites yt-dlp handles less well).

### 4.3 Image suite

- **`@jsquash/jpeg`, `@jsquash/png`, `@jsquash/webp`, `@jsquash/avif`** (Apache-2.0, WASM ports of mozjpeg/oxipng/etc. from the Squoosh project) — format conversion, compression.
- **`@imgly/background-removal`** (AGPL-3.0/commercial dual license from IMG.LY — confirm current license terms at implementation time and record the choice/implications in `DECISIONS.md`; if the license terms are unacceptable for this project's chosen license, fall back to a plain ONNX Runtime Web + a permissively-licensed U2Net/MODNet ONNX model as a build-it-yourself alternative) — client-side background removal.
- **`heic2any`** (MIT, wraps `libheif` compiled to WASM) — HEIC/HEIF conversion.
- **`onnxruntime-web`** (MIT) — the underlying inference runtime if a custom ONNX model path is needed for background removal or upscaling.
- **`exifr`** (MIT) — EXIF metadata reading/stripping.
- **`tesseract.js`** (Apache-2.0, WASM build of Tesseract) — client-side Image→Text OCR, distinct from the engine-side Tesseract binary the PDF suite's OCR tool uses.
- **`svgo`** (MIT) — SVG optimization; runs fine compiled for browser use for the client-side optimizer tool.
- Color palette extraction: no dedicated library needed — sample pixel data from a `<canvas>` render of the uploaded image and cluster colors with a small in-house k-means pass (trivial, avoids an extra dependency for something this simple).

### 4.4 Text & Dev suite

- Native **Web Crypto API** for SHA family hashing; a small dedicated MD5 library (e.g. `spark-md5`, MIT) since Web Crypto has no MD5.
- `js-yaml` (MIT) — YAML↔JSON. `papaparse` (MIT) — CSV↔JSON, shared with the xlsx-adjacent tooling elsewhere in the project if relevant.
- `terser` (BSD) / `csso` (MIT) / `html-minifier-terser` (MIT) for minification; `prettier` (MIT) for beautifying.
- `qrcode` (MIT) for generation, `jsQR` (Apache-2.0) for scanning.
- `cronstrue` (MIT) for cron explanation.
- `@faker-js/faker` (MIT) for fake test-data generation.
- `fflate` (MIT, pure JS/WASM-free) for zip/unzip.
- `crypto.randomUUID()` (native) for UUID generation; a small ULID library (MIT) if ULID support is included.
- **`Argos Translate`** (MIT, Python) — bonus offline machine translation, run as a Layer 2 subprocess with per-language-pair lazy-downloaded models (Argos's own model format), same download-and-cache pattern as every other native tool in this project.
- **`LanguageTool`** (LGPL-2.1 core) — bonus grammar/spell checking, self-hosted as a local Java process on Layer 2, started/stopped by the engine like any other native helper; document the JVM dependency this introduces in `DECISIONS.md` since it's the only JVM-based tool in an otherwise non-JVM stack.

---

## 5. Security Requirements

Sections 5.1–5.7 apply to Group A/B tools across all suites (unchanged in substance from the prior PDF-only version, generalized here to cover Media and Image suites' native helper use too). Section 5.8 is new and specific to Group C (the downloader).

### 5.1 Network exposure

Layer 2 binds to `127.0.0.1` only by default in both targets. Docker target: exposing beyond localhost requires explicit `LOCALTOOLS_EXPOSE=true` and a `LOCALTOOLS_AUTH_TOKEN` ≥32 chars, enforced at boot (refuse to start otherwise). Every endpoint then requires `Authorization: Bearer <token>` when set; client holds it in memory only. CORS locked to the exact configured origin, never a wildcard.

### 5.2 File handling

Magic-byte validation (`file-type` package) on every upload, not extension/MIME trust. Hard per-file and total-request size caps (configurable). Per-request random temp subdirectory, deleted in a `finally` block plus a 5-minute sweeper safety net. No path-traversal-vulnerable filenames — always generate a fresh internal name; original name only reused (sanitized) for the download's display name. Processing timeout per request (default 60s for file ops; the downloader gets its own longer, separately configurable timeout — see 5.8) with subprocess kill on expiry. Sanity-check page/object counts before invoking heavy native tools to defend against decompression-bomb-style malformed input.

### 5.3 Subprocess execution

All native tool invocations (`qpdf`, `ghostscript`, `soffice`, `ocrmypdf`/`tesseract`, `weasyprint`, `playwright`, `ffmpeg`, `yt-dlp`) use `execFile`/`spawn` with argument arrays — **never** shell string interpolation. This is the single most important rule in this document, and it now applies to more tools than before (`ffmpeg` and `yt-dlp` both take rich argument sets and are exactly the kind of tool where a developer is tempted to build a command string — don't). Each subprocess runs under a CPU/memory/time limit. LibreOffice and long-running `ffmpeg`/`yt-dlp` operations always get a hard timeout with `SIGTERM` then `SIGKILL`.

### 5.4 Container/sidecar hardening

Docker: multi-stage build, non-root user, read-only root filesystem where possible, dropped capabilities, `no-new-privileges`, pinned versions, minimal base image, Trivy/Grype scan in CI failing on new HIGH/CRITICAL. Desktop sidecar: restricted child process, scoped temp directory only, no elevated permissions requested.

### 5.5 Dependency & supply chain

Lockfiles committed. Dependabot/Renovate weekly. `pnpm audit`/`cargo audit` in CI, fail on high/critical. No `curl | bash` without checksum verification; prefer signed releases for bundled native binaries (`yt-dlp`, `ffmpeg`, `whisper.cpp` builds included).

### 5.6 Logging & privacy

Logs: operation type, duration, success/failure, anonymous request ID — never filenames, file contents, or **downloaded URLs** (URLs the user pastes into the downloader are exactly the kind of thing that must never be logged persistently, given how revealing browsing/download history is). No raw filesystem paths in client-facing errors.

### 5.7 Application-layer hardening

Strict CSP (`default-src 'self'`, no `unsafe-inline` for scripts), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`. No third-party CDNs.

### 5.8 Group C-specific: outbound request safety (media downloader) — new, critical

Accepting a user-supplied URL and having a server fetch it is a classic **SSRF (Server-Side Request Forgery)** vector, and it is the highest-risk feature added in this version of the spec. Required controls, all mandatory:

- **Scheme validation:** only `http://` and `https://` URLs are ever passed to `yt-dlp`; reject everything else (`file://`, `ftp://`, etc.) before invocation.
- **Private/internal network blocking:** before making any request (including the initial metadata fetch), resolve the URL's hostname and reject it if it resolves to a loopback address (`127.0.0.0/8`, `::1`), a private range (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), a link-local range (`169.254.0.0/16` — this specifically blocks cloud metadata endpoints like `169.254.169.254`, a common SSRF target), or any other non-public IP range. This check must also apply to every redirect hop, not just the initial URL — an attacker-controlled site could redirect a public URL to an internal address.
- **`yt-dlp` sandboxing:** run `yt-dlp` with network access only (no arbitrary shell plugin execution — disable `yt-dlp`'s scripting/plugin hooks explicitly via its CLI flags), a hard wall-clock timeout for the whole download operation (configurable, generous default like 10 minutes to allow for large videos, but enforced), and a hard output file size cap enforced by monitoring the output file size during download and aborting if exceeded.
- **Filename/metadata sanitization:** video titles and other remote metadata used to name output files must be sanitized (strip path separators, control characters, null bytes) before being used as a filename — never trust remote metadata as safe filesystem input.
- **Rate limiting:** the downloader endpoint gets its own stricter rate limit (e.g. N downloads per time window per client) separate from the general file-processing endpoints, since it's the most resource- and bandwidth-intensive operation in the app.
- **No open proxy behavior:** the downloader must only ever fetch media via `yt-dlp`'s own extractor logic for supported sites — it must never become a generic "fetch any URL and return the bytes" endpoint, which would turn the local engine into an open proxy/SSRF-as-a-service tool. Reject URLs for sites `yt-dlp` doesn't recognize with a clear "unsupported site" error rather than attempting a raw fetch fallback.

---

## 6. Legal & Ethical Use Notice (Media Downloader Suite)

This must be surfaced in three places: `README.md`, `SECURITY.md`/a dedicated `LEGAL.md`, and a one-time, dismissible in-app notice the first time a user opens the Media suite's downloader tool. Content (agent should write final copy, but it must cover all of the following points, matching the tone and substance of how established open-source projects like `yt-dlp` handle this):

- This tool is built the same way, and is legal to build and distribute, as other long-established open-source downloader projects (`yt-dlp`, `youtube-dl`, `gallery-dl`). It does not circumvent DRM and only downloads content already served to any visitor's browser.
- Many platforms' Terms of Service restrict downloading content even when there's no technical DRM preventing it — using this tool may violate the ToS of the site you're downloading from, separately from copyright law itself. That's on the user to consider, not something the app can adjudicate for them.
- Recommended, non-exhaustive appropriate uses to mention in the copy: downloading your own uploaded content, content explicitly licensed for reuse/download (Creative Commons, public domain), personal offline viewing of content you have the right to access, and archival/fair-use/educational purposes consistent with your local copyright law.
- The app must not provide any feature specifically designed to strip DRM, bypass paywalls/logins, or facilitate bulk redistribution/re-hosting of downloaded content — none of the tool list in Section 3.2 does this, and the agent must not add anything that does.
- Include a short, factual note (not legal advice) that copyright law and platform ToS vary by country and platform, and the user is responsible for complying with both.

---

## 7. What NOT to Build in v1

- User accounts / multi-tenant auth / cloud sync / payment/billing
- Legal-compliance e-signature workflows for PDF Sign (visual signature only, no audit trail/certificate signing)
- Internationalization (English only; route strings through `i18n/en.json` for later ease)
- Cloud sync, webhooks, external API, batch cloud processing queues
- PDF → EPUB, vocal remover/stem separation (Demucs-style — too GPU/resource-heavy for the "small, fast, efficient" principle; note as a possible v2 idea in the README roadmap only)
- Any feature that fetches an arbitrary URL outside of `yt-dlp`'s own recognized-site extractor logic (Section 5.8) — no generic "download any file from any URL" proxy feature, even though it would be technically easy to add; it defeats the SSRF protections and isn't a distinct enough QoL win to justify the risk.

---

## 8. Non-Functional Requirements

Unchanged from the prior spec, generalized across suites:

- **Cold load (web/Docker):** initial JS payload <250KB gzipped (excluding lazy per-tool/per-suite chunks and WASM); <2s on throttled "Fast 3G" after first cache.
- **Cold load (desktop):** interactive within 1.5s of launch on a mid-range laptop.
- **Large files:** handle inputs up to 500MB (PDF/image) and reasonable video lengths (define a documented practical cap, e.g. 4GB / 3 hours for the downloader/converter, configurable) without freezing the UI — Web Workers for all Group A processing, real progress reporting always.
- **Accessibility:** WCAG 2.1 AA across all suites.
- **Responsive:** 390px mobile viewport through desktop.
- **Themes:** light + dark, `prefers-color-scheme` default, manual override persisted locally.
- **Offline:** desktop app works with zero network except the inherent Group C downloader use and one-time optional downloads; web/Docker target precaches the full Group A tool set across all suites.

---

## 9. Design System (mandatory, unchanged, now spans four suites)

- One self-hosted variable font for UI text + one monospace font for technical output, strict named type scale.
- One neutral gray scale, one sparingly-used accent color, semantic success/warning/error/info colors, all as CSS variables.
- Strict 4px spacing scale. One consistent icon set (Lucide) at one stroke width.
- Subtle, purposeful motion only; respects `prefers-reduced-motion`.
- **Home page:** suite-level navigation (PDF / Media / Image / Text & Dev) at the top, then within each suite a searchable/filterable grid of tool cards (icon, name, one-line description, "instant" vs. "one-time setup" badge). No marketing hero copy, no fake stats.
- **Per-tool page:** consistent pattern across all four suites — drop zone/input, options panel, live preview where feasible, one clear primary action, real progress reporting, human-readable errors.
- Generate the UI via **Stitch MCP** first (home suite-nav + tool grid, one representative tool page per suite — Merge PDF, Universal Downloader, Image Converter, JSON Formatter — plus the shared drop-zone component) before writing any component code, translating the output into `packages/ui`.

---

## 10. Distribution Tiers (unchanged mechanism, now covers more native tools)

### Tier 1 — Desktop App (Tauri, default/recommended)

One-file installer per OS (`.exe`/`.dmg`/`.AppImage`), double-click, done — no terminal, no Docker. All Group A tools across all four suites work instantly. Group B/C tools show a one-time friendly download prompt (e.g. _"Video downloading needs a small one-time download (~30MB) to work forever after — download now?"_) the first time that specific tool is used, caching the binary (`yt-dlp`, `ffmpeg`, LibreOffice, Ghostscript, Tesseract language packs, whisper.cpp models, etc.) permanently in the app's local data directory. Tauri manages the sidecar lifecycle invisibly. Auto-update via Tauri's built-in updater. Installers built and signed via a GitHub Actions matrix (`windows-latest`/`macos-latest`/`ubuntu-latest`) on every tagged release.

### Tier 2 — Docker Compose (power users/self-hosters/remote access)

`git clone` → `docker compose up` → live at `localhost:5173` (client) / `localhost:8787` (engine), zero manual steps beyond having Docker. Remote/always-on hosting: skip Railway/Fly.io (no meaningful free tier as of Aug 2026 — Fly's trial lasts 2 hours/7 days, Railway's free tier is a one-time $5 credit); use **Oracle Cloud Free Tier's Always Free Ampere A1 VM** (free indefinitely, up to 4 OCPU/24GB RAM) if remote access is wanted later, behind the included Caddy profile with `LOCALTOOLS_EXPOSE=true` + a strong `LOCALTOOLS_AUTH_TOKEN`. This remains a v2/optional concern, manual one-time VM setup, not worth automating.

---

## 11. Full Directory / Docker Compose Reference

`docker-compose.yml` defines `client`, `engine` (now installing LibreOffice, Ghostscript, Tesseract, qpdf, WeasyPrint, `yt-dlp`, and `ffmpeg` — document the resulting image size in `README.md` since this is now a noticeably heavier image than the PDF-only version; consider a documented `docker-compose.slim.yml` variant that omits the Media suite's native tools for users who only want PDF/Image/Dev tools, as a v1.1 nice-to-have), and an optional `caddy` profile. `.env.example` lists every env var referenced in Section 5 with a safe default and inline explanation.

---

## 12. MCP / Tooling Setup for the Build Process Itself

- **GitHub access:** use the already-connected **Composio** GitHub integration (repo creation, commits, branches, PRs, issues/labels for phase tracking) instead of a separate GitHub MCP server or manually pasted PAT. Fall back to a raw PAT only if a specific action Composio's GitHub toolset doesn't expose is genuinely needed.
- **Stitch MCP:** already connected — use per Section 9 for the design-direction step across all four suites before writing component code.
- **Context7 MCP** (free tier): pull current docs for fast-moving/easy-to-misremember interfaces — `pdf-lib`, `pdfjs-dist`, `qpdf-wasm`'s `callMain` format, `yt-dlp`'s CLI flags and Python API (this one especially — `yt-dlp` adds/changes extractor-related flags frequently as sites change their APIs, verify current flags rather than relying on memory), `ffmpeg` filter syntax, OCRmyPDF/Tesseract flags, LibreOffice `--convert-to` flags, Ghostscript flags, WeasyPrint's API, `whisper.cpp`'s WASM build instructions, Tauri's sidecar/updater APIs.
- **Docker access:** plain shell/bash tool access is sufficient for build/run/inspect during self-verification.
- Do **not** set up a Railway/Fly.io MCP — out of scope for v1 (Section 10).

---

## 13. Explicit Edge Cases to Handle

_(PDF/general cases unchanged from prior version — retained below — plus new Media/Image/Downloader-specific cases.)_

- Password-protected PDF on a non-Unlock/Protect tool → redirect message, not generic failure.
- Zero-page/corrupted PDF → clear error, no crash.
- Image-only scan on a text-dependent operation → graceful degrade with a clear note.
- 1000+ page PDFs in thumbnail-grid tools → virtualized rendering.
- Non-Latin/RTL text in watermark/page-number input → broad-coverage font or documented limitation.
- Concurrent batch operations → capped Web Worker concurrency client-side; capped, queued subprocess concurrency engine-side with HTTP 429 once full.
- Safari/WebKit WASM quirks (memory limits, COOP/COEP requirements) — test `qpdf-wasm`, `ffmpeg.wasm`, and `whisper.wasm` specifically on Safari.
- Tauri "unsigned app" OS warnings on first launch — README needs exact, screenshot-level bypass steps (macOS right-click→Open, Windows SmartScreen "More info→Run anyway").
- Lazy-download of a native tool fails (no internet/blocked) → clear retry option, rest of the app stays usable.
- **Downloader: unsupported/unrecognized URL** → clear "this site isn't supported" message (Section 5.8 — never fall back to a raw fetch).
- **Downloader: geo-restricted or login-required content** → `yt-dlp` will fail on these; surface its error in a readable form rather than a generic failure, and do not attempt to add cookie-import/login-bypass features to work around this (out of scope, also legally murkier — stick to publicly accessible content).
- **Downloader: livestream URLs** → either explicitly unsupported with a clear message, or supported with a documented, bounded max-capture-duration if implemented — do not allow an unbounded-duration capture that could fill disk indefinitely.
- **Downloader: extremely long videos** → enforce the documented duration/size cap from Section 5.8 before starting the download, not just during it, by checking metadata (duration) first where `yt-dlp` can report it pre-download.
- **ffmpeg conversion of a corrupt/truncated video file** → clear error, no hung process (timeout per 5.3).
- **HEIC conversion of a non-HEIC file with a `.heic` extension** (mislabeled file) → magic-byte check catches this before attempting decode, clear error.
- **Background removal on an image with no clear subject** (e.g. a texture/pattern) → best-effort result is fine, but the UI should not imply a guaranteed "perfect cutout" — set expectations in the tool's one-line description.

---

## 14. Automated Test Suite & Definition-of-Done Verification

Same mechanism as before — a single **`pnpm verify`** command runs the full automated subset and prints a pass/fail table; anything not automatable is **[manual]**, logged in `TESTS.md` with a one-line note, not assumed done.

### 14.1 Per-tool functional tests (repeat for every tool in Section 3, across all four suites)

- **Happy path:** valid fixture in → valid, programmatically-verifiable output (e.g. after video convert, assert output container/codec matches request via a metadata probe like `ffprobe`; after background removal, assert output has an alpha channel; after JSON format, assert output is valid JSON with expected structure; after downloader, assert output file exists, is non-zero size, and matches the expected container format).
- **Malformed input** → graceful, specific error, no crash/hang.
- **Empty input** → graceful, specific error.
- **Oversized input** (fixture just above the configured cap) → rejected before processing, no partial temp files left behind afterward.

### 14.2 Shared fixture set

PDF fixtures unchanged from the prior spec version (`simple-text.pdf`, `scanned-image-only.pdf`, `with-form-fields.pdf`, `with-embedded-fonts.pdf`, `password-protected.pdf`, `malformed.pdf`, `zero-page.pdf`, `oversized.pdf`, `multi-language-text.pdf`, `bookmarked-toc.pdf`, sample `.docx`/`.xlsx`/`.pptx`, sample `.html`).

New fixtures:

- `sample-short.mp4` / `sample-short.mp3` — small, short, license-clear (e.g. self-recorded or public-domain) media for conversion/compression/trim tests
- `malformed.mp4` — truncated/corrupt video for error-path testing
- `sample.srt` — subtitle file for the burn-subtitles test
- A **mocked** downloader test target: since real third-party sites shouldn't be hit in CI (flaky, ToS concerns, rate limits), the downloader's integration tests must run against a local mock HTTP server serving a minimal fake "extractor-compatible" response, or use `yt-dlp`'s own documented test/dummy extractors if available, specifically so CI never actually downloads from live YouTube/Instagram/etc. Document this decision in `DECISIONS.md`.
- `sample.jpg` / `sample.png` / `sample.heic` / `sample-with-exif.jpg` (containing test GPS/metadata) / `sample.webp` — image suite fixtures
- Malformed/zero-byte versions of the above for error-path testing

### 14.3 Redaction-specific mandatory test (unchanged from prior version)

Redact a known string from `simple-text.pdf`; assert the visible black box renders correctly; **critically**, extract raw content-stream text from the output and assert the redacted string is absent everywhere, including hidden text layers/structure tree/metadata — this test must fail loudly if redaction is ever just a visual overlay.

### 14.4 Security regression tests

Unchanged core set (path traversal, command-injection-style filenames, oversized requests, `LOCALTOOLS_EXPOSE` without a valid token, unauthorized requests to an exposed engine, temp-directory cleanup on success and failure, concurrent subprocess flood → HTTP 429) **plus new Group C tests specific to Section 5.8:**

- URL resolving to a loopback/private/link-local address (including the `169.254.169.254` metadata-endpoint case specifically) → rejected before any request is made.
- A mocked redirect chain where the final hop resolves to a private IP → rejected (proves per-hop checking, not just the initial URL).
- Non-`http(s)` scheme URL → rejected.
- URL for a site `yt-dlp` doesn't recognize → clear "unsupported site" error, no raw-fetch fallback attempted (assert no outbound request is made at all for this case).
- Simulated oversized download (mock response exceeding the configured cap) → aborted mid-download, no full file left on disk.
- Downloader-specific rate limit → excess requests within the window receive a clear rate-limit error distinct from the general 429.
- Filename derived from malicious mock metadata (e.g. a title containing `../../` or null bytes) → sanitized before being used as a filesystem path.

### 14.5 Performance & size tests

Bundle size check in CI (fail if initial gzipped JS >250KB). Lighthouse CI (PWA ≥90, no >10-point Performance regression). Worker-offload check for a 50MB+ Group A operation (near-zero main-thread long tasks during processing). New: an `ffprobe`-based check on Group B video conversions confirming output bitrate/resolution roughly matches the requested preset (sanity check that ffmpeg args were actually applied, not just that the process exited 0).

### 14.6 Accessibility tests

`axe-core` scan on every route across all four suites, zero critical/serious violations, fails the build otherwise. **[manual]** full keyboard walkthrough of every tool (now a longer list — budget real time for this). **[manual]** screen reader spot-check on at least one representative tool per suite (4 total minimum, up from 3).

### 14.7 Distribution tests

Docker: clean-clone `docker compose up` → both services healthy → one full round-trip per suite (PDF Group A tool, Media Group B/C tool against the mock target, Image Group A tool, Dev Group A tool) succeeds through the running containers, run as a CI job. Desktop: CI builds a Linux (AppImage) installer on every PR, full three-OS matrix on tagged releases; a headless smoke test confirms the app launches and the home page renders. **[manual]** one real install-and-click-through on a machine without prior dev tools (or a clean VM) for both the installer and a fresh `docker compose up`, covering at least one tool per suite, logged in `TESTS.md` before tagging `v1.0.0`.

### 14.8 Licensing/documentation checks

CI job grepping `DECISIONS.md` for the required notes: Ghostscript's AGPL/subprocess-boundary reasoning, ffmpeg's license build variant chosen, `@imgly/background-removal`'s license status (or the fallback chosen), RAR extraction-only licensing constraint (if that bonus tool is built), and the mocked-downloader-testing decision — fail the build if any required note is missing.

---

## 15. Build Phases & Acceptance Criteria

Execute strictly in order; commit after each phase (conventional-commit style). Per Section 0 principle 9 and Section 17: update `HANDOFF.md` before ending **every** work session regardless of whether a phase boundary was reached, and update `SUMMARY.md` at the end of **every** phase listed below at minimum (also mid-phase if a major decision or architectural change happens). Treat these updates as part of the phase's own commit, not a separate afterthought.

**Phase 0 — Repo scaffold.** pnpm workspaces + Turborepo, directory structure (Section 1), strict TS config, ESLint/Prettier, license choice recorded in `DECISIONS.md`. Initialize `SUMMARY.md` and `HANDOFF.md` from the Section 17 templates immediately in this phase, even though there's little to report yet — do not wait until later to start them. _Acceptance:_ `pnpm install && pnpm build` succeeds with stub apps; both continuity docs exist and follow the required templates.

**Phase 1 — Design direction.** Stitch MCP generates visual direction across all four suites (Section 9); translate into design tokens + base components. _Acceptance:_ `/dev/ui-preview` shows tokenized components in both themes, including suite-nav.

**Phase 2 — Client shell.** Suite-level routing/nav, per-suite tool grids (all tools from Section 3, correctly badged), PWA manifest/service worker. _Acceptance:_ Lighthouse PWA ≥90; offline reload works.

**Phase 3 — PDF suite (Group A).** As previously specced. _Acceptance:_ Section 14.1/14.2/14.3 tests pass for every PDF Group A tool; no main-thread blocking on 50MB fixture.

**Phase 4 — PDF suite (Group B, Docker target).** Fastify endpoints, Section 5 security controls. _Acceptance:_ Section 14.1/14.4 pass for every PDF Group B tool; Docker stack test passes.

**Phase 5 — Image suite (entirely Group A).** All tools from Section 3.3. _Acceptance:_ Section 14.1/14.2 tests pass for every Image tool; EXIF-stripping test specifically verifies GPS/metadata is actually removed from output bytes, not just hidden in a viewer.

**Phase 6 — Text & Dev suite (entirely Group A).** All tools from Section 3.4. _Acceptance:_ Section 14.1 tests pass for every tool; this phase should be fast given how mechanical most of these tools are — do not skip tests just because the tools are simple.

**Phase 7 — Media suite, conversion (Group B).** ffmpeg-backed endpoints. _Acceptance:_ Section 14.1/14.4/14.5 (ffprobe sanity check) pass for every conversion/compression/trim/GIF/subtitle/normalize tool.

**Phase 8 — Media suite, downloader (Group C) — highest-risk phase, do not rush.** yt-dlp integration with the full Section 5.8 SSRF-prevention set implemented from the start, not bolted on after. _Acceptance:_ every test in Section 14.4's Group C list passes; the mocked-target integration test (14.2) passes; manual review confirms no code path exists where a user-supplied URL reaches an outbound request without first passing the private-IP/scheme/redirect checks.

**Phase 9 — Media suite, speech-to-text (Group A).** whisper.cpp WASM integration, lazy model download. _Acceptance:_ transcription test against `sample-short.mp3` produces non-empty, roughly-correct text output; model download/caching flow tested per Section 13's lazy-download edge case.

**Phase 10 — Desktop app (Tauri).** `apps/desktop` shell, sidecar lifecycle, lazy-download flow for every native tool now in play (LibreOffice, Ghostscript, Tesseract, qpdf fallback, yt-dlp, ffmpeg, whisper models). _Acceptance:_ Section 14.7 desktop smoke test passes on Linux in CI; full manual click-through confirms zero terminal use from install to completing one task per suite.

**Phase 11 — Integration polish.** Health-check gating with friendly language, consistent progress reporting, designed error states across all suites, batch mode where it logically applies. _Acceptance:_ no tool shows a raw/unstyled error anywhere in the app.

**Phase 12 — Accessibility & responsiveness.** _Acceptance:_ Section 14.6 passes (automated + logged manual items) across all four suites.

**Phase 13 — Testing & CI finalization.** Full Section 14 suite wired into `pnpm verify` and both GitHub Actions workflows. _Acceptance:_ CI green on a clean PR; the shell-string-subprocess canary test (14.4) verified once manually then reverted.

**Phase 14 — Performance & size pass.** _Acceptance:_ Section 14.5 metrics met and recorded in `README.md`, including the Docker image size note from Section 11.

**Phase 15 — Documentation & release.** `README.md` (what/why, screenshots per suite, two quick-starts, full tool list by suite, Mermaid architecture diagram), `LEGAL.md` (Section 6 content), `CONTRIBUTING.md`, `TESTS.md` fully logged, `DECISIONS.md` finalized (must contain every required note from Section 14.8). Tag `v1.0.0`, triggering the release-desktop workflow.

---

## 16. Definition of Done (v1.0.0)

- Every tool across all four suites (Section 3) is fully functional, not a stub — verified by `pnpm verify` passing in full.
- Every Section 8 non-functional requirement is met and verified (Sections 14.5/14.6).
- Every Section 5 security control is implemented, including the full Group C SSRF-prevention set, and every test in Section 14.4 passes.
- The Section 6 legal/ethical notice is present in all three required locations.
- Both distribution tiers work from a clean state, confirmed by the manual checks in Section 14.7 and logged in `TESTS.md`.
- CI is fully green, Trivy scan has no unresolved HIGH/CRITICAL findings, the Section 14.8 licensing-doc check passes.
- README, ARCHITECTURE.md, SECURITY.md, LEGAL.md, CONTRIBUTING.md, TESTS.md, DECISIONS.md all exist and are accurate to the shipped code, not aspirational.
- `SUMMARY.md` and `HANDOFF.md` (Section 17) exist, are current as of the `v1.0.0` tag, and both accurately reflect a fully-complete project state (no leftover "in progress" language, no stale next-steps list).

---

## 17. Continuity & Handoff Documentation (Mandatory Throughout the Build)

This section exists because the build spans many sessions, likely across different agent runs/models, and possibly different days. Nothing about project state should ever live only in one session's context. Two files, both committed to git at repo root, carry that state forward. Neither is optional, neither is a one-time deliverable written at the end — both are living documents updated continuously as work happens.

### 17.1 `SUMMARY.md` — the project's current state, for a human or agent getting oriented

**Update cadence:** at the end of every phase in Section 15 at minimum; also immediately after any significant architectural decision, tool substitution, or scope change recorded in `DECISIONS.md`. This is the "catch me up" document — it should always be possible to read only this file and understand exactly where the project stands, with no need to dig through commit history or prior chat transcripts.

Required template (agent fills in and keeps current, does not remove sections even if empty — write "None yet" rather than deleting a heading):

```markdown
# LocalTools — Project Summary

_Last updated: <ISO date>, after Phase <N> — <phase name>_

## What this project is

[1-3 sentence description — stays essentially constant across updates]

## Current status

- Phases complete: <N> of 15 (Section 15)
- PDF suite: <not started | in progress | complete — X/Y tools done>
- Media suite: <same format>
- Image suite: <same format>
- Text & Dev suite: <same format>
- Desktop app (Tauri): <status>
- Docker Compose target: <status>
- Test suite (`pnpm verify`): <passing count / total, or "not yet wired up">

## What has been built so far

[Bullet list, grouped by suite/phase, grows over time. Each entry should be specific enough that someone could verify it by looking at the code — not "worked on PDF tools" but "implemented Merge, Split, Rotate, Extract for the PDF suite; all pass Section 14.1/14.2 tests."]

## What's left

[Bullet list mirroring the remaining phases/tools from Section 15/Section 3. Kept in sync — remove items as they're completed above, don't let this drift out of date.]

## Key architectural decisions made so far

[3-6 line summary of the biggest calls made, with a pointer to the full detail in `DECISIONS.md` for each — e.g. "Chose LGPL-only ffmpeg build over full GPL build to keep licensing simpler — see DECISIONS.md#ffmpeg-license"]

## Known issues / tech debt

[Explicit list. "None known" is a valid entry, but only write that if actually true — don't default to it.]

## How to run the project right now

[Exact current commands — this may legitimately differ from the final README if mid-build, e.g. "Docker Compose works for the PDF and Image suites; Media suite's engine endpoints aren't wired up yet, so those tool cards will show as unavailable."]
```

### 17.2 `HANDOFF.md` — exact resume point for the next session, written for zero-context pickup

**Update cadence:** the literal last action of every single work session, no exceptions, before ending the turn/session — even if the session was short, exploratory, or ended in the middle of a task. This file's entire purpose is letting you open a brand-new session with a fresh agent and zero prior context, paste in this file, and have that agent continue exactly where the last one stopped with no re-discovery work and no risk of redoing or conflicting with what was just done.

Required template (fully overwritten each session, not appended to — it describes the current resume point, not a history log; history lives in `SUMMARY.md` and git log):

```markdown
# HANDOFF — read this first in any new session

_Last updated: <ISO datetime>, end of previous session_

## Where things stand right now

[Precise: which phase (Section 15), which specific tool/task within that phase, and its exact state — e.g. "Phase 8 (Media downloader, Group C). yt-dlp subprocess wrapper and the Section 5.8 SSRF checks (scheme validation, private-IP blocking, redirect-hop checking) are implemented and unit-tested. Rate limiting and the mocked-target integration test are not yet written."]

## Last thing done

[Specific and verifiable — e.g. "Implemented resolveAndValidateHost() in apps/engine/src/downloader/ssrf-guard.ts, added unit tests covering loopback/private/link-local ranges including 169.254.169.254, all passing. Committed as `feat(engine): add SSRF guard for downloader (a1b2c3d)`."]

## In-progress / uncommitted work

[Explicit — either "None, working tree is clean" (verify this is actually true before writing it) or the exact files with uncommitted changes and why they're not yet committed, e.g. "apps/engine/src/downloader/route.ts has the redirect-hop-checking wired in but not yet tested — do not assume this is safe to rely on yet."]

## Next immediate steps (in order — do these first)

1. [Most specific, actionable next step]
2. [...]
3. [...]
   (Keep this to the next 3-5 real steps, not the whole remaining roadmap — that's what Section 15 and SUMMARY.md's "What's left" are for.)

## Blockers / open decisions needing human input

[Explicit list, or "None." If something in this spec was ambiguous and a conservative default was chosen per Section 0's guidance, note it here even if not strictly "blocking," so the human can override it if they disagree.]

## Environment / local state notes

[Anything a fresh session would otherwise waste time rediscovering — e.g. "Docker engine container currently has a stale volume from testing large-file uploads, safe to `docker compose down -v` before continuing." Or port numbers in use, env vars that need to be set for tests to pass, model files already downloaded and cached vs. not, etc.]

## Useful context / gotchas discovered this session

[Anything non-obvious learned while working — a library quirk, a flag that behaved unexpectedly, a test that's flaky for a known reason — so the next session doesn't rediscover it the hard way.]
```

### 17.3 Enforcement

- Both files are committed to git alongside the code changes from the same session — not as a separate, easily-skipped follow-up commit.
- A session is not considered properly ended if `HANDOFF.md` still describes a stale previous state. If the agent is about to run out of context or the session is ending for any reason, updating `HANDOFF.md` takes priority over starting any new task.
- These files are explicitly exempted from the "not aspirational" documentation rule elsewhere in this spec only in the sense that `HANDOFF.md` is expected to describe in-progress, incomplete work truthfully — the requirement is accuracy to the real current state, not that the state itself be finished.
