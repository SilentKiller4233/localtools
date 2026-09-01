# HANDOFF — read this first in any new session

_Last updated: 2026-09-01 ~23:55 PKT (UTC+05:00), end of session 5 — Phase 3 batches 1–4 committed, CI green; rendering batch next_

## Where things stand right now

**Phases 0–2 complete/pushed/CI-green. Phase 3 (PDF Group A) is ~70% done, all committed+CI-green on `main` (HEAD `2118068`):**

- **Batch 1** `0ac2f9a` — vitest 4 harness wired into `pnpm verify` (format→lint→typecheck→test→build), Section 14.2 fixtures at root `fixtures/pdf/` (deterministic generator + globalSetup fills-missing-only; `password-protected.pdf` via host-side pypdf), ToolError taxonomy, shared `loadPdf` (size-cap-before-parse + `maxBytes` seam, raw `/Encrypt` trailer sniff → encrypted-pdf redirect, zero-page detection). Merge/Split/Extract/Delete/Rotate.
- **Batch 2** `e05bdaf` — addPageNumbers, addTextWatermark, editMetadata/readMetadata, resizePages, nUpPages. (63 tests)
- **Batch 3** `0e37d1a` — qpdf-wasm singleton (`src/qpdf.ts`, arg-array callMain only), protectPdf/unlockPdf/optimizePdf, extractText (pdfjs 6 legacy build for Node), imagesToPdf (magic-byte sniffing), fillForm/readFormFields. (86 tests)
- **Batch 4** `2118068` — redactPdf (**Section 14.3 mandatory test PASSES**: string absent from raw bytes + text layer, black box drawn in decompressed stream), comparePdfs (text diff), organizePages, repairPdf, quickCompress, setBookmarks/readBookmarks, streams.ts codec. (111 tests)

`pnpm verify` green (all 8 workspaces + 111 pdf-core tests in the turbo gate). Working tree clean after the docs commit.

## Last thing done

Batch 4 committed + pushed + CI run 33545077227 green (all 3 jobs). TESTS.md updated with batch rows; this HANDOFF rewrite is the session's final repo action.

## In-progress / uncommitted work

None after this docs commit. All four batches are inside `0ac2f9a`, `e05bdaf`, `0e37d1a`, `2118068` on `main`, pushed, CI-verified.

## Next immediate steps (in order — do these first)

1. **Batch 5 — rendering-dependent tools:** pdf-to-image (pdfjs render→PNG/JPG), compare-visual (render + pixelmatch), grayscale (render→desaturate→re-embed). These need a **canvas strategy decision → record as D-014**: browser-native canvas + Node test path via `@napi-rs/canvas` (pdfjs's own optional dep — already declared, zero new deps) OR render only in the browser with a graceful engine-side error. Check what pdfjs 6.3.289 expects (`canvasFactory` option) before committing.
2. **Batch 6 — client-UI-only tools:** scan-to-pdf (camera capture component), sign-pdf (draw/type/image pad) — these are UI-component work in `apps/client`, logic lands with the UI wiring batch.
3. **Batch 7 — client UI wiring:** per-tool real pages (drop zone → options → progress → human-readable errors per Section 9), Web Worker offload, 50MB no-main-thread-blocking check (Section 14.5), wire the implemented 19 tools into the ToolPage placeholders.
4. Update SUMMARY.md to Phase 3 complete (PDF suite Group A done), TESTS.md rows, DECISIONS.md D-014, commit `feat(pdf): Phase 3 — PDF suite Group A complete`, push, CI green.

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- Classic PAT (repo+workflow scopes) transited chat ~3 sessions ago — rotate before Phase 15's public flip.
- Context7 MCP is NOT connected in this environment — version-sensitive APIs are verified from installed `.d.ts`/source instead. Consider recording this deviation in DECISIONS if it persists next session.
- Deferred: @imgly license re-check (Phase 5), ffmpeg variant (Phase 7), SECURITY.md contact (D-006).

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — always quote). Windows, bash (MSYS). pnpm 10.34.5, Node 22.
- Ports 4173/5173/8787 free. Git auth: classic PAT in `~/.git-credentials` + gh hosts.yml; push over HTTPS works.
- pypdf 6.16.2 installed host-side (fixture generation only, not a project dep).
- pdf-core deps: pdf-lib 1.17.1, pdfjs-dist 6.3.289, @neslinesli93/qpdf-wasm 0.3.0, pixelmatch 7.2.0, diff 9.0.0 (+types). `@napi-rs/canvas` is pdfjs's optionalDependency — check if it's already in node_modules before adding anything for D-014.
- pdf-core tsconfigs: `tsconfig.json` (src+test+scripts, noEmit) vs `tsconfig.build.json` (src→dist only).

## Useful context / gotchas discovered this session

- **pdf-lib `context.obj('string')` → PDFName, not PDFString** — outline titles must use `PDFString.of()` explicitly. Verified live (`/Start` vs `(Start)`).
- **pdf-lib `save()`/`load()` stamp Producer in the CONSTRUCTOR via `updateInfoDict` when `updateMetadata: true` (default)** — read back with `load(bytes, {updateMetadata: false})` when asserting Producer.
- **`PDFEmbeddedPage.scale()` returns only `{width, height}`** — pass original embedded page + width/height options to `drawPage()`.
- **qpdf-wasm requires a non-empty owner password for AES-256** (empty owner pw = openable without password = insecure → exit 2). protectPdf defaults owner password to the user password.
- **qpdf AES-256 output trips pdf-lib's `throwOnInvalidObject` before its EncryptedPDFError fires** — hence the raw `/Encrypt` trailer sniff in loadPdf BEFORE any parse.
- **pdfjs 6 in Node needs the legacy build** (`pdfjs-dist/legacy/build/pdf.mjs`) — the standard build's worker spawn hangs 30s+ under vitest. Also: `destroy()` is on the loadingTask, `PDFDocumentProxy` only has `cleanup()`.
- **pdf-lib `Contents()` returns `PDFStream | PDFArray | undefined`** — narrow with `instanceof PDFArray` before `.asArray()`.
- **strict lint forbids defensive checks on closed unions** (`no-unnecessary-condition`) — type user-facing options as `string` + validate at runtime. Cross-environment `process` checks need a targeted eslint-disable.
- **pdf-lib emits text as HEX strings** `<...> Tj` — redaction's scanner must match literal AND hex forms.
- Redaction content streams are Flate-compressed — tests must inflate before regex-matching box ops.
- `new URL(bare-specifier)` does NOT resolve package specifiers — use `createRequire().resolve()` in Node for wasm paths.
- qpdf-wasm's `.d.ts` omits `FS.writeFile` (runtime has it) — one narrow cast bridges it.
- **Turbo caches `test` aggressively** — `pnpm test --force` to prove tests ran.
- Prettier gate covers root `.md` — `prettier --write` before verify.
- pdfjs `standardFontDataUrl` warning in tests is benign (Helvetica fixture needs no font file).
