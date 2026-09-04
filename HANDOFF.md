# HANDOFF — read this first in any new session

_Last updated: 2026-09-04 ~03:20 PKT (UTC+05:00), end of session 8 — Phase 5 COMPLETE (Image suite, 14/14 tools, 65/65 tests), pushed as `ad50494`; CI status to confirm on open_

## Where things stand right now

**Phases 0–5 complete.** Phase 5 (Image suite, entirely Group A) is DONE end-to-end: all 14 tools implemented in `@localtools/image-core` (65/65 tests against REAL codecs/wasm/ONNX inference), wired into client pages via a dedicated image worker (`image.worker.ts` + `image-worker-client.ts`, same frozen bridge pattern as pdf). `pnpm verify` fully green locally (165 pdf + 39 engine + 65 image tests + builds; initial JS 78.1KB gzipped, budget 250KB). Committed as `ad50494` on top of `24852a4` and pushed.

## Last thing done

Phase 5 commit `ad50494` pushed (44 files: image-core src/tests/fixtures, client worker + ImagePageSpec, docs D-016/D-017 + SUMMARY/TESTS). CI is running — the verify matrix runs the image suite for the first time on CI runners: **the background-remover test downloads the u2netp model (4.5MB) from HuggingFace on first run** (~30s) and OCR lazily fetches tesseract traineddata; both have generous testTimeouts (120-180s) but CI network latency is the risk. If the background test fails on download, make the test skip-if-unreachable (honest `unavailable` marker, like the engine's 503 pattern) rather than raising the timeout forever.

## In-progress / uncommitted work

Verify before trusting: `git status` should be clean (this HANDOFF rewrite rides in the next docs commit if CI is green; if CI is red, fix-forward first). The working set includes committed-pending only.

## Next immediate steps (in order — do these first)

1. Confirm CI green on `ad50494` (`gh run list --limit 1`; repo SilentKiller4233/localtools). Watch compose-stack too (unchanged code, should pass) and the verify matrix (image suite first CI run — see the model-download note above). Fix-forward if red, never amend.
2. **Phase 6 — Text & Dev suite (entirely Group A, 30 tools)**: JSON/YAML/CSV/XML formatters-converters, base64, URL, JWT decoder, hashes (Web Crypto + spark-md5), UUID/ULID, regex tester, text diff (reuse `diff`), CSS/JS/HTML minify-beautify, Markdown ↔ HTML + Markdown→PDF, color converter, gradient, cron parser (cronstrue), timestamp, case converter, slug, lorem, QR (qrcode + jsQR), barcode, password generator, fake data (faker), unit converter, zip/unzip (fflate), file hash, sitemap/robots, OG preview. New `devtext-core` package, same harness + worker pattern (pdf/image are the templates). Acceptance: 14.1 per tool — mechanical but do NOT skip tests because the tools are simple (spec says this explicitly).
3. Wire into client (devtext worker + pages via the same ToolRunnerPage-family pattern).

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- **Discord webhook STILL dead** (HTTP 401 "Invalid Webhook Token" re-verified end of session 7). The user said it was fixed but never provided the new URL — ask again; if none, log-and-skip per protocol.
- Classic PAT rotation still pending (needed before Phase 15's public flip).
- Context7 MCP still NOT connected — verify APIs from installed `.d.ts`/source (D-014/D-015/D-017 were done this way).
- Composio GitHub integration still unused (git+PAT works).
- Safari/WebKit quirks on @jsquash/onnxruntime/tesseract wasm in Workers — scheduled for Phase 12 (noted in TESTS.md).

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — quote paths). Windows 11, bash (MSYS). pnpm 10.34.5, Node 22.
- Dev-host native tools (Phase 4): Ghostscript repo-local `gs10.07.1/`, Tesseract 5.4, LibreOffice 26.8 (`soffice.com`), GTK3 repo-local `GTK3-Runtime Win64/`, WeasyPrint via `py` launcher. Both repo-local dirs gitignored.
- **Image model cache**: `u2netp.onnx` (4.57MB, Apache-2.0) is pre-cached at `%LOCALAPPDATA%/Temp/localtools-models/u2netp.onnx` — the background-remover test finds it there via beforeAll; do NOT delete. Source: `huggingface.co/baby2008/u2net-onnx` (the rembg GitHub main-branch URL is dead — release assets only, which don't include the model).
- image-core tsconfigs split like pdf-core: `tsconfig.json` (src+test noEmit) / `tsconfig.build.json` (src→dist). Client consumes `dist/` — **rebuild image-core after changing its src before client typecheck**.
- Turbo caches `test` aggressively — `pnpm test --force` to prove tests ran.
- Image fixtures at `fixtures/image/`: sample.png/jpg/webp/heic + **sample-with-exif.jpg (real GPS 33°41′N 73°04′E)** + sample-object.png (white square on dark, for background-remover assertions) + malformed/empty pairs.

## Useful context / gotchas discovered this session

- **@jsquash encoders return ArrayBuffer, NOT Uint8Array** (D-017): every encode path must normalize (`out instanceof Uint8Array ? out : new Uint8Array(out)`) or downstream sniffers see garbage (`bytes[0]` undefined on ArrayBuffer). This silently broke convert→re-decode chains until the sniffer mystery was traced.
- **@jsquash Node init contract (D-017)**: png → `init(<ArrayBuffer>)` from `codec/pkg/squoosh_png_bg.wasm`, named exports; jpeg/webp/avif → `init(new WebAssembly.Module(bytes))` from separate `codec/dec|enc` wasm files, DEFAULT exports on the inner `decode.js`/`encode.js` (not re-exported through index). Resolve paths via `createRequire().resolve('@jsquash/<pkg>/package.json')`. Buffer's `.buffer` may be SharedArrayBuffer-backed — copy into a fresh ArrayBuffer for WebAssembly APIs.
- **heic2any is browser-only** (hard `window` reference at import). `heic-decode` (libheif-js wasm, ISC) works in Node AND browser: API is `one({ buffer })` (NOT `{ data }`) returning RGBA.
- **onnxruntime-node**: `InferenceSession.create(bytes)`, feed via `new ort.Tensor('float32', data, [1,3,320,320])`; u2netp input name is discoverable via `session.inputNames` (falls back to `'input.1'`). Output is `[1,1,320,320]` sigmoid mask. Inference on 64×64: ~700ms.
- **Solid-color images give near-zero u2net foreground** — legitimate (no salient object); the spec's edge-case note ("UI must not imply a guaranteed perfect cutout") maps to the tool's hint copy.
- **vitest 4 + tesseract.js**: OCR works in Node; the lazy traineddata download makes first-run slow (testTimeout 120s). Bitmap-font OCR: tesseract reads blocky 5×7 font text fine at 512px canvas ("HELL" for "HELLO" — accept partial reads in tests, don't chase perfect glyph rendering).
- **eslint no-unnecessary-type-assertion on Record<string,unknown> → specific option types**: tsc accepts the cast, eslint flags it as unnecessary when the param accepts the wider type — drop the cast.
- **`process.versions` under @types/node is non-optional** — `typeof process !== 'undefined' && process.versions.node` triggers no-unnecessary-condition; read through a widened view (`(globalThis as { process?: … }).process`).
- Prior sessions' gotchas all remain: LibreOffice from-PDF filters, WeasyPrint launcher/GTK, fastify-plugin encapsulation, pnpm-deploy Docker images, Python str.replace fails on CRLF (use the patch tool), `.mjs` files are parsed raw (no TS).
