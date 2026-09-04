# DECISIONS.md

Every non-obvious decision made during the build, newest section at the bottom
within each phase. Spec-mandated notes required by PROJECT_SPEC Section 14.8
are marked **[required-by-CI]** as they accumulate across phases.

---

## Phase 0 — Repo scaffold

### D-001 — License: MIT for LocalTools itself

**[required-by-CI groundwork]**
MIT chosen for maximum simplicity and compatibility with the dependency set,
which is dominated by MIT/BSD/Apache-2.0 packages. AGPL components are invoked
strictly as subprocesses (never linked) so their licenses do not propagate into
this work:

- Ghostscript (AGPL-3.0/commercial dual) — deep compress/PDF-A/deep repair, subprocess only. Same boundary reasoning used by Stirling-PDF and OCRmyPDF's dependency chain.
- `@imgly/background-removal` (AGPL-3.0/commercial dual) — **decision deferred to Phase 5** per spec Section 4.3: license terms to be re-confirmed at implementation time, with the documented fallback being ONNX Runtime Web + a permissively licensed U2Net/MODNet model. If AGPL proves unacceptable for a browser-bundled asset, the fallback is used.
- ffmpeg — build variant decided in Phase 7 (LGPL-only build vs GPL static build); either way it is a separately executed binary, and the choice will be recorded here **[required-by-CI]**.
- RAR extraction-only constraint (bonus v1.1 tool, if built): RARLAB's `unrar` is freely redistributable for extraction only; creating `.rar` archives is license-restricted and will never be supported. Recorded now as forward constraint **[required-by-CI when built]**.
- LanguageTool (LGPL-2.1 core, bonus v1.1): introduces the stack's only JVM dependency; acceptable because it runs as a user-started local helper, not bundled runtime.

Third-party trademarks (iLovePDF etc.) appear in README only as descriptive
references to the category; no logos, no implied endorsement.

### D-002 — Stub server has minimal surface by design

The Phase 0 engine exposes exactly one endpoint (`GET /healthz`) and binds to
`127.0.0.1`. None of the Section 5 controls (auth token enforcement, magic-byte
validation, rate limits, SSRF guards) exist yet — they arrive with the phases
that introduce the corresponding endpoints (4/7/8). Consequence: **the Docker
engine port is published loopback-only in compose**, and exposing the engine
beyond localhost before those phases complete would be unsafe. This is stated
explicitly so mid-build state is never mistaken for the finished posture.

### D-003 — pnpm 10 + Node 22 LTS pinned

Node 22 (current LTS) and pnpm 10 pinned via `engines` + `packageManager`.
Matches the CI matrix and the Dockerfiles (`node:22-alpine`). System Node 25
exists locally but is not targeted — LTS maximizes compatibility with
node-gyp-dependent future deps (WASM/native builds).

### D-004 — Turbo 2.x `tasks` schema

Turborepo ≥2.0 uses the flat `tasks` key (not the legacy `pipeline`). All task
graphs (`build`, `typecheck`, `lint`, `test`) are defined once in root
`turbo.json`; packages declare only plain npm scripts.

### D-005 — Release workflow committed disabled (`if: false`)

`.github/workflows/release-desktop.yml` exists from Phase 0 as a guarded
placeholder so the trigger contract (`v*` tags) is visible early, but cannot
run until the real Tauri matrix replaces it in Phase 10. Prevents accidental
broken-release runs if someone tags prematurely.

### D-006 — SECURITY.md contact placeholder

No public contact address exists yet (repo unpublished). SECURITY.md directs
reporters to GitHub private security advisories; revisit when the repo goes
public or a domain exists.

### D-007 — Workspace packages export compiled `dist` output

Supersedes an earlier Phase 0 idea of exporting TS source directly. A runtime
check proved why: the engine runs under plain Node ESM, which resolves
workspace deps through normal `main`/`exports` fields — TS-source exports only
work under bundler/tsx loaders. All six packages therefore point at
`dist/index.js` (+ types), Turborepo orders consumer builds after dependency
builds (`^build`), and Vite consumes them without issue. Related: module
resolution is split per preset — `node.json` inherits NodeNext from the base
config (explicit `.js` extensions required in Node-run relative imports),
while `react.json` keeps Bundler resolution for Vite-resident browser code.

### D-008 — `tooling/` directory added alongside the spec tree

Spec Section 1's layout doesn't name shared-config packages; adding
`tooling/eslint-config`, `tooling/prettier-config`, `tooling/tsconfig` keeps
root config single-sourced without polluting `packages/` (which stays
product-facing). Conservative extension of the given structure, same pattern
Turborepo's own kitchen-sink uses.

### D-009 — `pnpm verify` composition at scaffold stage

`verify = format:check → lint → typecheck → build`. Test runners join this
chain from Phase 3 onward as suites gain real tests (Section 14 wiring happens
progressively; full automation finalizes in Phase 13).

### D-010 — Repository is PRIVATE during the build (user decision)

The spec's Definition of Done assumes a public repo at v1.0.0 ("The repo is
public", Section 0.3), and the repo was created public accordingly. The user
then directed it be made private for now (2026-08-25); visibility will be
flipped back to public as part of Phase 15 (tag/release step). Consequences:

- Supply-chain scanning does not depend on visibility: Trivy/Grype in CI (Sections 5.4/5.5) remains the control; Dependabot security updates were left disabled either way.
- No code may assume public artifacts (no external CDN/raw-file links — consistent with Section 5.7 regardless).
- Flip back to public is part of Phase 15's release checklist.

Operational note discovered while applying: Composio's repository-update call
resets unset fields to API defaults — e.g. `delete_branch_on_merge` reverted
to `false` after being set `true` at creation, and `has_projects` flipped to
`true`. Re-apply desired settings explicitly after any future update call.

---

## Phase 1 — Design direction

### D-011 — Stitch direction translated to tokens; delivery details

The Phase 1 visual direction was generated via Stitch MCP **before** any
component code (Section 9 mandate): one design system (`assets/5698721899487494889`)
and six screens (home suite-nav + tool grid, Merge PDF, Universal Downloader,
Image Converter, JSON Formatter, drop-zone component sheet). The generated
HTML is archived verbatim under `packages/ui/stitch-reference/` as the design
source of truth (excluded from Prettier).

Implementation decisions on top of it:

- **Token namespace:** every custom property is prefixed `--lt-*` and defined
  once in `packages/ui/src/tokens.css` (light canonical, dark override via
  `[data-theme='dark']`). Stitch generated light-only output; the dark theme
  is hand-derived per Section 8 with a contrast-adjusted accent (`#1f6feb`)
  to hold WCAG AA against white text.
- **Fonts not yet vendored:** Inter + JetBrains Mono are named in the token
  stacks with system-font fallbacks; self-hosting is tracked in
  `packages/ui/fonts/README.md` and must land before release (Section 7,
  no third-party CDNs). No CDN reference exists anywhere today.
- **CSS delivery:** component TSX imports no CSS. tsc-compiled `dist/` cannot
  resolve relative `.css` imports (they are emitted verbatim), so the package
  exposes a single stylesheet entry consumed as
  `import '@localtools/ui/styles.css'`, which Vite resolves at app build time.
- **Icons:** Lucide is the chosen set (Section 7) but is wired in Phase 2
  alongside real routing; Phase 1 components accept inline glyph nodes.
- **Theme contract verified end-to-end** on the production build:
  `prefers-color-scheme` bootstrap → manual toggle writes `data-theme` +
  localStorage → restore across reload, both directions.

---

## Phase 2 — Client shell

### D-012 — Phase 2 acceptance reinterpretation; media-phase assignment; puppeteer-core devDep

Three Phase 2 calls, recorded together:

- **"Lighthouse PWA ≥90" is unsatisfiable as written.** Lighthouse 12 removed
  the PWA category entirely (upstream change; no PWA score is produced at all).
  Rather than pinning an old Lighthouse major just to keep scoring a category
  the tool abandoned, the acceptance is reinterpreted to its substance: Chrome
  installability prerequisites hold (valid manifest + versioned service worker
  that registers and controls + full icon set, all served same-origin), and a
  controlled offline-reload test demonstrates the actual requirement
  ("offline reload works") end-to-end — puppeteer warmup confirms
  `serviceWorker controlling:true`, the server is killed and verified down,
  then a reload renders the Media suite (h1 + all 18 tool cards) purely from
  the SW cache (`scripts/offline-test.mjs`, logged in TESTS.md). Performance
  tuning remains deferred to Phase 14 per spec phase order; the Phase 2 run's
  scores (perf 82 / a11y 100 / BP 100 / SEO 91) are recorded in TESTS.md as
  the regression baseline.
- **Piper TTS + PDF→audiobook assigned to Phase 9.** Section 15 lists no
  explicit phase for the Media suite's Group B text-to-speech tools (Section
  3.2). Conservative choice: they ride with the media speech phase (Phase 9),
  whose lazy-download model-caching infrastructure they share; encoded in
  `apps/client/src/lib/tool-registry.ts` `PHASE_OVERRIDES` and surfaced by the
  tool grid badges now, so the UI never promises a tool before its phase.
- **`puppeteer-core` (not `puppeteer`) is a devDependency of `apps/client`.**
  It exists solely to drive the offline-reload acceptance script against the
  system Chrome executable; `puppeteer-core` ships no browser download (that
  would add ~300MB to every CI install for a tool the app itself never uses at
  runtime), and the script resolves the local Chrome path explicitly. It is
  dev-only, never imported by app code, and can be dropped once Phase 13 wires
  PWA/offline checks into `pnpm verify` proper (or kept there for the same
  purpose).

---

## Phase 3 — PDF suite (Group A)

### D-013 — Test harness shape: vitest per-package, committed fixtures, oversized-input seam

Test-infrastructure calls made when the first real tests landed (pdf-core):

- **Vitest 4, one runner per package** (`test: vitest run`), not a single
  root-level runner. Turbo already fans `test` out per workspace (D-004/D-009),
  suites stay isolated, and future packages (image-core, devtext-core) copy the
  same three-file shape: `vitest.config.ts`, `test/helpers.ts`,
  `test/*.test.ts`. `pnpm verify` now runs `pnpm test` between typecheck and
  build, so CI exercises functional tests from here on.
- **Tests import `src/` directly, not `dist/`.** The build tsconfig split
  (`tsconfig.json` = src+test+scripts with `noEmit`, `tsconfig.build.json` =
  src→dist only, matching D-007's compiled-dist export contract) means tests
  typecheck the same code they run, and test files can never leak into the
  published `dist/`.
- **Section 14.2 fixtures are COMMITTED, tiny, deterministic** (creation
  metadata disabled so regeneration is stable), living in root `fixtures/pdf/`
  shared across suites per the spec. `scripts/generate-fixtures.ts` is the
  in-repo provenance/generator; vitest's `globalSetup` regenerates any
  MISSING fixture only (never overwrites committed bytes).
- **`password-protected.pdf` is generated host-side with pypdf** (RC4-128,
  password `localtools`), not pdf-lib — pdf-lib cannot author encrypted PDFs
  (it can only load with `ignoreEncryption`). pypdf is a one-time host tool
  (same category as Pillow for the Phase 2 icons), not a project dependency;
  regenerating this fixture is a documented manual step. If pypdf ever
  vanishes, `qpdf` (already a Phase 4 engine dependency) can produce the same
  fixture — command noted here for that contingency.
- **Oversized-input (Section 14.1) is tested via a `maxBytes` seam on
  `loadPdf`/`assertSize`, not a real >500MB fixture.** A genuine half-gig
  committed artifact is absurd; the seam exercises the exact production code
  path (assert-before-parse, no partial work) with a real small PDF under a
  tiny cap. Client callers always use the 500MB default.
- **`malformed.pdf` must be a TRUNCATED real PDF, not a fake text body** —
  pdf-lib's parser is lenient enough to accept a fake body as a parseable
  (if bogus) document, so the fixture is `simple-text.pdf` cut at 40% of its
  bytes mid-object-stream. Verified: the naive fixture passed parsing, the
  truncated one reliably throws.
- Deferred fixtures (`multi-language-text.pdf`, `bookmarked-toc.pdf`,
  `with-embedded-fonts.pdf`) arrive with the tools that consume them
  (pdf-to-text/redaction, bookmarks-toc, watermark respectively).

### D-014 — Canvas strategy for rendering-dependent PDF tools: pdfjs auto-factory + `@napi-rs/canvas` as pdfjs's own optional dep (zero new direct deps)

Verified against installed source/typings (pdfjs-dist 6.3.289,
`@napi-rs/canvas` 1.0.8), not memory:

- **pdfjs 6.3.289's `getDocument(src)` auto-selects the canvas factory by
  environment** (legacy/build/pdf.mjs, `getDocument`): under Node it uses
  its internal `NodeCanvasFactory`, which lazily
  `require("@napi-rs/canvas")` at render time (`canvas.createCanvas(w,h)`);
  in browsers it uses `DOMCanvasFactory` (`document.createElement` — needs
  DOM). `render({ canvasContext, canvas, viewport })` accepts the caller's
  canvas; pdfjs's factory is used for its own internal scratch canvases.
- **`@napi-rs/canvas` is pdfjs-dist's own declared `optionalDependency`** —
  already in the pnpm store (linked beside pdfjs-dist, so pdfjs's
  `require` resolves; win32-x64 binary present, Linux/macOS binaries are
  its own optionalDeps so CI/other hosts resolve too). Promoting it to a
  direct pdf-core dependency would duplicate the pin, not change what
  runs; the honest shape is to rely on pdfjs's own optional-dep contract
  and declare nothing new. Consequence: Node rendering (tests, any future
  engine use) works with zero new direct deps; browsers use DOM/Offscreen
  canvas with no polyfill.
- **Browser rendering happens in the Web Worker** (Batch 7 wiring): a
  Worker has no `document`, so a `CanvasFactory` class must be supplied to
  `getDocument` (pdfjs exposes `DOMCanvasFactory` at
  `pdfjs-dist/legacy/build/pdf.mjs` exports; it can be extended to use
  `OffscreenCanvas` instead of `ownerDocument.createElement` — pdfjs's
  factory contract only needs `_createCanvas` + the base
  create/reset/destroy which are exported on `BaseCanvasFactory`). The
  client worker passes a `CanvasFactory: OffscreenCanvasFactory` class.
  Images return to the main thread as transferred `Uint8Array` blobs
  (via `canvas.toBlob`/`convertToBlob`) or raw pixel data, never as
  structured-clone'd canvas objects.
- **`standardFontDataUrl` is a plain fs path in Node** — Node's
  `NodeBinaryDataFactory._fetch` is a bare `fs.readFile(url)` (not a
  fetch); a `file://` URL fails with an escaped-space path warning and
  standard-14 fonts silently don't render. Resolve the installed
  `pdfjs-dist/standard_fonts/` dir via `createRequire().resolve()` and
  pass the raw path. In the browser it's a URL prefix
  (`/pdfjs/standard_fonts/` copied by Vite).
- **Type-level**: pdfjs 6's own `types/src/pdf.d.ts` re-exports
  `PDFPageProxy`/`RenderTask`/`PageViewport` types, and pixelmatch 7.2.0
  ships its own types (`@types/pixelmatch` 5.x in devDeps is stale v5-era
  dead weight — removed).
- **Decision on the two other candidates:** engine-side rendering was
  rejected (would move Group A tools to Group B, violating Section 0
  privacy-first). "Browser-only render + graceful engine error" was
  rejected (untestable in Node under Section 14.1, and the client is the
  only target that needs it anyway).
- JPEG in Node uses `canvas.toBuffer('image/jpeg', { quality: 0-1 })`
  (Skia backend; no chroma-sampling options); PNG is default. Grayscale
  uses the same render pipeline desaturated in pixel space
  (`getImageData` → luminance transform → `putImageData`) and re-embedded
  via `PDFDocument.embedPng` — pdf-lib has no non-separable blend mode,
  so overlay approaches can't do true grayscale (verified in
  pdf-document-processing skill).

### D-015 — Phase 4 engine architecture: OCR fallback, LibreOffice filters, WeasyPrint launcher, Docker-in-CI

- **OCR: OCRmyPDF primary with a Ghostscript+Tesseract fallback.** The spec
  names OCRmyPDF (Section 4.1) but it is Python-packaged and absent on
  Windows dev hosts; the engine runs OCRmyPDF when installed (Docker
  image) and otherwise rasterizes via Ghostscript (`tiff24nc` @200dpi) and
  OCRed each page with Tesseract's `pdf` config, concatenating with
  Ghostscript. Both paths are argument-array subprocesses (Section 5.3).
- **LibreOffice from-PDF needs the import filter pinned AND the explicit
  OOXML export filter** (verified against LibreOffice 26.8.0.3): the PDF
  import defaults to Draw's model, which exports invalid renamed-ODF files
  under Word filters. The working chains are
  `--infilter=writer_pdf_import --convert-to "docx:MS Word 2007 XML"` and
  `--infilter=impress_pdf_import --convert-to "pptx:Impress MS PowerPoint
2007 XML"` — both produce genuine OOXML containers with the PDF's text.
  **PDF→Excel is impossible on stock LibreOffice** (pdfimport.xcd defines
  only draw/impress/writer PDF imports — no Calc import exists), so the
  engine rejects that combination with a clear message instead of emitting
  an invalid file; the client tool description notes the limitation.
  Every invocation runs with an isolated user profile
  (`-env:UserInstallation` into the request temp dir) to avoid the
  single-instance profile lock. Office→PDF uses plain `pdf` with no
  infilter. All via `soffice.com` on Windows.
- **WeasyPrint on Windows needs os.add_dll_directory, not just PATH.**
  cffi's dlopen of libgobject fails with loader error 0x7e for its
  transitive DLL deps when the GTK3 runtime bin dir is only on PATH.
  The engine spawns `apps/engine/scripts/weasyprint-launcher.py` (via
  the Windows `py` launcher, which picks an interpreter that actually
  has weasyprint installed — bare `python` may resolve to a uv-managed
  interpreter without it). Page size/margins are passed through a
  per-request user stylesheet with `@page { size; margin }` — the CLI's
  `-s` is stylesheets, not page size (verified against WeasyPrint 69).
- **Docker stack acceptance runs as a CI job, not locally.** The dev
  host has no Docker/WSL (user decision): `ci.yml` gains a
  `compose-stack` job (ubuntu) that builds the compose stack, gates on
  `/healthz`, and round-trips one real Group B tool (deep-compress)
  through the containerized engine. Native-tool unit tests run directly
  on the dev host with real installs.
- **Engine owns its own error taxonomy** (`errors.ts`) mirroring
  pdf-core's ToolError shape but with engine-specific codes; Layer 2
  never imports Layer 1's pdf-core package.
- **Playwright HTML→PDF is strictly opt-in** (`LOCALTOOLS_PLAYWRIGHT_ENABLED`):
  the engine reports 503 tool-unavailable rather than silently falling
  back to WeasyPrint for JS-heavy pages (spec Section 4.1: opt-in only).
  The renderer runner (`scripts/playwright-pdf.mjs`) loads only
  `file://` URLs — no arbitrary network fetch.

### D-016 — Phase 5: background-removal licensing outcome — ONNX Runtime Web + permissive ONNX model (spec fallback)

Spec Section 4.3 named `@imgly/background-removal` (AGPL-3.0/commercial
dual license) with an explicit fallback if terms were unacceptable, and
D-006 deferred the re-check to this phase. Verified 2026-09-03 against the
package's own LICENSE.md + README (v1.7.0): the library is **AGPL-3.0
only** — "free for use under the AGPL License; contact support@img.ly for
other licensing options" — i.e. permissive use requires a paid commercial
license. LocalTools is MIT (D-001) and 100% self-hostable-by-others;
embedding an AGPL library in the client bundle would copyleft the entire
distributed app. **Rejected; taking the spec's fallback path**: the
background remover is built on `onnxruntime-web` (MIT) + a
permissively-licensed U2Net-family ONNX model (Apache-2.0/MIT upstreams,
e.g. u2net/U2Netp model files), the same lazy-download + local-cache
pattern the spec uses for whisper models (Section 10) and the same
privacy-first posture (model weights fetched once, inference fully
client-side). Notes:

- Model files are downloaded lazily on first tool use, cached in the
  app's local data dir; nothing leaves the machine at inference time.
- The one-time model download is the tool's "one-time setup" badge story
  (Section 9), mirroring how the spec already treats lazy downloads.
- If model quality proves insufficient in practice, candidates with
  permissive licenses (MODNet-family Apache-2.0 exports) can be swapped
  without touching the tool contract.

### D-017 — Phase 5: @jsquash codecs in Node — manual WASM init, per-package layouts and export shapes

Spiked before writing any tool code (the D-14 lesson). All four
@jsquash codecs work in Node/vitest WITHOUT fetch or bundler tricks,
but each needs explicit WASM init with a binary loaded from disk:

- **`@jsquash/png` 3.1.1** — `init(<Buffer>)` from `@jsquash/png/decode.js`
  - `.../encode.js`; single wasm at `codec/pkg/squoosh_png_bg.wasm`;
    `decode`/`encode` are NAMED exports on the public index.
- **`@jsquash/jpeg` 1.6.0 / `webp` 1.5.0 / `avif` 2.1.1** — `init()` takes a
  COMPILED `WebAssembly.Module` (utils.js instantiates it via
  `instantiateWasm`), with SEPARATE dec/enc wasm files
  (`codec/dec/*_dec.wasm`, `codec/enc/*_enc.wasm`); `decode`/`encode` are
  DEFAULT exports on the inner `decode.js`/`encode.js`.
- Wasm files resolve via `createRequire().resolve('@jsquash/<pkg>/package.json')`
  - relative join — works under pnpm's store layout and vitest.
- **In the browser Worker, no manual init is needed at all** — the same
  public API self-initializes by fetching the wasm relative to
  `import.meta.url` (Vite bundles/urls it). The Node init path is test/dev
  - any future server-side use only, mirroring how D-014 handled canvas.
- image-core therefore exposes an env-detecting `codecs.ts` loader:
  Node → read + `WebAssembly.Module`/Buffer init once per process;
  browser → direct pass-through of the public API.

### D-018 — Phase 6: HTML→Markdown without turndown (in-house serializer over htmlparser2)

The spec's Markdown ↔ HTML tool needs both directions. Markdown→HTML uses
`marked` (GFM) as specced. For HTML→Markdown the ecosystem default is
`turndown`, but turndown requires a live browser DOM (it calls
`isBlock`, `childNodes`, `innerHTML` etc. on real HTMLElements); in the
Node test runtime and inside a Web Worker there is no DOM implementation
without a heavyweight shim (jsdom is ~10MB and drags in many deps —
violates the small/fast principle). Chosen instead: a small in-house
block/inline serializer over **htmlparser2's** DOM (already a dependency
for the XML tool family), which runs identically in Node, browser, and
Worker with zero extra dependencies. Covers headings, emphasis, links,
images, lists (nested + ordered), blockquotes, fenced code, tables, hr.
Clearly-scoped fallback: input with no tags passes through as text;
comment-only HTML is rejected as empty-input (comments are not content).

### D-019 — Phase 6: QR PNG + barcode rendering without canvas (bwip-js SVG; in-house 1-bit PNG encoder)

- **Barcode generation** uses `bwip-js`'s `toSVG()` — the one rendering
  interface shared by both the Node and browser entries (`toBuffer` is
  Node-only, `toCanvas` is browser-only). SVG output is dual-environment
  by construction and stays out of the bundle's canvas requirements.
- **QR PNG output** (downloads must be a real image) is produced by a
  ~60-line in-house 1-bit grayscale PNG encoder over `qrcode`'s module
  matrix (deflate via fflate). Gotcha discovered during implementation:
  fflate's `deflateSync` is **RAW deflate (RFC 1951)** — PNG IDAT requires
  **zlib format (RFC 1950)**, i.e. fflate's `zlibSync`; with the former
  every PNG decoder rejects the stream. Both QR round-trip
  (generate→decode through image-core's real PNG codec) and QR-scan of
  the committed fixture verify this end-to-end in tests.
- **QR scanning** decodes through `@localtools/image-core`'s `decodeAuto`
  (already a workspace dependency — D-017 codec layer) and runs jsQR on
  the RGBA pixels; zero new decode dependencies.
- **Oversized-input seams**: pure-text tools take an optional
  `maxChars` (default 5,000,000) and byte tools an optional `maxBytes`
  parameter so the Section 14.1 "oversized → rejected before processing"
  tests can exercise the cap without allocating 500MB fixtures — same
  seam pattern as pdf-core's `maxBytes` (D-013).

## Phase 7 — Media conversion suite (Group B)

### D-020 — ffmpeg build variant: BtbN GPL static build, subprocess boundary **[required-by-CI]**

Section 4.2 offers two variants: an LGPL-only build (no x264/x265) to
keep the whole stack LGPL-simple, or a standard GPL static build with the
specific binary component documented as GPL (the same subprocess-boundary
reasoning already used for Ghostscript in D-001). Chosen: **GPL static
build** (`BtbN/FFmpeg-Builds` `ffmpeg-n9.0-latest-win64-gpl-9.0.zip`,
SHA-256-verified against the release's `checksums.sha256`) because:

- The tool list explicitly needs H.264/H.265-grade encoding quality
  (libx264/libx265 are GPL); the LGPL-only alternative would force
  noticeably worse encoders for the most-used formats (mp4/mov/mkv/avi).
- ffmpeg is invoked strictly as an **executed subprocess with argument
  arrays** (Section 5.3) — never linked, never bundled into the shipped
  JS/Rust code — so its license obligations attach to the separate binary
  distribution, not to LocalTools (MIT). This is the exact pattern
  Stirling-PDF and OCRmyPDF's dependency chain use for Ghostscript.
- The Docker image uses Debian's `apt ffmpeg` (same reasoning, GPL
  component inside the image); the desktop app will lazy-download the
  same BtbN build family at first use (Section 10 flow), keeping the repo
  itself free of GPL binaries.

Dev-host install: repo-local `ffmpeg-n9.0-latest-win64-gpl-9.0/`
(gitignored via `ffmpeg-*/`, exactly like `gs10.07.1/`), auto-detected by
`resolveFfmpeg()` in `apps/engine/src/tool-paths.ts` (env overrides
`LOCALTOOLS_FFMPEG_PATH`/`LOCALTOOLS_FFPROBE_PATH` win first). The engine
never requires it on PATH.

### D-021 — ffmpeg.wasm small-clip browser path: DEFERRED (not dropped)

Section 3.2 defines a Group A in-browser path (ffmpeg.wasm) for small
clips (default 50MB threshold): trim + format-convert with no engine
call. **Deferred to a later phase** as the conservative, spec-consistent
choice:

- Section 15 assigns Phase 7 the ffmpeg-backed **Group B** conversion
  suite only; the ffmpeg.wasm path is listed under Group A but no phase
  in Section 15 names it explicitly (it is not part of Phase 9's
  speech-to-text Group A scope either). Deferring keeps Phase 7 exactly
  scoped to its acceptance criteria.
- ffmpeg.wasm is a large WASM payload (tens of MB) with Safari/WebKit
  memory quirks the spec itself flags (Section 13) — building it well
  needs its own verification pass, not a bolt-on.
- Routing decision recorded for the implementing phase: the same tool
  cards (video-trimmer, video-converter) will dispatch by file size
  (<50MB → wasm worker path, ≥50MB or wasm-unavailable → engine path
  with a clear UI indication, per the "do not silently degrade"
  requirement). No partial wiring exists today: all 14 media Group B
  cards route straight to the engine endpoints.

Revisit trigger: after Phase 9 (or whenever Group A media work is
scheduled), before Phase 13's CI finalization.

### D-022 — Phase 7 media fixtures: self-generated, license-clear by construction

Section 14.2 requires `sample-short.mp4` / `sample-short.mp3` /
`malformed.mp4` / `sample.srt` to be "small, short, license-clear". All
four are **self-generated** (fixture script
`apps/engine/scripts/generate-media-fixtures.ts`, same committed-first
contract as pdf/devtext): the mp4 is ffmpeg's synthetic `testsrc` video
pattern + a 440Hz sine tone; the mp3 is the same tone; `malformed.mp4`
is the mp4 truncated at 40% (mid-moov); the srt/vtt are hand-written
text timed inside the 3s window. Nothing is downloaded or attributed —
provenance is the generator itself. A `sample.gif` (testsrc via palette
path) supports gif-to-video. Side effect worth recording: the synthetic
testsrc pattern is so compressible that CRF 20 vs 28 spans only ~28–43
kbps on the 3s 320x240 fixture, so the 14.5 bitrate sanity checks assert
preset ORDERING (high-quality > balanced > small bitrate on identical
input) rather than absolute thresholds.

### D-023 — Video merge re-encodes (no concat -c copy), lossless trim stays opt-in

The concat demuxer with `-c copy` requires bit-identical codec
parameters across inputs; heterogeneous user clips are the common case,
so **merge always re-encodes** (balanced preset) for correctness — the
speed/quality tradeoff is documented in the tool's UI. **Trim** keeps the
spec's lossless stream-copy default (`-ss` before `-i` + `-c copy`) with
an explicit re-encode mode for exact cut points, honoring Section 3.2's
"lossless stream-copy where the codec allows, for speed" while the cut-
on-keyframe slop (~up to a GOP) is stated in the mode's label.
loudnorm runs single-pass dynamic mode (corrective quality for half the
passes of two-pass on typical material).
