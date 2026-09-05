# HANDOFF — read this first in any new session

_Last updated: 2026-09-05 ~03:20 PKT (UTC+05:00), end of session 10 — Phase 7 COMPLETE (Media conversion suite, 14/14 Group B tools, 43/43 media tests, 484/484 total); CI on `41a3835` was RED (4 tests expected-200-got-422 on both runners) → fix-forwarded as `c88d80d` — **confirm run on `c88d80d` first thing**_

## Where things stand right now

**Phases 0–7 complete.** Phase 7 (Media suite Group B, ffmpeg) is DONE end-to-end: all 14 Section 3.2 conversion/compression/trim/merge/extract/GIF/normalize/subtitle/resolution tools are engine endpoints under `/media/*` (`apps/engine/src/routes/media-group-b.ts` + `media-tools.ts`), running through the Phase 4 request harness unchanged (full Section 5 control set — no new security surface). Every conversion route enforces the **Section 14.5 ffprobe sanity check in-engine** (output container/codec/dimensions/bitrate must match the request — "exit 0" alone never satisfies a route). 43 new engine tests against the REAL ffmpeg, all passing; `pnpm verify` fully green locally (484 tests: 165 pdf + 82 engine + 65 image + 172 devtext). Client wired: `MediaPageSpec.tsx` real pages for all 14 tool cards; `EngineRunnerPage.buildOptions` now receives the selected-file count (multi-file merge/burn). Committed as `41a3835` (pushed), then **CI-red fix-forward `c88d80d`** (pushed; details below).

## Last thing done

**CI fix-forward `c88d80d`**: on `41a3835`, both verify runners failed 4 tests (burn-subtitles happy path, resolution-change ×3) with expected-200-got-422 — the exact routes that ffprobe the INPUT before running ffmpeg. Root cause: CI runners have no ffmpeg, `probeMedia` swallowed the ffprobe spawn-ENOENT as "unparseable" (`result.code !== 0` is true when code is `null`), and `probeDimensions` turned `undefined` into a misleading `tool-failed` (422) instead of the documented honest 503 `tool-unavailable` degradation. Fix: `probeMedia` now throws `tool-unavailable`/`tool-timeout` itself on `spawnFailed`/`timedOut`. Verified locally BOTH ways: fake-ffmpeg env (`LOCALTOOLS_FFMPEG_PATH`/`LOCALTOOLS_FFPROBE_PATH` pointing at nonexistent exes) → those suites degrade to 503 (4/4, 4/4), and real-ffmpeg run stays 43/43. Never amended; `41a3835` stays in history.

## In-progress / uncommitted work

This HANDOFF.md update (docs-only). **Confirm CI on `c88d80d` is green, commit this file as the close-out docs commit (`docs: close out session 10 — Phase 7 …`), push — that is the literal last repo action of the session.** If CI is red again: fix-forward again, never amend.

## Next immediate steps (in order — do these first)

1. **Confirm CI green on `c88d80d`** (run was in-flight at session end). Then commit+push this HANDOFF.
2. **Phase 8 — Media downloader (Group C, highest-risk phase, do not rush)**: yt-dlp integration with the FULL Section 5.8 SSRF-prevention set implemented from the start (scheme validation, private/loopback/link-local IP blocking incl. 169.254.169.254, per-redirect-hop checking, yt-dlp sandboxing flags, hard wall-clock timeout, output-size monitoring, metadata-sanitized filenames, downloader-specific rate limit, unsupported-site rejection with NO raw-fetch fallback). Acceptance: every Section 14.4 Group C test + the mocked-target integration test (14.2) + manual review that no URL reaches an outbound request without passing the checks. yt-dlp is NOT installed on the dev host yet — standalone per-OS executable, repo-local + gitignored (like ffmpeg/gs).
3. **Phase 9 — Speech-to-text**: whisper.cpp WASM + lazy model download + auto-captions; **+ Piper TTS + PDF→audiobook (assigned Phase 9 per D-012)**. ffmpeg.wasm small-clip path (D-021) can ride here or later — routing design recorded in D-021.
4. Standing rules unchanged: commit per phase, `pnpm verify` before "done", prettier ANY doc before commit, SUMMARY/TESTS/DECISIONS updated at phase end, HANDOFF rewrite literal-last.

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- **Discord webhook**: a fresh URL exists only in session-10's chat — NEVER write it into any repo file (repo goes public at Phase 15). Send end-of-session summaries via Python urllib with a custom User-Agent (default UA → HTTP 403; json.dumps body; expect 204).
- Classic PAT rotation still pending (needed before Phase 15's public flip).
- Context7 MCP still NOT connected — verify APIs from installed `.d.ts`/source (D-014…D-023 all done this way).
- Safari/WebKit WASM/Worker quirks — scheduled for Phase 12 (TESTS.md notes).
- ffmpeg.wasm browser path deliberately deferred (D-021) — not dropped; revisit before Phase 13 CI finalization.

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — quote paths). Windows 11, bash (MSYS). pnpm 10.34.5, Node 22.
- **ffmpeg/ffprobe: repo-local `ffmpeg-n9.0-latest-win64-gpl-9.0/`** (BtbN GPL static, SHA-256-verified at download), gitignored via `ffmpeg-*/`, auto-detected by the engine — do NOT delete, do NOT commit. Other native tools: Ghostscript repo-local `gs10.07.1/`, Tesseract 5.4, LibreOffice 26.8, GTK3 repo-local, WeasyPrint via `py` launcher. All repo-local dirs gitignored.
- Image model cache: `u2netp.onnx` at `%LOCALAPPDATA%/Temp/localtools-models/u2netp.onnx` — do NOT delete.
- Media fixtures committed at `fixtures/media/` (sample-short.mp4/.mp3, sample.gif, malformed.mp4, sample.srt, sample.vtt); regenerate with `pnpm --filter @localtools/engine exec tsx scripts/generate-media-fixtures.ts` (FORCE=1 to overwrite).
- Client consumes `dist/` — rebuild any workspace package after changing its src before client typecheck (D-007). Turbo caches `test` aggressively — `pnpm test --force` to prove tests ran.
- Engine test config note: media tests start extra tight-cap engines (512B) for the oversized paths — expected. To simulate a no-ffmpeg host locally: set `LOCALTOOLS_FFMPEG_PATH`/`LOCALTOOLS_FFPROBE_PATH` to nonexistent paths and confirm the 503 degradation.

## Useful context / gotchas discovered this session

- **CI runners have no ffmpeg — every media happy-path test MUST degrade to the honest 503 `tool-unavailable`, never 422.** The first push failed exactly there: `probeMedia` treated spawn-ENOENT as "unparseable input". Any future engine code that probes input BEFORE running the main tool must surface `spawnFailed` as `tool-unavailable` (see `c88d80d`).
- **`*/` inside a block comment terminates it early** — a doc comment containing `ffmpeg-*/bin` produced TS1005 "unterminated regex" parse errors pointing at the WRONG lines (the comment body). If tsc reports parse errors in a region that looks fine, grep for `*/` inside comments.
- **BtbN's `latest` release tag changed naming** — the old `ffmpeg-n7.1-latest-win64-gpl.zip` pattern 404s now; current is `ffmpeg-n9.0-latest-win64-gpl-9.0.zip` (version-suffixed twice). Query the GitHub API for the asset list before scripting downloads; verify SHA-256 against the release's `checksums.sha256`.
- **Synthetic fixtures compress extremely well**: testsrc at CRF 20 vs 28 spans only ~28–43 kbps on a 3s 320x240 clip — absolute bitrate thresholds for 14.5 checks are dishonest on it; assert preset ORDERING instead (documented in D-022).
- **MSYS `/tmp` doesn't work for native Windows tools** — `curl -o /tmp/x` files are invisible to git-bash `ls`; use `$LOCALAPPDATA/Temp` for scratch files. Also `vitest run -t` accepts a single pattern only (repeat the flag doesn't work).
- **`python - <<EOF` heredocs break inside this host's terminal wrapper** — use `python -c` or script files instead.
- vitest 4 + eslint projectService: new scripts/ dirs must be added to the package tsconfig `include` or eslint fails with "not found by the project service".
- Prior sessions' gotchas all remain: prettier-formats-Markdown (run `npx prettier --write <file>` after ANY doc edit; format:check runs FIRST in verify), @jsquash ArrayBuffer outputs, Node init contract, LibreOffice filters, WeasyPrint launcher, fastify-plugin encapsulation, `.mjs` raw parsing, fflate zlibSync-not-deflateSync (D-019).
