# HANDOFF — read this first in any new session

_Last updated: 2026-09-05 ~01:35 PKT (UTC+05:00), end of session 9 — Phase 6 COMPLETE (Text & Dev suite, 30/30 tools + zip/unzip, 172/172 tests); **CI GREEN on `7de14fe`** (run 33911831311)

## Where things stand right now

**Phases 0–6 complete.** Phase 6 (Text & Dev suite, entirely Group A) is DONE end-to-end: all 30 Section 3.4 tools plus zip/unzip (Section 3.5) implemented in `@localtools/devtext-core` (172/172 tests — real libraries, real PNG/QR round-trips, real fflate archives), wired into the client via a dedicated devtext worker (`devtext.worker.ts` + `devtext-worker-client.ts`, same frozen bridge pattern as pdf/image) and a text-first `DevTextRunner` frame + per-tool pages for all 30 tool cards. `pnpm verify` fully green locally BEFORE commit (441 tests: 165 pdf + 39 engine + 65 image + 172 devtext; initial JS 86.28KB gzipped, budget 250KB). Committed as `7de14fe`, pushed to `origin/main`. **CI GREEN on `7de14fe`, run 33911831311** — verify matrix passed with the devtext suite (172/172) on both OS runners + compose-stack job.

## Last thing done

Phase 6 closed out end-to-end in one session: devtext-core package (13 tool modules + types with DevTextToolError taxonomy and maxChars/maxBytes seams), 172 tests, committed fixtures at `fixtures/devtext/` (13 files incl. real `qr.png` + `sample.zip`), full client wiring, docs (D-018/D-019 in DECISIONS.md, TESTS.md Phase 6 rows, SUMMARY.md Phase 6 state), prettier-formatted docs before commit (the Phase 5 lesson), `pnpm verify` green, committed + pushed as `7de14fe`. **CI on `7de14fe`: GREEN (run 33911831311, success).** Note: `format:check` runs before tests — the intentionally-malformed fixtures (`malformed.json/.yaml/.csv/.xml`) are now in `.prettierignore` (Prettier cannot parse them by design).

## In-progress / uncommitted work

None — working tree clean, everything pushed as `7de14fe`. HANDOFF.md is this session's final docs commit; CI confirmation is the only outstanding item (check first thing).

## Next immediate steps (in order — do these first)

1. **Phase 7 — Media conversion (Group B, ffmpeg)**: video/audio convert, compress (CRF presets), trim (lossless stream-copy where allowed), merge, extract-audio, video↔GIF, audio convert/compress/trim, loudness normalize, burn subtitles, resolution changer — all via ffmpeg on the engine (`apps/engine`), following the Phase 4 harness (request harness with the full Section 5 control set already in place). Acceptance: 14.1/14.4/14.5 per tool, incl. the **ffprobe sanity check** confirming output bitrate/resolution matches the preset (14.5).
2. Wire client: engine endpoints → `engine-client.ts` + `EngineRunnerPage`-family pages for each media tool card (Phase 4 pattern).
3. Commit per phase, prettier-format any doc before commit, `pnpm verify` before "done", SUMMARY/TESTS/DECISIONS updated at phase end; HANDOFF rewrite last.

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- **Discord webhook**: the session-8 URL lives only in that session's chat — ask the user for a fresh one if needed; NEVER write it into any repo file (repo goes public at Phase 15).
- Classic PAT rotation still pending (needed before Phase 15's public flip).
- Context7 MCP still NOT connected — verify APIs from installed `.d.ts`/source (D-014…D-019 all done this way).
- Composio GitHub integration still unused (git+PAT works).
- Safari/WebKit WASM/Worker quirks — scheduled for Phase 12 (TESTS.md notes).

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — quote paths). Windows 11, bash (MSYS). pnpm 10.34.5, Node 22.
- Dev-host native tools (Phase 4): Ghostscript repo-local `gs10.07.1/`, Tesseract 5.4, LibreOffice 26.8 (`soffice.com`), GTK3 repo-local `GTK3-Runtime Win64/`, WeasyPrint via `py` launcher. Both repo-local dirs gitignored. **ffmpeg is NOT installed on the dev host yet** — Phase 7 needs a static build (BtbN/FFmpeg-Builds) + ffprobe; check `ffmpeg -version` before starting, add to PATH or repo-local like Ghostscript.
- Image model cache: `u2netp.onnx` at `%LOCALAPPDATA%/Temp/localtools-models/u2netp.onnx` — do NOT delete.
- Package tsconfigs split like pdf/image-core: `tsconfig.json` (src+test+scripts noEmit) / `tsconfig.build.json` (src→dist). **Client consumes `dist/` — rebuild any workspace package after changing its src before client typecheck** (D-007).
- Turbo caches `test` aggressively — `pnpm test --force` to prove tests ran.
- devtext fixtures at `fixtures/devtext/` incl. intentionally-malformed files (prettier-ignored via `.prettierignore`).

## Useful context / gotchas discovered this session

- **fflate `deflateSync` is RAW deflate (RFC 1951); PNG IDAT requires zlib (RFC 1950) → use `zlibSync`** (D-019). With deflateSync every PNG decoder silently rejects the stream.
- **turndown requires a live DOM** (Node tests/Workers have none without jsdom) → HTML→Markdown is an in-house block/inline serializer over htmlparser2's DOM (D-018). Comment-only HTML is empty-input (comments are not content).
- **bwip-js**: no TS types shipped (ambient `bwip-js.d.ts` added); `toSVG()` is the one rendering interface shared by the node and browser entries — `toBuffer` is node-only, `toCanvas` browser-only.
- **qrcode**: `create()` returns a BitMatrix with `.get(x,y)` (NOT `modules[y][x]`); `QRCode.create` is sync (no await). papaparse ESM needs `.default` interop (`papa.parse` on the default export).
- **fast-xml-parser v5** deprecates the XMLValidator/XMLBuilder re-exports in favor of nonexistent standalone packages — silenced with targeted eslint-disable on the usage sites, wrapped behind local `validateXml`/`XmlBuilder` helpers in formatters.ts.
- **Intentionally-malformed fixtures red CI via Prettier** (Prettier parses everything `--check` matches): malformed devtext fixtures are in `.prettierignore` with an explanatory comment.
- **vitest 4 `test` files: every `expectDevError(...)` must be awaited** — a floating rejection in a sync callback becomes an unhandled-rejection error that fails the run even when tests pass.
- marked emits `<code class="language-ts">` inside `<pre>` for fenced blocks (assert on content, not exact tag).
- jsdiff chunks are line-granular: diff('a', 'a\nb') = [removed 'a', added 'a\nb'] — count lines, not chunks.
- Prior sessions' gotchas all remain: @jsquash ArrayBuffer outputs, Node init contract, heic-decode `one({buffer})`, onnxruntime-node usage, prettier-formats-Markdown (run `npx prettier --write <file>` after ANY doc edit), LibreOffice filters, WeasyPrint launcher, fastify-plugin encapsulation, `.mjs` raw parsing, Python str.replace fails on CRLF (use the patch tool).
