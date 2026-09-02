# HANDOFF — read this first in any new session

_Last updated: 2026-09-02 ~19:20 PKT (UTC+05:00), end of session 6 — Phase 3 COMPLETE (PDF Group A 21/21), pushed; CI status to confirm on open_

## Where things stand right now

**Phases 0–3 complete. Phase 3 (PDF suite Group A) is DONE**: all 21 Group A tools implemented in `@localtools/pdf-core` (165/165 tests), wired into real client tool pages (Web Worker offload, Section 9 pattern), and the Section 14.5 worker-offload acceptance **PASSED** (52MB fixture → 0 main-thread long tasks through the production UI). Everything is committed on `main` and pushed; confirm CI green on the final push before starting Phase 4.

Session 6 commits (on top of session 5's `cdab492`):

- `84fa0f8` — batch 5: render pipeline (D-014) + pdf-to-image/visual-compare/grayscale (138 tests)
- final commit (this session) — batches 6+7: crop, sign, redact-by-text (165 tests) + full client wiring (worker bridge, 21 real tool pages, CameraCapture, SignaturePad, vite worker/asset config, worker-offload-test script) + docs close-out (SUMMARY.md at Phase 3 complete, TESTS.md batch rows, D-014).

## Last thing done

Batches 6+7 completed and verified: pdf-core 165/165, client tsc+eslint+vite build green (initial JS 72.9KB gzipped), `WORKER_OFFLOAD_PASS` via `apps/client/scripts/worker-offload-test.mjs` (52MB padded fixture — verified parseable by pdf-lib — merged through the real Merge PDF page in headless Chrome with PerformanceObserver long-task counter: 0 tasks / 0ms). `pnpm verify` green before commit. This HANDOFF rewrite is the session's final repo action.

## In-progress / uncommitted work

Verify before trusting: the final commit + push at the end of this session included everything (check `git status` is clean and `git log --oneline -3` shows the Phase 3 complete commit). If CI on the final push shows failures, fix-forward on a new commit — do not amend.

## Next immediate steps (in order — do these first)

1. Confirm CI green on the last two pushes (`gh run list --limit 3` or the GitHub Actions page; repo: SilentKiller4233/localtools, private).
2. **Phase 4 — PDF Group B (engine, Docker target)**: Fastify endpoints for the 6 Group B tools (LibreOffice ↔Office, OCRmyPDF/Tesseract OCR, Ghostscript deep-compress/PDF-A/deep-repair, WeasyPrint default + Playwright opt-in HTML→PDF) behind the FULL Section 5 control set (5.1–5.7: loopback bind, magic-byte validation via `file-type`, size caps, per-request temp dirs + 5-min sweeper, execFile/spawn arg-arrays ONLY, timeouts with SIGTERM→SIGKILL, subprocess concurrency caps + 429). Fixtures: sample .docx/.xlsx/.pptx/.html already spec'd in Section 14.2. Docker stack test is the phase acceptance.
3. Wire engine Group B endpoints into the existing ToolRunnerPage pattern (engine URL fetch instead of worker runTool — add an `engine-client.ts` alongside `pdf-worker-client.ts`).

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- Classic PAT (repo+workflow scopes) transited chat ~4 sessions ago — rotate before Phase 15's public flip.
- Context7 MCP is NOT connected in this environment — version-sensitive APIs verified from installed `.d.ts`/source (D-014 was done this way).
- Deferred: @imgly license re-check (Phase 5), ffmpeg variant (Phase 7), SECURITY.md contact (D-006).
- **Composio GitHub integration is available but plain git+PAT was used this session (pushes worked fine)** — spec Section 12 prefers Composio for repo actions; use whichever is reliable, but note the deviation if it persists.

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — always quote). Windows, bash (MSYS). pnpm 10.34.5, Node 22.
- Ports 4173/5173/8787 free (4173 preview server killed at session end).
- pdf-core deps: pdf-lib 1.17.1, pdfjs-dist 6.3.289, @neslinesli93/qpdf-wasm 0.3.0, pixelmatch 7.2.0 (ships own types), diff 9.0.0. `@napi-rs/canvas` = pdfjs's optionalDependency (never a direct dep — D-014).
- Client now depends on `@localtools/pdf-core` (workspace). Vite config: `worker.format='es'` (module workers — required for the worker's lazy pdfjs/qpdf imports) + inline `localtools-pdf-assets` plugin copying `pdfjs-dist` `standard_fonts/cmaps/wasm` and `qpdf.wasm` to `/pdfjs/*` + `/wasm/qpdf.wasm` in dev AND build (`closeBundle` → `dist/`).
- pypdf 6.16.2 host-side (fixture generation only).
- pdf-core tsconfigs: `tsconfig.json` (src+test+scripts, noEmit) vs `tsconfig.build.json` (src→dist). Client consumes pdf-core's `dist/` — **rebuild pdf-core (`pnpm --filter @localtools/pdf-core build`) before client typecheck after changing pdf-core src**.
- Turbo caches `test` aggressively — `pnpm test --force` to prove tests ran.

## Useful context / gotchas discovered this session

- **napi `putImageData` requires a REAL ImageData from the SAME context** (`ctx.createImageData(w,h)` then `.data.set(...)`); duck-typed `{data,width,height}` objects throw "Failed to recover ImageData type from napi value".
- **`standardFontDataUrl` in Node must be a plain fs path** (Node's `_fetch` is bare `fs.readFile`); `file://` URLs fail on spaces and standard-14 fonts silently don't render (spike: dark pixels 2582 → 4674 after fix).
- **`useWorkerFetch: false` is required in getDocument inside a Worker** — the default chain touches `document.baseURI` (ReferenceError, no DOM in Workers).
- **Under pnpm isolation pdf-core cannot `require('@napi-rs/canvas')`** — all skia canvases must come from `doc.canvasFactory`.
- **pdfjs's `DOMCanvasFactory`/`BaseCanvasFactory` are NOT exported** from its builds — a Worker needs a self-built contract-complete factory class (see `OffscreenCanvasFactory` in `packages/pdf-core/src/render.ts`).
- **Node-only imports (`node:url`, `node:module`) must sit behind a runtime `require` in pdf-core** — static imports break Rollup when the browser Worker bundles pdf-core (fixed in qpdf.ts + render.ts via `nodeRequire`-style helpers with hand-rolled interfaces; `import()`-type annotations and `NodeRequire` are banned by the lint config).
- **Vite worker default format is IIFE — incompatible with the worker's code-split lazy imports**; `worker: { format: 'es' }` is mandatory.
- `exactOptionalPropertyTypes` forces conditional spreads for every optional JSX prop (`...(x ? { prop: x } : {})`) in client TSX.
- DOM-lib "always defined" globals (`document`, `navigator.mediaDevices`) that genuinely disappear at runtime (Workers, insecure contexts) must be read through `as unknown as {...}` widened views or the type-aware lint calls the guard dead code.
- `.mjs` scripts must be plain JS (no TS annotations) — Node parses them raw.
- 52MB test fixture strategy: real `simple-text.pdf` padded with a giant `%` comment line to 52MB — pdf-lib parses it fine (verified); avoids committing a huge blob while making parse cost scale with real byte volume.
- **429 rate limits on the free provider**: batch tool calls, prefer one background `pnpm verify` over repeated foreground runs.
- Prior sessions' pdf-lib/pdfjs/qpdf gotchas (hex Tj strings, producer stamp at construction, qpdf AES-256 owner-password, legacy build for Node, etc.) all remain valid — see pdf-document-processing skill + earlier HANDOFFs in git history.
