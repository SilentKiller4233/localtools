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
  AGPL network-clause note (external review H1): when a deployer offers
  LocalTools with `LOCALTOOLS_EXPOSE=true`, remote users interact with
  Ghostscript's functionality over a network. AGPL §13's corresponding-source
  obligation is satisfied for the Ghostscript component by linking to the
  UNMODIFIED upstream project (https://www.ghostscript.com/) — LocalTools
  never modifies it; no local corresponding-source offer is required beyond
  that link. The MIT engine never links AGPL code; the boundary is subprocess-only.
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

## Phase 8 — Media downloader suite (Group C, yt-dlp)

### D-024 — Livestreams: explicitly unsupported (conservative choice, Section 13)

Section 13 allows either bounded max-capture-duration support or
explicit unsupported with a clear message. Chosen: **explicit
unsupported**. The engine detects `is_live`/`live_status` in the
pre-download metadata probe AND in `--max-filesize`-adjacent error
mapping, and rejects with `unsupported-site` copy that says live
streams aren't supported — "wait for the stream to finish and download
the saved copy." Rationale: an unbounded capture is the only path that
can fill disk indefinitely (Section 13's own concern), a bounded one
adds a whole timeout/capture UX for a niche case, and the conservative
spec-consistent reading is to not build it in v1.

### D-025 — yt-dlp deployment: standalone per-OS exe, repo-local (dev) + pip (Docker) **[required-by-CI]**

- **Dev host:** official standalone `yt-dlp.exe` (2026.08.19) from
  yt-dlp's own GitHub Releases, SHA-256-verified against the release's
  `SHA2-256SUMS`, installed repo-local under `yt-dlp-2026.08.19/`
  (gitignored via `yt-dlp-*/`, exactly like `ffmpeg-*/` and `gs10.07.1/`).
  Resolution order in `tool-paths.ts` mirrors ffmpeg:
  `LOCALTOOLS_YTDLP_PATH` env → repo-local `yt-dlp-<tag>/` →
  `/usr/bin|/usr/local/bin` (Docker) → PATH; ENOENT surfaces as the
  honest 503 `tool-unavailable` (the c88d80d contract).
- **Docker:** `pip3 install yt-dlp` in the engine image (Section 11
  allows python3+pip or the static binary). Image-size impact:
  ~+40MB (the pip wheel + its deps vs the ~18MB static exe is close;
  pip keeps the image consistent with the apt tooling and lets
  dependabot-style updates ride the lockfile pipeline in Phase 13).
  The Docker image size note lands in README at Phase 14 per Section 11.

### D-026 — Downloader tests: local mock HTTP target; production extractors stay disabled **[required-by-CI]**

Section 14.2 mandates the mocked downloader target (never live
third-party sites in CI — flaky, ToS, rate limits). The mock
(`apps/engine/test/downloader-mock.ts`) is a plain Node http server on
127.0.0.1 serving yt-dlp-extractable pages: single `<video>` page,
two-video page (playlist shape), hostile `<title>` page, redirect
pages (private IP / cloud-metadata / loopback-name targets), a
slow-drip oversized body, and a `<track>` subtitle page — backed by
the committed `fixtures/media/*` bytes. Test-mode design: the engine
exempts exactly ONE literal `host:port` (the mock) from the loopback
block via `LOCALTOOLS_DOWNLOADER_MOCK_TARGET`, and the extractor set
grows `generic,html5` for that mode ONLY. Everything else — including
`localhost` as a NAME and every other loopback port — falls through to
the full production validation, so the SSRF tests prove real rejections
while the happy path still has a fetchable target. The production
extractor set (`all,-generic`) is itself tested directly: yt-dlp
rejects the mock URL with `Unsupported URL` and ZERO outbound
requests (mock hit log asserted empty) — the no-open-proxy rule at
the layer where it lives.

### D-027 — SSRF enforcement shape: validating forward proxy per request **[required-by-CI]**

The per-redirect-hop requirement (Section 5.8) cannot be met by
validating only the initial URL — yt-dlp follows redirects, fetches
fragments from CDNs, and resolves names itself. Design: **the engine
runs a loopback-only validating forward proxy per request and points
yt-dlp at it via `--proxy`** (`apps/engine/src/downloader/ssrf-guard.ts`).
Every connection yt-dlp makes (page, redirect hop, media, fragment)
is re-validated: scheme (http/https), DNS resolve, and
classify-against-blocked-ranges (loopback 127/8 + ::1, 10/8,
172.16/12, 192.168/16, link-local 169.254/16 incl. 169.254.169.254,
CGNAT, multicast, reserved, v4-mapped, ULA, NAT64 — every A/AAAA
record must be public). CONNECT tunnels (https) validate before the
tunnel opens. The initial URL is ALSO validated before any subprocess
exists (fail-fast, zero requests). yt-dlp sandboxing flags (verified
against the installed binary's --help, not memory):
`--no-config-locations --no-plugin-dirs --no-remote-components
--no-exec --no-cache-dir --socket-timeout 30 --restrict-filenames
--windows-filenames --no-progress --no-mtime` plus
`--use-extractors all,-generic` (generic disabled = no raw-fetch
fallback, Section 5.8's no-open-proxy rule). Hard wall-clock timeout
(default 600s) with SIGTERM→SIGKILL (+taskkill /T) and an output-size
watchdog polling the download dir (abort mid-flight → `download-too-large`,
nothing kept). Argument arrays only (Section 5.3); URLs never logged (5.6).

---

## Phase 9 — Media speech & audio (STT, auto-captions, TTS, audiobook)

### D-028 — Speech fixture: generated with Piper itself, committed; assertion = keyword set (a8b196c discipline) **[required-by-CI]**

`fixtures/media/sample-short.mp3` is a 440Hz sine tone (D-022) and can never
satisfy Section 15's "roughly-correct text". Chosen strategy:

- **Fixture = `fixtures/media/sample-speech.wav`, generated once with the
  verified Piper release (2023.11.14-2) + the en_US-lessac-medium voice from
  the MIT-licensed `rhasspy/piper-voices` HF repo, speaking a fixed pangram
  phrase** ("The quick brown fox jumps over the lazy dog. LocalTools speech
  test."). License-clear by construction (our own words, synthesized by
  MIT-licensed tools — no third-party recording), deterministic in provenance
  (committed bytes, regenerate script in `apps/engine/scripts/`), and it
  doubles as a live proof that the Piper pipeline works. NOT generated at test
  time (chicken-and-egg with lazy downloads; CI has no piper).
- **Assertions are keyword-set based, never exact strings** — whisper output
  varies by model tier/build. The test asserts the transcript is non-empty
  AND contains (case-insensitive, whitespace-normalized) at least 4 of the 6
  words {quick, brown, fox, lazy, dog, speech} — the remaining two tolerate
  tiny.en's known homophone slips. **Failure probability computed against the
  ACTUAL verified transcript** (live end-to-end run in this session produced
  the exact phrase with all 9 words correct via tiny.en; tiny.en WER on clear
  synthetic speech is ~1-5% per word but errors concentrate on rare words —
  none of the 6 keywords are rare): observed 0/6 keywords missed, so
  P(test fails) = P(≥3 of 6 keywords simultaneously misrecognized) < 1e-4 by
  any plausible error model (needs 3+ independent ~1% events).
- Phase 15's spec-named `sample-short.mp3` transcription test is satisfied by
  this fixture (spec Section 14.2 requires "license-clear speech for
  conversion tests" — the sine tone remains for conversion; the dedicated
  speech fixture covers transcription honestly).

### D-029 — whisper WASM packaging: `@fugood/node-whisper-wasm` 1.1.3; models pinned from whisper.cpp's HF ggml repo; browser Cache API + Node Temp cache; Node loading contract **[required-by-CI]**

**Packaging choice (verified from the package tarball, not memory):**
`@fugood/node-whisper-wasm` 1.1.3 (MIT, browser WASM module for
whisper.node — the whisper.cpp WASM build). Rejected alternatives:
`smart-whisper` (node-gyp native addon — wrong environment, needs compilation),
`@remotion/whisper-web` (UNLICENSED), `whisper-node` (native OpenAI-whisper
binding, not whisper.cpp), `@timur00kh/whisper.wasm` (0.1.1, one-person,
unproven). The fugood package ships single-thread + pthread artifacts
(~4.1MB wasm each), auto-falls-back to single-thread when the page is not
crossOriginIsolated (NO app-wide COOP/COEP headers needed — the existing CSP
is untouched), supports transcribeData(Float32Array PCM), tokenTimestamps,
Cache-API model caching built in, and a module-worker mode we bypass (our own
worker hosts it).

**Bundle impact (250KB initial-JS budget):** `media-core` depends on it; the
CLIENT worker imports whisper lazily via dynamic import (Vite code-splits),
so the initial JS gains only the STT tool registry entries. The ~4.1MB WASM +
77KB-488MB models are runtime fetches, never bundled.

**Model tiers (pinned URLs + SHA-256 from HF LFS metadata, verified
2026-09-07):** tiny.en (77.7MB,
921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f), base.en
(148MB, a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002),
small.en (488MB, c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d)
— from `ggerganov/whisper.cpp` (the official whisper.cpp ggml models, MIT).
English-only tiers for v1 (conservative; the `.en` variants are the accurate
English ones at each size). Sizes verified from the HF tree API.

**Cache mechanism:** browser = Cache API (the package's built-in
`whisper.node.wasm.models` cache, default on); Node (tests) =
`%LOCALAPPDATA%/Temp/localtools-models/`-adjacent dir
`<tmp>/localtools-models/whisper/` (u2netp precedent, D-016) — downloaded
once on the dev machine, gitignored, CI tests SKIP network by asserting the
honest degradation path when the model is absent (mirror of the c88d80d
contract for Group B, applied to a Group A tool whose "native helper" is the
model file itself).

**Node loading contract (the non-obvious part, all verified live):**

1. `configureWasm({ threads: false })` — Node otherwise selects the pthreads
   artifact (isWasmThreadsSupport() is true in non-browser contexts) which
   crashes with "Worker is not defined".
2. `moduleOptions.instantiateWasm` hook supplying the locally-read
   `whisper-node.wasm` bytes and calling `onSuccess(res.instance)` — this
   Emscripten build never reads `Module.wasmBinary` into its closure, and
   Node's fetch rejects `file://` URLs, so there is no other way.
3. Model: `moduleOptions.preRun` writes the model bytes into the Emscripten
   FS at `/models/<name>` and `initWhisper({ filePath: '/models/<name>' })` —
   the glue's `ensureModel` checks `source[0]==='/' && fsPathExists` and skips
   the network entirely. Verified: init 116ms, transcription of the Piper
   fixture produced the exact phrase.
   Browser path uses none of these hooks (defaults work: same-origin asset URLs
   via Vite-copied package files).

### D-030 — Piper TTS deployment: release binary repo-local (dev) + release-asset install (Docker); voices lazy from HF with per-file SHA-256 verification **[required-by-CI]**

- **Binary:** rhasspy/piper GitHub Release 2023.11.14-2 (the latest — Piper's
  1.x line moved to `OHF-voice/piper1-gpl` but that is a GPL refactoring still
  in flux; 2023.11.14-2 is the stable, widely-deployed MIT release), Windows
  `piper_windows_amd64.zip` on the dev host (repo-local `piper-2023.11.14-2/`,
  gitignored like yt-dlp, SHA-256 of the zip verified at install:
  f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea — the
  the release carries NO upstream checksums, so our own pinned digest is the
  verification, recorded here) — **external review N3 scope note: this
  self-computed pin protects against tampering/corruption AFTER the
  digest was recorded, not against a compromised upstream AT pin time
  (a hostile release could publish matching malicious bytes + digest).
  Full protection against pin-time compromise would require a second
  independent source for the digest; out of scope for v1, recorded
  honestly.** Linux `piper_linux_x86_64.tar.gz` extracted in
  the Docker engine image. Resolution order mirrors yt-dlp:
  `LOCALTOOLS_PIPER_PATH` env → repo-local `piper-<tag>/` → Docker path
  `/opt/piper/piper` → PATH; ENOENT → honest 503 tool-unavailable.
- **CLI verified from the installed binary's --help:** `-m model -c config -f
out.wav --sentence_silence N --noise_scale --length_scale --speaker --quiet`,
  stdin = text lines, `-f -` for stdout WAV. Arg arrays only (Section 5.3).
- **Voices:** curated list of 3 for v1, all `medium` quality (~63MB each,
  22050Hz): `en_US-lessac-medium` (default), `en_US-amy-medium`,
  `en_GB-alba-medium` — from `rhasspy/piper-voices` on HF (repo-wide MIT,
  verified from the model card; each voice dir carries its own MODEL_CARD).
  Lazy-downloaded on first use to `<tmp>/localtools-models/piper-voices/`
  (Node) / app data dir (future Tauri sidecar), with **per-file SHA-256
  verification against the HF LFS oid** (recorded in the voices.ts table;
  e.g. en_US-lessac-medium.onnx =
  5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f, verified
  live by download+digest). Adding a voice = one table row (HF path + sha256 +
  display name); the tool's README section documents this.
- **Audiobook chunking limits:** text split into chunks of ≤800 chars at
  sentence boundaries (Piper handles long text but its internal phonemizer
  works best ≤~1000 chars per line and each subprocess call is bounded by the
  file-op timeout); per-chapter files (or one file when the doc has no
  bookmarks) concatenated by the engine into a single WAV via ffmpeg
  (sample-rate-aligned, already a dependency). Caps: input PDF ≤500MB
  (existing maxFileSize), extracted text ≤5MB, max 500 chunks per job.

### D-031 — TTS + audiobook engine shape: Phase 4/7 request harness, no new security surface

`POST /media/text-to-speech` (JSON body: text + voice + speed — text carried
in options like html-to-pdf's inline HTML, allowNoFiles) and
`POST /media/pdf-to-audiobook` (multipart PDF upload) — both through the
existing GroupBRequestHarness (magic-byte PDF sniff, size caps, per-request
temp dir + sweeper, concurrency → 429, anonymous-id logging never logging the
text). Piper runs via runSubprocess (arg arrays, SIGTERM→SIGKILL+taskkill)
with the file-op timeout; output WAV is sniffed (RIFF/WAVE magic) before
returning. Voice/model lazy-download failure surfaces as the Section 13
retry-able `tool-unavailable` variant with model-download-failed copy —
engine reaches for the network only for the pinned HF voice files, exactly
like the whisper model, and the client offers Retry while every other tool
stays usable (asserted by test).

### D-032 — ffmpeg.wasm small-clip browser path: re-deferred (D-021 stands; no rider this session)

Phase 9 shipped STT/auto-captions (the spec-named Group A media scope),
TTS, and audiobook against its acceptance criteria; the optional D-021 rider
(ffmpeg.wasm <50MB trim/convert path) did not fit this session's remaining
budget after the whisper WASM verification work. D-021's routing design
(size-threshold dispatch, explicit UI indication) remains the implementing
record; revisit trigger stays "before Phase 13's CI finalization" — if it
slips past Phase 13, re-serialize it explicitly at Phase 14's size pass.

### D-033 — Phase 10 desktop shell: sidecar is a restricted spawned process, not a Tauri `externalBin` sidecar

**Sidecar-vs-spawned-process choice.** Tauri's `externalBin` mechanism
expects a single static binary renamed per-target at build time
(`engine-x86_64-pc-windows-msvc.exe`). The LocalTools engine is a
Fastify/Node _application_ with a `node_modules` tree — not a single
binary. Bundling it via pkg/nexe/sea would fork the runtime away from
the tested Node 22 LTS line (D-003) and re-validate the entire engine.
Instead the shell spawns the engine as a **restricted child process**:
`std::process::Command` with a minimal env (PATH, SystemRoot, TEMP/TMP
pointed at a scoped `localtools-engine` dir, LOCALAPPDATA + our
LOCALTOOLS_* overrides only), cwd pinned to the bundle dir, stdout/
stderr to a log file, stdin null. Section 5.4 posture: no elevation ever
requested; the engine itself binds 127.0.0.1 only (config.ts refuses
anything else without LOCALTOOLS_EXPOSE, which the shell never sets).
Kill discipline mirrors the engine's own subprocess runner: taskkill
/T /F on Windows (process tree), process-group kill on Unix. Version
pins (verified live from crates.io + installed source, 2026-09-09, not
memory): Rust stable 1.98.1 via rustup 1.29.1 (MSVC host triple — VS
2022 Build Tools VCTools workload installed this session and
link-verified with a hello-world cargo build), tauri crate 2.11.x
(crates.io max 2.11.5), tauri-build 2.6.x, tauri-plugin-single-instance
2.4.x, @tauri-apps/cli 2.11.4 (npm). The client never imports
@tauri-apps/api: the shell injects `window.__LOCALTOOLS__` (invoke-only
bridge, apps/desktop/src-tauri/bridge.js + apps/client/src/lib/
desktop-bridge.ts) so the client bundle stays browser-buildable and
its entry size is untouched. Engine env overrides use the EXISTING
tool-paths.ts resolution order #1 (LOCALTOOLS_*_PATH) — the shell
pre-points them at the final install paths so absent tools surface the
honest 503 tool-unavailable (spawn ENOENT) and, once downloaded, the
very next request succeeds without an engine restart (the override
string was already correct; only the file behind it appears).

### D-034 — Lazy-download doctrine extended to the desktop: URL-pinned + SHA-256-verified for every artifact, extraction probed live per format

Every artifact in `apps/desktop/src-tauri/src/manifest.rs` carries its
exact URL + pinned SHA-256, each digest verified live this session
(2026-09-09): official checksums where they exist (yt-dlp SHA2-256SUMS,
BtbN checksums.sha256 — both cross-matching the repo-local dev installs
D-020/D-025), and download+sha256sum where no upstream checksum ships
(Piper — D-030 doctrine; Ghostscript, Tesseract, LibreOffice MSI,
7-Zip bootstrap chain, qpdf, eng.traineddata). The Ghostscript digest
also matches scoop's ghostscript.json pin for the same release asset
(independent cross-check). **Extraction, all probed live before
writing the code:** Ghostscript gs10080w64.exe is a 7z SFX (extracted
by full 7z.exe — the scoop pattern); Tesseract 5.5.3's setup exe is an
**NSIS** container (7z lists tesseract.exe at the archive root; NOT
Inno Setup — innoextract 1.9 rejects it, which is why the earlier
innoextract plan was dropped); the Tesseract payload ships NO
traineddata files, so eng.traineddata (tessdata_fast) is a separate
SingleFile artifact into tessdata/ — verified by a real OCR round trip
(fixture rendered text: "Page 1 - LocalTools fixture"); LibreOffice MSI
extracts via `msiexec /a <msi> /qn TARGETDIR=<dir>` (administrative
install — NO elevation, verified by a real headless PDF conversion from
the extracted tree; the earlier Inno/zip plans were wrong for this
format); the 7z bootstrap is 7zr.exe → 7z2409-x64.exe → full 7z.exe
(also probed live: 7zr alone cannot read the GS SFX). Layout:
<app_data>/localtools-tools/<tool-id>/ with a `.installed` marker
written only after every current-OS artifact downloaded, digest-
verified, and extracted — a half-finished install never looks complete.
Failed downloads surface retryable errors (network-error /
checksum-mismatch with the file discarded); the client keeps the
Section 13 isolation contract (rest of the app stays usable). Voice
models keep their existing engine-side lazy flow (D-030) with the
shell pointing LOCALTOOLS_VOICE_DIR at the app cache dir.

### D-035 — "qpdf fallback" (spec Phase 10 tool list): plumbing only in v1; qpdf-wasm remains the engine of record

The spec's Phase 10 lazy-download list includes "qpdf fallback". In
the shipped v1 surface every qpdf-backed tool (Protect/Unlock/
Optimize/repair) runs on qpdf-**wasm** in the client worker — there is
no engine-side qpdf consumer to feed a fallback binary to. A native
qpdf fallback matters only as a _future contingency_ (e.g. a
WASM-incompatible host or a structural-repair feature wasm can't
express). Decision: ship the download plumbing (manifest entry, pinned
mingw64/bin-linux zips, LOCALTOOLS_QPDF_PATH binding — the env var
does not exist in tool-paths.ts yet and is reserved) and record this
interpretation; wiring a consumer stays with the phase that needs it.
This mirrors D-013's qpdf contingency note.

### D-036 — Linux desktop: lazy downloads limited to the tools with official portable artifacts

On Linux, Ghostscript (gpl releases ship only source + an unofficial
snap), Tesseract, and LibreOffice have no official portable
single-archive distribution worth pinning. The lazy-download manifest
marks those Windows-only; on a Linux desktop the engine's existing
resolution order (Docker apt paths → PATH) still finds distro-installed
binaries, and LOCALTOOLS_*_PATH remains honored for manual installs.
ffmpeg (BtbN tar.xz), yt-dlp (single binary), piper (tar.gz), and qpdf
(bin zip) DO have official portable Linux artifacts and stay
cross-platform in the manifest. This is honest-degradation, not a gap:
the CI smoke runs on Linux and exercises the cross-platform pipeline;
the Windows click-through covers the Windows-only formats.

### D-037 — Desktop updater + unsigned-app warnings: updater OFF in v1.0; per-OS bypass steps documented in README

**Updater:** the spec names Tauri's built-in updater, which requires
(1) a signing keypair whose PRIVATE key must live in GitHub Actions
secrets and (2) code-signing the installers for the update chain to be
trustworthy. Phase 10 ships the shell WITHOUT updater config
(tauri.conf.json has no updater block — verified against the installed
tauri 2.11 schema: no `plugins.updater` key). Rationale: unsigned
binaries updating themselves is a downgrade (users would train
"ignore the warning → let anything auto-update"); the owner has not
produced signing certs yet (Play Console/signing items were explicitly
deferred in prior sessions). The release-desktop workflow (Phase 15)
will decide the full matrix: if the owner provides secrets, enable the
updater then, keyed off this decision. **Unsigned-app OS warnings**
(spec line 399): README documents the exact bypass steps per OS —
macOS: right-click the app → Open → Open (Gatekeeper unidentified
developer), Windows: SmartScreen → "More info" → "Run anyway", Linux:
AppImage needs `chmod +x` (the AppImage itself is not "unsigned-
blocked" the way mac/win are; document the exec-bit step instead).
These steps live in README's desktop section with screenshots to be
added at Phase 15 polish.

### D-038 — Engine bundle for the desktop: pnpm deploy isolation + pinned Node runtime as a resource

The packaged app ships the engine as a Tauri resource:
`apps/desktop/scripts/build-engine-dist.mjs` builds the engine dist and
materializes an isolated copy via `pnpm --filter @localtools/engine
deploy <target> --prod --legacy` (pnpm 10 requires --legacy for
non-injected workspaces — verified live: ERR_PNPM_DEPLOY_NONINJECTED_
WORKSPACE; target path must be quoted on Windows through the shell).
The bundle (~119MB with prod node_modules) is gitignored and ships as
`bundle.resources`. The Node runtime: dev/CI runs resolve the system
node (paths.rs which-node fallback); **release builds set
LOCALTOOLS_DESKTOP_NODE to pin the nodejs.org v22.23.2 runtime**
(SHASUMS256-verified per D-034's node pins) so the installed app never
depends on a host node. Runtime resolution order (paths.rs):
<resource>/engine/node/node → dev which(node) → honest error. The
bundle was live-verified standalone: booted from the deployed copy,
healthz green, SSRF guard active — before wiring it into the shell.

### D-039 — Phase 11 unified error copy + engine health gating (lib/tool-errors.ts + lib/engine-health.ts + useEngineTooling)

**Error copy consolidation.** Every runner page previously carried its
own ERROR_TEXT map (pdf, image, devtext, speech) or fell back to
`err.message` (EngineRunnerPage, DownloaderPage, TTS, audiobook — the
engine messages are human-audited, but the GROUP C/TTS pages rendered
`isEngineCallError ? err.message : generic`, and future taxonomy drift
would leak). Phase 11 moves ALL copy into
`apps/client/src/lib/tool-errors.ts`: one map per taxonomy
(pdf/image/devtext/speech/engine/bridge) + `friendlyError(err, scope)`
which resolves code → copy and ALWAYS falls back to a friendly sentence
— never a technical message. The "no raw/unstyled error anywhere"
acceptance (spec line 495) is now enforced by test:
`apps/client/test/tool-errors.test.ts` extracts the codes from each
package's own error-union source (pdf-core/src/errors.ts,
devtext-core/src/types.ts, image-core/src/types.ts,
media-core/src/speech.ts, apps/engine/src/errors.ts) and asserts copy
exists for every one — adding a code without copy fails `pnpm verify`.

**Engine health gating.** `lib/engine-health.ts` probes readiness:
desktop shell → bridge `desktop_status {engineReady}` (no network);
browser/dev/Docker → GET /healthz on the shared engine base URL
(`lib/engine-url.ts`, extracted from engine-client so the health poll
and calls can't drift). `hooks/useEngineTooling.ts` bundles: probe on
mount + re-probe on the shell's `engine://ready` event, a gate-before-
run (`gate()` returns false → pages render the shared ENGINE_DOWN_COPY
banner), the tool-unavailable → ToolDownloadPrompt routing (previously
only EngineRunnerPage + DownloaderPage had it; TTS + pdf-to-audiobook
now do too — the Rust tool_for_endpoint already mapped both → piper),
and a green installed-confirmation note after a helper lands. The
engine-down state renders as a styled warning banner
(.lt-engine-banner--down) with a "Check again" button — the rest of
the app stays usable (Section 13).

**Uninstalled-component dismissal copy** stays page-local ("This tool
needs a component that isn't installed.") per the Phase 10 pattern.

### D-040 — Phase 11 real worker progress + unified liveness (additive worker message contract)

The frozen worker request/response contract is extended ADDITIVELY:
`{ id, progress: { done, total } }` as a third response member (pdf +
image worker clients). Handlers that never opted in ignore it, so no
existing call site changes. `pdfToImage` (pdf-core) gained an
`onProgress(done, total)` seam fired per rendered page;
`runBatch` (image-core) gained the same per file. The workers thread
these to the main thread via the new message; `runToolWithProgress` /
`runImageToolWithProgress` register a callback per pending id. Real
granularity where it exists (multi-page renders, 50-file batches),
honest liveness elsewhere: `hooks/useFakeProgress.ts` replaces the
four per-page synthetic tickers (which had drifted to +7/400ms,
+4/500ms, +3/400ms) with ONE app-wide cadence (start 5, +4 per 400ms,
ceiling 90; `nextLivenessPercent` is a pure unit-tested function).
**Batch outputs are now named after their ORIGINAL files**
(`photo-localtools.webp`, not `image-3.webp`) — the worker carries the
input names through, order-preserved.

### D-041 — Engine temp-root isolation for parallel test suites (LOCALTOOLS_TEMP_ROOT)

A pre-existing flake surfaced during Phase 11 verification: the
downloader suite's "no oversized leftover" assertion scanned the
SHARED engine temp root (%TEMP%/localtools-engine), which every engine
vitest file (PDF/media/security/downloader — each in its own worker
process) also writes to via its own in-flight request dirs. A sibling
suite's mid-request 8MB input PDF tripped the 50KB assertion
nondeterministically (the same race exists in security.test.ts's
before/after dir-count and traversal-scan assertions). Fix: temp-dirs
gains a `tempRoot()` seam honoring `LOCALTOOLS_TEMP_ROOT`; the
downloader + security test files boot their engines under private
roots (`localtools-engine-<suite>-test`), so root-scanning assertions
see only their own requests. No production behavior change — the
default root is unchanged; the desktop sidecar's scoped temp (child
TEMP/TMP) composes with the default as before.

### D-042 — Phase 12 accessibility + the dual-environment bugs it exposed

Phase 12's acceptance (Section 14.6: axe-core on every route, 390px
responsive, keyboard sweep) surfaced findings in two classes:

**Accessibility fixes (all in packages/ui + apps/client styles):**

- DropZone rebuilt: the native file input IS the interactive control
  (focusable, Enter/Space opens the picker, aria-labeled) instead of a
  div[role=button] WRAPPING the input — axe flagged 134 nested-interactive
  - 134 label violations app-wide from that one component. Focus ring
    lights the whole zone via CSS :has().
- Seven unlabeled selects (PDF Group B options) got the ids their Field
  labels were already pointing at.
- Token contrast: light `--lt-text-muted` #6b7280→#57606e (4.39:1→5.78:1
  on canvas — muted sits on `--lt-canvas` in nav tabs, not just surfaces);
  dark `--lt-accent-hover` #388bfd→#2a6fe0 (white hover text 3.34→4.72);
  NEW `--lt-accent-text` token (light #0f62fe, dark #58a6ff) for every
  accent-as-TEXT usage — the dark fill-blue read 3.73:1 as text on
  surface; light `--lt-text-faint` #9ca3af→#7d8590 (placeholders
  2.54→3.73, above the 3:1 supplementary bar). A new vitest
  (token-contrast.test.ts) pins every composed pair at >=4.5:1 (faint
  > =3:1) in both themes so token edits can't silently regress contrast.
- Skip-to-content link in SuiteNav (first Tab stop; focuses `<main>`
  programmatically — a hash href would fight the app's hash router);
  ThemeToggle added to the production suite nav (the manual override
  required by Section 8 was previously only reachable on /dev/ui-preview);
  the inert nav search input removed (the functional filter is the page's
  own input); SuiteNav/tabs wrap under 720px so 390px has zero overflow.

**Dual-environment bugs (pre-existing: EVERY Text & Dev tool was broken
in browsers/Workers since Phase 6; Node tests never saw them):**

1. ulid@2.4.0's default export runs detectPrng() at module-evaluation —
   it only recognizes window.crypto, and inside a Web Worker (no window)
   it throws, taking the whole devtext-core import down. ULID is now
   in-house (~30 lines: Crockford base32 over crypto random bytes,
   uniform since 256 % 32 === 0; ulid stays a devDep for the test's
   decodeTime cross-check).
2. clean-css (bundled via csso) and terser read process.platform at
   module-eval — same failure class. Fixed with the standard minimal
   browser `process` shim at the devtext worker entry (Node keeps its
   real process).
3. prettier's browser bundle can't resolve parsers from the Node plugin
   registry — beautify switched to prettier/standalone with explicit
   postcss/babel/estree/html plugins (identical behavior in Node).

Verified empirically: a browser-worker sweep drives all 36 devtext tool
variants through the real production worker — 36/36 in Chromium and the
json-formatter flow in WebKit. Lesson recorded: Node-only test suites
cannot catch module-eval environment assumptions; any package imported
from a Worker context must be exercised IN one.

**WebKit/Safari (Section 13):** WebKit WASM smoke added (Playwright
WebKit): app boots, qpdf-wasm runs a real protect-pdf end-to-end, the
D-029 contract holds (no COOP/COEP needed — not crossOriginIsolated),
devtext worker healthy. True macOS Safari remains an owner manual item
(TESTS.md) — no macOS host in CI yet.

## Phase 13 — Testing & CI finalization

### D-043 — Phase 13 wiring decisions (Section 14 suite into verify + CI; supply chain)

The spec's Phase 13 acceptance: "CI green on a clean PR; the
shell-string-subprocess canary test (14.4) verified once manually then
reverted." What shipped, and the calls inside it:

1. **Bundle-size gate is manifest-walked, not listed by hand.**
   `apps/client/scripts/bundle-size-check.mjs` walks the Vite manifest's
   entry static-import graph (entry + imports, recursive; dynamic imports
   excluded by design — those are the per-tool lazy chunks) and gzips each
   chunk at level 9. Vite's manifest is now emitted
   (`build.manifest: true`) for this. Initial = 121.60KB gzipped vs the
   250KB budget (BUNDLE_SIZE_PASS; the hand-quoted "120.75KB entry JS"
   figure in earlier docs was entry-JS-only — the gate counts entry JS +
   entry CSS, the honest "what loads before any interaction" number).
   Runs as the client `postbuild` script → part of every `pnpm build`,
   hence `pnpm verify` and every CI job that builds.

2. **The offline check became browser-level self-contained.** The
   original Phase 2 script needed a caller to kill the server between
   warmup/verify phases — unwirable into one verify step. Rewritten
   (`apps/client/scripts/offline-test.mjs`): starts its own
   `vite preview` on an ephemeral port, then simulates network-gone via
   puppeteer's `setOfflineMode(true)` (SW cache hits never reach the
   intercepted network layer, so the "server is gone" condition is
   faithfully reproduced), reloads, asserts the Media suite renders.
   OFFLINE_RELOAD_PASS locally with 18 tool cards from cache. The old
   two-phase design lives in git history.

3. **Worker-offload check is also self-contained** (own preview server
   on :4181, always-torn-down) and both browser checks share the Phase 12
   `lib/find-chrome.mjs` discovery (system Chrome → Playwright registry).
   Both are wired at the END of root `pnpm verify` (after build) AND as
   explicit steps in the CI accessibility job (redundant by design —
   the a11y job already has the browser installed; verify keeps them
   because the dev host has Chrome).

4. **14.8 licensing gate = `tools/licensing-check.mjs`**, a zero-dependency
   grep of DECISIONS.md for the five required notes (Ghostscript
   AGPL+subprocess, ffmpeg variant, @imgly status/fallback, RAR
   extraction-only constraint, D-026 mock-downloader). In root
   `pnpm verify` AND a dedicated CI `licensing` job (the spec asks for
   "a CI job grepping" — both belt and suspenders).

5. **Shell-string canary (14.4 acceptance) — both readings satisfied.**
   The spec sentence says "verified once manually then reverted", but a
   reverted-only canary guards nothing tomorrow. So: (a) the live
   verification happened — `shell:false` flipped to `shell:true` in
   subprocess.ts, security.test.ts STILL PASSED (15/15) because hostile
   input never reaches argv (fresh internal names, zod enums — the
   layered defense holds), then the new canary
   `apps/engine/test/shell-canary.test.ts` FAILED with
   `SHELL_CANARY_FAIL: subprocess.ts: shell:true`, then the patch was
   reverted and everything went green. This proves the canary catches
   exactly the class the functional tests cannot. (b) The canary is
   COMMITTED as a permanent regression guard — import-aware
   (child_process only; RegExp.exec and comment "spawn" mentions don't
   false-positive), banning `shell:true`, `exec/execSync`, and
   spawn-without-explicit-`shell:false` in any engine source file.

6. **Supply-chain job (Section 5.5 / DoD):** `pnpm audit --audit-level
high` rides on the verify matrix (fail on any high/critical advisory
   in the committed lockfile); a dedicated `supply-chain` CI job builds
   the engine image and Trivy-scans it (`--severity HIGH,CRITICAL
--exit-code 1 --ignore-unfixed`) plus `cargo audit --deny warnings`
   on the Rust shell. Two real advisories were found and FIXED before
   wiring the gate: js-yaml 4.3.1 → 4.3.2 (GHSA-2883-xcg3-v3hh, high,
   devtext-core's YAML merge-key CPU DoS) and adm-zip 0.6.0 → 0.6.1 via
   root pnpm override (GHSA-vwc7-r8mq-g2x9, moderate, transitive of
   onnxruntime-node). `--ignore-unfixed` on Trivy because bookworm-slim
   base-layer CVEs without an available fix would otherwise permanently
   red the job (recorded here; revisit per-release).

7. **Dependabot** (`.github/dependabot.yml`): weekly npm + cargo +
   github-actions groups. Inert while the repo is private without
   dependency-graph enabled (D-010 public flip in Phase 15 activates it
   for real); committed now so the flip needs no further change.

8. **release-desktop.yml got its real three-OS tauri-action matrix**
   (windows/macos/ubuntu, engine-dist step, draft release) but stays
   `if: false` until Phase 15's signing decision (D-037) — publishing
   unsigned artifacts from a tag early would be worse than not having
   the pipeline. The comment block documents the exact enable step.

## Phase 13 — external pre-release review (Claude) response

### D-044 — Review-response hardening: CONNECT IPv6 parse, mock-seam production gate, ffmpeg.wasm CUT

An adversarial pre-release review of PROJECT_REVIEW/SPEC/DECISIONS/TESTS
(Claude) produced findings ranked Critical/High/Medium/Nit. Verdicts on
the two [NEEDS-CODE-CHECK] criticals, and the changes landed in response:

1. **C1 (SSRF DNS-rebinding pinning) — VERIFIED CLEAN, no change
   needed.** `ssrf-guard.ts` already resolves once, validates EVERY
   returned A/AAAA record (any non-public record → `blocked-host`),
   and opens the socket to the pinned validated IP literal on both
   proxy paths (HTTP: `http.request({hostname: rv.ip, ...})`; CONNECT:
   `net.connect({host: rv.ip, family})`). No second DNS lookup exists
   between validate and connect; per-hop re-validation holds because
   every yt-dlp connection is a new proxy request. Classic rebinding
   is structurally dead.

2. **C1 companion bug found during verification — FIXED.** The
   CONNECT path split `req.url` on ':' to parse authority-form
   targets, mangling bracketed IPv6 literals
   (`[2606:4700::1111]:443` → host "[2606", port 4700): legitimate
   IPv6 HTTPS sites failed through the proxy. Hostile literals failed
   closed (connect error — never a bypass), so this was functional
   breakage, not a security hole. Fixed via `parseConnectTarget()` —
   WHATWG URL parsing handles both `[v6]:port` and `host:port`,
   bracket-free hostname, default port 443, malformed → invalid-option
   (fail closed). Unit-tested in `apps/engine/test/review-hardening.test.ts`.

3. **C2 (mock-exemption backdoor) — HARDENED (gate added).** The
   `LOCALTOOLS_DOWNLOADER_MOCK_TARGET` test seam previously engaged
   from runtime env vars alone (TEST_MODE + MOCK_TARGET); a hostile
   .env or compromised sibling container could open the one-target
   loopback exemption. Now triple-gated: the seam engages ONLY when
   `NODE_ENV=test` is ALSO set. Production posture per artifact:
   Docker pins `ENV NODE_ENV=production` (engine.Dockerfile);
   the desktop sidecar `env_clear()`s — NODE_ENV never reaches the
   child; bare `node dist/server.js` has it unset or production.
   Pinned by tests: production/unset NODE_ENV → seam dead → mock
   target surfaces `blocked-host` exactly like any other loopback
   URL; NODE_ENV=test + both vars → seam opens (the gate is the
   gate). Static artifact tests assert docker-compose.yml never
   forwards the seam vars (explicit allowlist), the Dockerfile pins
   NODE_ENV=production, and sidecar.rs never passes NODE_ENV or the
   seam vars. `.env.example` documents the triple gate.

4. **ffmpeg.wasm — CUT by owner decision (supersedes D-021/D-032).**
   The in-browser small-clip (<50MB) trim/convert path is dropped
   from v1.0.0 scope entirely — moved to the README roadmap as a
   post-1.0 "maybe." Rationale: never load-bearing (Group B ffmpeg
   covers every Media tool engine-side), deferred twice already, and
   Safari/WebKit memory quirks make it a liability for a v1.0.0 tag.
   M2 resolved: no TBD rides into the tag. No client code changes —
   the path was never built; the tool registry/routes all point at
   the engine Group B endpoints.
