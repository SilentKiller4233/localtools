# HANDOFF — read this first in any new session

_Last updated: 2026-09-05 ~03:55 PKT (UTC+05:00), FINAL — end of session 10. Phase 7 COMPLETE (Media conversion suite, 14/14 Group B tools, 43/43 media tests, 484/484 total). **CI GREEN end-to-end: `a8b196c` (run 33986740382) and the close-out `f3c7fd4` (run 33986914478) both success.** Working tree clean, all pushed. Session fully finalized — nothing outstanding._

## Where things stand right now

**Phases 0–7 complete.** Phase 7 (Media suite Group B, ffmpeg) is DONE end-to-end: all 14 Section 3.2 conversion/compression/trim/merge/extract/GIF/normalize/subtitle/resolution tools are engine endpoints under `/media/*` (`apps/engine/src/routes/media-group-b.ts` + `media-tools.ts`), running through the Phase 4 request harness unchanged (full Section 5 control set — no new security surface). Every conversion route enforces the **Section 14.5 ffprobe sanity check in-engine** (output container/codec/dimensions/bitrate must match the request — "exit 0" alone never satisfies a route). 43 new engine tests against the REAL ffmpeg, all passing; `pnpm verify` fully green locally (484 tests: 165 pdf + 82 engine + 65 image + 172 devtext). Client wired: `MediaPageSpec.tsx` real pages for all 14 tool cards; `EngineRunnerPage.buildOptions` now receives the selected-file count (multi-file merge/burn). Commit chain this session: `41a3835` (phase) → `c88d80d` (CI fix 1) → `a8b196c` (CI fix 2) → `f3c7fd4` (docs close-out, CI green run 33986914478).

## Last thing done

**Two CI fix-forwards after the Phase 7 commit (never amended; `41a3835` → `c88d80d` → `a8b196c`):**

1. `c88d80d` — on `41a3835`, both verify runners failed 4 tests (burn-subtitles happy path, resolution-change ×3) with expected-200-got-422 — the exact routes that ffprobe the INPUT before running ffmpeg. Root cause: CI runners have no ffmpeg; `probeMedia` swallowed the ffprobe spawn-ENOENT as "unparseable" (`result.code !== 0` is true when code is `null`), and `probeDimensions` turned `undefined` into a misleading `tool-failed` (422) instead of the documented honest 503 `tool-unavailable` degradation. Fix: `probeMedia` now throws `tool-unavailable`/`tool-timeout` itself on `spawnFailed`/`timedOut`. Verified locally BOTH ways: fake-ffmpeg env (nonexistent exe paths) → those suites degrade to 503 (4/4, 4/4), real-ffmpeg run stays 43/43. On `c88d80d`: media tests green, compose-stack green.
2. `a8b196c` — `c88d80d`'s ubuntu run surfaced a LATENT PHASE-6 FLAKE (not caused by Phase 7): devtext `generators.test.ts` asserted all 26 letters appear in a "500-char" password run, but `generatePassword` clamps length at 128 — the run was 128 chars, where P(all 26 letters) ≈ 0.84 → a 1-in-6 flake that finally fired. Verified by exact inclusion-exclusion math (P(miss) = 0.16 at n=128) and a 5M-draw distribution check (generator itself is uniform). Fix (test-side only): assert the clamp (length 128) + ≥24 distinct letters (P(fail) ≈ 4e-5). devtext 172/172 locally.

## In-progress / uncommitted work

None — working tree is clean, everything pushed through `f3c7fd4`, CI green (run 33986914478). The only thing after this edit is committing the finalized HANDOFF itself (docs-only, no code).

## Next immediate steps (in order — do these first)

1. **Phase 8 — Media downloader (Group C, highest-risk phase, do not rush)**: yt-dlp integration with the FULL Section 5.8 SSRF-prevention set implemented from the start (scheme validation, private/loopback/link-local IP blocking incl. 169.254.169.254, per-redirect-hop checking, yt-dlp sandboxing flags, hard wall-clock timeout, output-size monitoring, metadata-sanitized filenames, downloader-specific rate limit, unsupported-site rejection with NO raw-fetch fallback). Acceptance: every Section 14.4 Group C test + the mocked-target integration test (14.2) + manual review that no URL reaches an outbound request without passing the checks. yt-dlp is NOT installed on the dev host yet — standalone per-OS executable, repo-local + gitignored (like ffmpeg/gs). The dev host rate-limited GitHub API calls this session — batch them.
2. **Phase 9 — Speech-to-text**: whisper.cpp WASM + lazy model download + auto-captions; **+ Piper TTS + PDF→audiobook (assigned Phase 9 per D-012)**. ffmpeg.wasm small-clip path (D-021) can ride here or later — routing design recorded in D-021.
3. Standing rules unchanged: commit per phase, `pnpm verify` before "done", prettier ANY doc before commit, SUMMARY/TESTS/DECISIONS updated at phase end, HANDOFF rewrite literal-last.

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
- **Statistical assertions must account for input clamping**: the password-generator test asked for length 500 but the generator clamps at 128 — "all 26 letters in 128 draws" is only ~0.84 likely, a 1-in-6 flake that fired on ubuntu CI after passing 4+ earlier runs. Rule: for any randomized assertion, compute the actual failure probability from the ACTUAL input the code will process (post-clamp), and keep it < 1e-4 (see `a8b196c`).
- **`*/` inside a block comment terminates it early** — a doc comment containing `ffmpeg-*/bin` produced TS1005 "unterminated regex" parse errors pointing at the WRONG lines (the comment body). If tsc reports parse errors in a region that looks fine, grep for `*/` inside comments.
- **BtbN's `latest` release tag changed naming** — the old `ffmpeg-n7.1-latest-win64-gpl.zip` pattern 404s now; current is `ffmpeg-n9.0-latest-win64-gpl-9.0.zip` (version-suffixed twice). Query the GitHub API for the asset list before scripting downloads; verify SHA-256 against the release's `checksums.sha256`.
- **Synthetic fixtures compress extremely well**: testsrc at CRF 20 vs 28 spans only ~28–43 kbps on a 3s 320x240 clip — absolute bitrate thresholds for 14.5 checks are dishonest on it; assert preset ORDERING instead (documented in D-022).
- **MSYS `/tmp` doesn't work for native Windows tools** — `curl -o /tmp/x` files are invisible to git-bash `ls`; use `$LOCALAPPDATA/Temp` for scratch files. Also `vitest run -t` accepts a single pattern only (repeat the flag doesn't work).
- **`python - <<EOF` heredocs break inside this host's terminal wrapper** — use `python -c` or script files instead.
- vitest 4 + eslint projectService: new scripts/ dirs must be added to the package tsconfig `include` or eslint fails with "not found by the project service".
- Prior sessions' gotchas all remain: prettier-formats-Markdown (run `npx prettier --write <file>` after ANY doc edit; format:check runs FIRST in verify), @jsquash ArrayBuffer outputs, Node init contract, LibreOffice filters, WeasyPrint launcher, fastify-plugin encapsulation, `.mjs` raw parsing, fflate zlibSync-not-deflateSync (D-019).
