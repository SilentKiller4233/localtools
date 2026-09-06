# HANDOFF — read this first in any new session

_Last updated: 2026-09-06 ~20:40 PKT (UTC+05:00), FINAL — end of session 11. Phase 8 COMPLETE (Media downloader Group C, highest-risk phase). `pnpm verify` fully green locally (514 tests: 165 pdf + 112 engine + 65 image + 172 devtext). **CI GREEN end-to-end on the Phase 8 commit `55f8077` (run 34058139609: verify-ubuntu ✓, verify-windows ✓, compose-stack incl. the new downloader SSRF round-trip ✓).** Working tree clean, all pushed. Only remaining action after this edit: commit the finalized HANDOFF itself (docs-only)._

## Where things stand right now

**Phases 0–8 complete.** Phase 8 (Media downloader, Group C — THE highest-risk phase per Section 15) is done end-to-end: universal downloader at `#/tool/universal-downloader` (URL-input page, NOT drop-zone) with metadata preview (title/uploader/duration/formats) BEFORE download, format/quality picker, audio-only extraction, subtitles where available, playlist checkbox queue, and the one-time dismissible legal notice (Section 6, in-app — localStorage). The **entire Section 5.8 SSRF-prevention set shipped in the first Phase 8 commit**, never bolted on:

- **Scheme validation** — `assertPublicHttpUrl()`: http/https only; credentials rejected; no-host rejected (`downloader/ssrf-guard.ts`).
- **Private/internal blocking** — `resolveAndValidateHost()` + `classifyIp()`: 127/8 + ::1, 10/8, 172.16/12, 192.168/16, 169.254/16 (incl. 169.254.169.254), 0/8, CGNAT 100.64/10, multicast, reserved, v4-mapped-IPv6, ULA fc00::/7, NAT64, documentation ranges. Runs on the initial URL BEFORE any subprocess exists.
- **Per-redirect-hop checking** — the core design (D-027): the engine starts a loopback-only **validating forward proxy** per request and runs yt-dlp with `--proxy <it>`; every connection (page fetch, every redirect hop, every media fragment, CONNECT tunnels) re-validates scheme + DNS-resolved IPs. The proxy connects to the validated IP directly (no TOCTOU/DNS-rebind window). Tests prove redirect→192.168.13.37, →169.254.169.254, and →`localhost`-name all die at the hop (mock hit log shows exactly the redirect page, nothing else).
- **yt-dlp sandboxing** — flags verified against the INSTALLED binary's `--help` (2026.08.19), not memory: `--no-config-locations --no-plugin-dirs --no-remote-components --no-exec --no-cache-dir --socket-timeout 30 --no-progress --no-mtime --restrict-filenames --windows-filenames` + `--use-extractors all,-generic` (generic DISABLED in production = the no-open-proxy rule; unknown sites → `unsupported-site` with ZERO outbound requests, proven via mock hit log). Argument arrays only (Section 5.3, `shell:false` hardcoded).
- **Timeout + size cap** — hard wall-clock (default 600s, `LOCALTOOLS_DOWNLOAD_TIMEOUT_SECONDS`), SIGTERM→SIGKILL + taskkill /T; output-size watchdog polls the download dir (500ms) and aborts MID-download (`download-too-large`, nothing kept); `--max-filesize` as the second layer.
- **Pre-download duration gate** — `assertDurationWithinCap()` vs `LOCALTOOLS_MAX_DOWNLOAD_DURATION_SECONDS` (3h default, Section 8) from the `-J` probe.
- **Filename sanitization** — `sanitizeRemoteName()` (null bytes, control chars, separators, dot-runs) on TOP of yt-dlp's own restrict/windows flags; output names engine-generated (`lt-%(id)s-%(random)s`).
- **Downloader rate limit** — own window (`LOCALTOOLS_DOWNLOADER_RATE_LIMIT=6`/300s default), answers `rate-limited` (429, distinct code/copy from `engine-busy`).
- **Manual review done** — every outbound-capable call site in the engine traced (6 real sites; TESTS.md row records the path-by-path argument). Automated canary test (`downloader-canary.test.ts`) statically enforces it.

Tests: 30 new (28 functional/security + 2 canary) against the **local mock target** (`downloader-mock.ts`, D-026) — zero live third-party sites. Both modes verified locally: real yt-dlp (repo-local `yt-dlp-2026.08.19/yt-dlp.exe`, SHA-256-verified release asset) AND no-yt-dlp (env override → every happy path degrades to the honest 503 `tool-unavailable`, the c88d80d contract). CI has no yt-dlp → ubuntu/windows runners exercise the degradation path; compose-stack exercises the real one inside the Docker image (pip yt-dlp added, ~+40MB — D-025).

Client wiring complete: `DownloaderPage.tsx` + `runEngineJson()` in engine-client.ts (JSON-body engine calls, Group C error copy) + ToolPage dispatch for media group 'c'. shared-types: `downloader-engine.ts` (schemas: metadata/download requests, formats, items, legal notice; `DOWNLOADER_ERROR_CODES`).

Docs current: DECISIONS D-024 (livestreams unsupported — conservative), D-025 (yt-dlp deployment, **required-by-CI**), D-026 (mock-target design, **required-by-CI**), D-027 (validating-proxy SSRF shape, **required-by-CI**); TESTS.md Phase 8 rows incl. the manual-review row; SUMMARY.md at Phase 8 state (8/15).

## Last thing done

Phase 8 commit chain this session (single commit, no fix-forwards needed): **`55f8077` "feat(media): Phase 8 — downloader Group C (yt-dlp, full SSRF set)"** — pushed, **CI run 34058139609 all three jobs success** (verify ubuntu+windows, compose-stack with the new "Downloader SSRF round trip" step asserting blocked-host through the containerized engine). Local `pnpm verify` VERIFY_EXIT=0 (514 tests green) BEFORE the push; docs prettier-formatted before commit.

## In-progress / uncommitted work

None — working tree clean, everything pushed through `55f8077`. The only thing after this edit is committing the finalized HANDOFF itself (docs-only, no code).

## Next immediate steps (in order — do these first)

1. **Phase 9 — Media speech-to-text + audio generation** (Section 15): whisper.cpp WASM (client-side STT) + auto-captions (its named tool card), **+ Piper TTS + PDF→audiobook (assigned Phase 9 per D-012)**. Model/voice lazy-download + cache flow per Section 13's edge case (retry prompt, rest of app usable). ffmpeg.wasm small-clip browser path (D-021) can ride here or later.
2. **Phase 10 — Tauri desktop shell** after 9: sidecar lifecycle, lazy-download flow for every native tool now in play (LibreOffice, Ghostscript, Tesseract, yt-dlp, ffmpeg, whisper models, Piper voices).
3. Standing rules unchanged: commit per phase, `pnpm verify` before "done", prettier ANY doc before commit, SUMMARY/TESTS/DECISIONS at phase end, HANDOFF rewrite literal-last, fix-forward never amend.

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- **Discord webhook**: fresh URL exists only in this session's chat — NEVER write it into any repo file (repo goes public at Phase 15). Python urllib with custom User-Agent `localtools-bot/1.0` (default UA → 403), json.dumps body, expect HTTP 204. Exact ID ends **3015366** (the 1715366 variant 404s).
- Classic PAT rotation still pending (needed before Phase 15's public flip).
- Context7 MCP still NOT connected — verify APIs from installed `.d.ts`/binary `--help` (D-014…D-027 all done this way).
- Compose-level full mock downloader round-trip (mock inside the compose network) deferred to Phase 13's e2e pass — D-026 documents it.
- Safari/WebKit WASM quirks — Phase 12 (TESTS.md notes).
- One adversarial re-review pass of `ssrf-guard.ts` (bounty-style) noted in SUMMARY known-issues — good candidate for Phase 13 hardening.

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — quote paths). Windows 11, bash (MSYS). pnpm 10.34.5, Node 22.
- **yt-dlp: repo-local `yt-dlp-2026.08.19/yt-dlp.exe`** (official standalone, SHA-256-verified vs the release's SHA2-256SUMS), gitignored via `yt-dlp-*/` — do NOT delete, do NOT commit. Resolution: `LOCALTOOLS_YTDLP_PATH` → repo-local → /usr/bin|/usr/local/bin (Docker pip) → PATH.
- Other native tools unchanged: ffmpeg repo-local `ffmpeg-n9.0-latest-win64-gpl-9.0/`, Ghostscript `gs10.07.1/`, GTK3, Tesseract 5.4, LibreOffice 26.8, WeasyPrint via `py` launcher. All repo-local dirs gitignored. u2netp.onnx model cache at `%LOCALAPPDATA%/Temp/localtools-models/` — do NOT delete.
- Client consumes `dist/` — rebuild workspace packages (esp. shared-types) after changing their src before client typecheck (D-007). Turbo caches `test` — `pnpm test --force` to prove runs.
- Engine test config: `LOCALTOOLS_DOWNLOADER_TEST_MODE=true` + `LOCALTOOLS_DOWNLOADER_MOCK_TARGET=127.0.0.1:<port>` are set INSIDE downloader.test.ts (beforeAll) — no manual setup. To simulate a no-yt-dlp host: `LOCALTOOLS_YTDLP_PATH=<bogus> npx vitest run test/downloader.test.ts` (verified: 30/30).
- The `.tmp-experiment/` scratch dir + `downloader-test-*.log` were gitignored during the session and DELETED before commit (nothing to rediscover there — the useful findings live in D-024…D-027).

## Useful context / gotchas discovered this session

- **yt-dlp experiments (all verified against the installed 2026.08.19 binary, recorded in D-025/D-026/D-027):** `--no-ies` does NOT exist (the form is `--use-extractors all,-generic`); `--no-plugin-dirs` + `--no-remote-components` + `--no-exec` + `--no-config-locations` are the real scripting/plugin/config kill switches; `--use-extractors generic,html5` is what the mock needs (plain `generic` alone errors "Unsupported URL" on `<video>` pages); `--max-filesize` aborts oversized downloads but **exits 0** — the engine must treat "exit 0 + zero files produced" as a failure, not success; the html5 extractor numbers multi-video page titles (`Cool Video (1)`) — assert with a regex; `og:image` becomes `thumbnail`, JSON-LD `PT30S` durations do NOT parse through the generic fallback (hence the duration gate is a unit seam + real-site concern, noted in D-026).
- **Node event-loop deadlock trap:** `execFileSync` of yt-dlp while the mock origin lives in the SAME Node process = the origin can't serve the proxy's upstream calls → everything read-timeouts. The engine's real runner spawns async (ytdlp.ts) — never "simplify" it to execFileSync.
- **Fastify routes read env at registration time, not request time** — a second `startEngine()` in tests does NOT re-read `LOCALTOOLS_DOWNLOADER_TEST_MODE`; tests that need a production-posture engine must clear/set the env vars around that engine's creation (see the canary-style pattern in downloader.test.ts's unsupported-site case) — or better, call the layer directly like the final version does.
- **WhatWG URL keeps IPv6 brackets in `.hostname`** (`[::1]`) — strip them before classifyIp or IPv6 loopback literals slip through as "invalid" instead of "loopback" (fixed in ssrf-guard.ts; test covers it).
- **Windows heredoc/python-`-<<EOF` quirks persist** (prior sessions) — script files or `python -c` only; `execute_code` cells hard-die at 300s with output LOST — long jobs must run in `terminal(background=true)` with file-redirected logs, then read the file.
- **proxy-per-request close discipline:** `server.closeAllConnections()` then `close(cb)` — without closeAllConnections the keep-alive sockets keep the event loop alive and vitest hangs.
- Prior sessions' gotchas all still apply: prettier-formats-Markdown, format:check runs FIRST in verify, CI runners lack native tools (503 degradation contract), statistical assertions vs post-clamp inputs, `*/` inside block comments, MSYS /tmp invisible to native tools, vitest `run -t` single-pattern-only, eslint projectService tsconfig includes for new dirs.
