# TESTS.md — verification log

Living record of automated coverage and `[manual]` checks per PROJECT_SPEC
Section 14. Automated tests run via `pnpm verify` (grows through Phase 13);
manual items are logged here as they are performed, never assumed done.

## Status: Phase 0

| Check                                                | Kind                    | Result             | Notes                                                                                                    |
| ---------------------------------------------------- | ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `pnpm install && pnpm build` succeeds with stub apps | automated (local)       | PASS               | Acceptance criterion for Phase 0                                                                         |
| Prettier format check                                | automated (local)       | PASS               | Part of `pnpm verify`                                                                                    |
| ESLint (strictTypeChecked) across workspaces         | automated (local)       | PASS               | Part of `pnpm verify`                                                                                    |
| TypeScript strict typecheck (all workspaces)         | automated (local)       | PASS               | `noUncheckedIndexedAccess` etc. enabled                                                                  |
| Engine `/healthz` runtime smoke test                 | manual (local, one-off) | PASS               | HTTP 200 `{"ok":true,"data":{"status":"ok"}}`; netstat confirmed listener bound to `127.0.0.1:8787` only |
| CI workflow syntax valid                             | automated (push)        | pending first push | ci.yml runs verify on ubuntu+windows                                                                     |

## Status: Phase 2

Phase 2 acceptance (Section 15): "Lighthouse PWA ≥90; offline reload works."
**Lighthouse 12 removed the PWA category entirely** — the "PWA ≥90" half of the
acceptance is unsatisfiable as written. The honest equivalents (Chrome
installability via valid manifest/SW/icons + a demonstrated offline reload)
were executed instead; rationale recorded as D-012. Performance tuning is
deferred to Phase 14 per spec phase order.

| Check                                                      | Kind              | Result | Notes                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify` (format + lint + typecheck + build, 8 tasks) | automated (local) | PASS   | Full Phase 2 tree                                                                                                                                                                                                                                                      |
| Bundle size (Section 8 budget 250KB gzipped)               | automated (local) | PASS   | 63.9KB gzipped initial JS — well under budget                                                                                                                                                                                                                          |
| Route + PWA asset smoke on prod build                      | manual (local)    | PASS   | All suite/tool routes + `manifest.webmanifest` / `sw.js` / icons serve HTTP 200 on `vite preview`                                                                                                                                                                      |
| Lighthouse 12 (real run against prod build)                | manual (local)    | PASS   | **perf 82 / a11y 100 / best-practices 100 / SEO 91**; no PWA category exists in Lighthouse 12 (removed upstream); perf tuning belongs to Phase 14                                                                                                                      |
| Offline reload (Section 8)                                 | manual (local)    | PASS   | `scripts/offline-test.mjs` (puppeteer-core + system Chrome): warmup pass confirmed `serviceWorker controlling:true` → server killed and verified down (curl connect refused) → reload rendered `h1="Media Tools"` + 18 tool cards from cache → **OFFLINE_RELOAD_PASS** |
| Chrome installability prerequisites                        | manual (local)    | PASS   | Manifest + versioned SW + icon set (SVG + PNGs) served; SW registers and controls the page on first load                                                                                                                                                               |

## Status: Phase 3 (in progress — batch 1 of the PDF Group A tools)

First functional-tool batch in `@localtools/pdf-core` (harness + foundational
five). All Section 14.1 paths per tool: happy / malformed / empty / oversized.
Harness decisions (vitest per-package, committed fixtures, `maxBytes` seam,
pypdf-generated encrypted fixture, truncated-real-PDF malformed fixture) are
recorded as D-013.

| Check                                                                                                         | Kind      | Result | Notes                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loadPdf shared error paths (empty/malformed/zero-page/encrypted/oversized)                                    | automated | PASS   | 11 tests, `test/load.test.ts`; encrypted → redirect message naming the Unlock tool (Section 13)                                                                                                                               |
| Merge — 3 docs→6pp, single-doc, no-inputs, bad member, empty-bytes member, encrypted member                   | automated | PASS   | `test/tools.test.ts`                                                                                                                                                                                                          |
| Split — every-n=2 → 2+1pp, invalid n, by-size single/multi part, malformed, empty                             | automated | PASS   | by-size uses deterministic greedy fill (documented in-code)                                                                                                                                                                   |
| Extract — "1,3"→2pp, full-range, out-of-bounds, empty selection, malformed                                    | automated | PASS   | Ascending-order emission; custom order is Organize's job                                                                                                                                                                      |
| Delete — "2"→2pp, "1-2"→1pp, all-pages rejected, empty selection, malformed                                   | automated | PASS   | Remove-everything rejected (a PDF needs ≥1 page)                                                                                                                                                                              |
| Rotate — 90° all→[90,90,90], subset, 45° rejected, malformed, empty                                           | automated | PASS   | Cumulative rotation via `setRotation((current + angle) % 360)`                                                                                                                                                                |
| `pnpm verify` full gate incl. new test step                                                                   | automated | PASS   | verify = format→lint→typecheck→**test**→build; pdf-core 38/38                                                                                                                                                                 |
| Batch 2: page-numbers / watermark / metadata / resize / n-up                                                  | automated | PASS   | 63/63; pdf-lib traps: constructor-time Producer stamp, scale() returns geometry only                                                                                                                                          |
| Batch 3: protect/unlock/optimize (qpdf-wasm), extractText (pdfjs legacy), imagesToPdf (magic bytes), fillForm | automated | PASS   | 86/86; qpdf requires owner password on AES-256 (defaults to user pw); raw /Encrypt trailer sniff before parse; pdfjs legacy build for Node                                                                                    |
| Batch 4: redact (**14.3 mandatory PASS**), compare, organize, repair, bookmarks, quickCompress                | automated | PASS   | 111/111; redaction verified absent from raw bytes + text layer with black box drawn (decompressed stream check)                                                                                                               |
| Batch 5: pdf-to-image, visual compare (pixelmatch), grayscale (D-014 canvas pipeline)                         | automated | PASS   | 138/138; pdfjs render via its own auto-factory (Node: @napi-rs/canvas as pdfjs's optional dep; Worker: OffscreenCanvasFactory); real PNG/JPEG bytes + pixel diff verified                                                     |
| Batch 6: crop, sign, redact-by-text                                                                           | automated | PASS   | 165/165; crop = CropBox margins (MediaBox untouched); sign = type/draw/image visual placement (Section 7 no-esignature boundary); redact-by-text passes the 14.3 substance via pdfjs text positions → genuine content removal |
| Batch 7: client wiring — all 21 PDF Group A tools as real pages, Web Worker offload                           | automated | PASS   | client tsc+eslint+vite build green; 52MB fixture merged through the production UI with **0 main-thread long tasks** (`scripts/worker-offload-test.mjs`, Section 14.5 acceptance)                                              |
| PDF suite Group A complete — 21/21 tools functional                                                           | automated | PASS   | 165/165 pdf-core tests; every Section 3.1 Group A tool implemented, tested, and wired into its real tool page                                                                                                                 |

## Pending (scheduled by later phases)

- Per-tool functional tests — Phases 3–9 (Section 14.1/14.2)
- Redaction content-removal test — Phase 3 (Section 14.3)
- Security regression suite incl. Group C SSRF set — Phases 4/7/8 (Section 14.4)
- Performance/bundle-size/Lighthouse — Phases 2 & 14 (Section 14.5)
- axe-core accessibility scans — Phase 12 (Section 14.6)
- Docker round-trip + desktop smoke test — Phases 10–13 (Section 14.7)
- Licensing-docs CI grep — Phase 13 (Section 14.8)

## Manual log

(no manual checks performed yet)

## Status: Phase 4 (PDF suite Group B — engine, Docker target)

Section 15 Phase 4 acceptance: "Section 14.1/14.4 pass for every PDF Group B
tool; Docker stack test passes." Engine suite runs the REAL native tools
installed on the dev host (Ghostscript 10.07.1, Tesseract 5.4, LibreOffice
26.8, WeasyPrint 69 + GTK3 runtime); the Docker stack acceptance runs as a
CI job (compose-stack) because the dev host has no Docker (D-015).

| Check                                         | Kind              | Result       | Notes                                                                                                                   |
| --------------------------------------------- | ----------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Engine unit/integration suite (39 tests)      | automated (local) | PASS         | 14.1 happy/malformed/empty/oversized per tool + 14.4 security regressions; real native tools, container-sniffed outputs |
| Office to-PDF (docx/xlsx/pptx → PDF)          | automated (local) | PASS         | LibreOffice headless via soffice.com; outputs magic-byte verified as PDF                                                |
| Office from-PDF (PDF → docx/pptx)             | automated (local) | PASS         | Pinned import filters + explicit OOXML export (D-015): genuine word/ + ppt/ containers with text                        |
| Office from-PDF (PDF → xlsx)                  | automated (local) | PASS         | Clear unsupported error — LibreOffice has no Calc PDF import (D-015)                                                    |
| OCR (scanned PDF → searchable PDF)            | automated (local) | PASS         | Tesseract fallback path (no OCRmyPDF on host); 2.9s on fixture                                                          |
| Deep compress / PDF-A / deep repair           | automated (local) | PASS         | Ghostscript pdfwrite; malformed fixture salvaged OR clean tool-failed                                                   |
| HTML→PDF (inline + uploaded)                  | automated (local) | PASS         | WeasyPrint via launcher + @page stylesheet (D-015)                                                                      |
| Playwright opt-in without component           | automated (local) | PASS         | 503 tool-unavailable, never silent WeasyPrint fallback                                                                  |
| Security: headers/CSP/exact-origin CORS       | automated (local) | PASS         | 5.7 headers on every response via fastify-plugin (encapsulation bug fixed)                                              |
| Security: magic bytes vs hostile filenames    | automated (local) | PASS         | Command-injection-style + traversal names never reach the filesystem                                                    |
| Security: caps (per-file/request/empty/none)  | automated (local) | PASS         | 413/422 mapped through the JSON envelope; tiny-cap seam for oversized                                                   |
| Security: temp-dir cleanup on success+failure | automated (local) | PASS         | finally-block removal + 5-min sweeper                                                                                   |
| Security: concurrency cap → 429               | automated (local) | PASS         | 1-slot engine; /healthz busy counter for deterministic polling                                                          |
| Security: expose-refusal + bearer 401         | automated (local) | PASS         | Boot refuses LOCALTOOLS_EXPOSE without ≥32-char token; auth via fastify-plugin                                          |
| Docker stack round trip                       | automated (CI)    | pending push | compose-stack job: build, healthz gate, deep-compress through container                                                 |
