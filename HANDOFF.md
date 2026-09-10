# HANDOFF — read this first in any new session

_Last updated: 2026-09-10 (late), end of session 14. Phase 11 (Integration polish) COMPLETE and shipped: commit `4bf61ed`, **CI FULLY GREEN (run 34517122128 — all 4 jobs: verify ubuntu/windows, compose-stack, desktop-build)**. Unified error copy + engine health gating + consistent/real progress + batch polish + first client test suite; plus D-041 engine temp-root test isolation (fixed a pre-existing flaky downloader test). `pnpm verify` fully green locally — 574 vitest tests (165 pdf + 131 engine + 65 image + 172 devtext + 17 media-core + 25 client) + 5 Rust shell tests; entry JS 120.69KB gzipped (budget 250KB)._

## Where things stand right now

**Phases 0–11 complete (11 of 15).** Phase 11 shipped this session (D-039/D-040/D-041):

- **Unified error copy (D-039)**: `apps/client/src/lib/tool-errors.ts` — one map per taxonomy (pdf/image/devtext/speech/engine/bridge) + `friendlyError(err, scope)` that always falls back to a friendly sentence, never a technical message. All five runner frames render through it; the per-page ERROR_TEXT maps are deleted. Acceptance ("no raw/unstyled error anywhere", spec line 495) is test-enforced: `apps/client/test/tool-errors.test.ts` extracts every code from each package's error-union SOURCE and asserts copy exists.
- **Engine health gating (D-039)**: `lib/engine-health.ts` (bridge `desktop_status` in the shell → GET /healthz in browsers; base URL via `lib/engine-url.ts`, now shared with engine-client) + `hooks/useEngineTooling.ts` (mount probe, re-probe on `engine://ready`, gate-before-run, tool-unavailable→ToolDownloadPrompt routing, green installed-confirmation note). Wired into ALL FOUR engine surfaces: EngineRunnerPage, DownloaderPage (gate on Preview), text-to-speech, pdf-to-audiobook (TTS/audiobook previously had NO download-prompt flow — the Rust `tool_for_endpoint` already mapped them → piper). Engine-down renders a styled warning banner + "Check again" (`.lt-engine-banner--down`, `.lt-installed-note` CSS in apps/client/src/styles.css).
- **Consistent + real progress (D-040)**: `hooks/useFakeProgress.ts` — one app-wide liveness cadence (start 5, +4/400ms, ceiling 90; pure `nextLivenessPercent` unit-tested) replacing four drifted per-page tickers. REAL progress via an ADDITIVE worker message `{id, progress:{done,total}}` (pdf + image worker clients — non-opted-in handlers unchanged): `pdfToImage` per rendered page, image `runBatch` per file; delivered through `runToolWithProgress`/`runImageToolWithProgress`.
- **Batch polish**: image batch outputs keep ORIGINAL filenames (`photo-localtools.webp`, not `image-1.webp`) — the worker carries input names through.
- **First client test suite**: vitest wired into `apps/client` (package.json test script, vitest.config.ts, tsconfig now includes test/): 25 tests / 4 files — taxonomy copy-completeness, raw-error guarantee, engine-health probe paths (mocked fetch/bridge), liveness-ticker semantics, registry dispatch coverage (97 tools).
- **D-041 temp-root isolation**: engine `temp-dirs.ts` gained `tempRoot()` honoring `LOCALTOOLS_TEMP_ROOT`; downloader.test.ts + security.test.ts boot engines under private roots (`localtools-engine-<suite>-test`). Fixes a PRE-EXISTING flake: those files' root-scanning assertions saw sibling vitest workers' in-flight request dirs in the shared root (a parallel suite's 8MB input PDF tripped the downloader 50KB leftover assertion). No production behavior change.

## Last thing done

1. Phase 11 implemented end-to-end (files: `apps/client/src/lib/{tool-errors,engine-health,engine-url}.ts`, `apps/client/src/hooks/{useFakeProgress,useEngineTooling}.{ts,tsx}`, worker-client + worker + page changes in `apps/client/src/{lib,workers,pages}`, `packages/pdf-core/src/tools/pdf-to-image.ts` + `packages/image-core/src/tools/compress.ts` onProgress seams, styles.css banner/note classes, engine temp-dirs + two test files).
2. All gates green locally: apps/client lint/typecheck/vitest (25/25), engine vitest 131/131 (after D-041), `pnpm verify` — 9 turbo tasks successful, entry JS 120.69KB gz.
3. Docs updated: DECISIONS.md D-039/D-040/D-041; TESTS.md Phase 11 section (incl. the note that the acceptance is now test-enforced); SUMMARY.md Phase 11 (status 11/15, test counts 574, decisions line, stale "apps/desktop has no code" line fixed).

## In-progress / uncommitted work

None — tree is clean at the Phase 11 commit (`4bf61ed` + the HANDOFF CI-green follow-up docs commit), everything pushed, CI green on `4bf61ed` (run 34517122128). No open loops.

## Next immediate steps (in order — do these first)

1. **Phase 12 — Accessibility & responsiveness** (spec Section 15): acceptance = Section 14.6 passes (automated + logged manual items) across all four suites. WCAG 2.1 AA audit pass, 390px viewport responsive check, keyboard/ARIA sweep, Safari/WebKit WASM quirks (COOP/COEP — noted in SUMMARY tech debt; schedule it here or Phase 14).
2. Standing pattern for engine tools: GroupBRequestHarness + runSubprocess + tool-paths resolver; new lazy-download = one manifest.rs row + one EnvBinding (unchanged from Phase 10).
3. ffmpeg.wasm small-clip rider stays deferred (D-021/D-032) — revisit before Phase 13.
4. Phase 13 will wire PWA/offline + worker-offload checks into `pnpm verify` (still manual scripts today).

## Blockers / open decisions needing human input

- Owner items (unchanged): the 14-step manual click-through checklist (TESTS.md) on a clean machine/VM — required before v1.0.0 per Section 14.7; screenshots for README bypass steps at Phase 15.
- Signing/updater decision deferred to Phase 15 (D-037).
- No new unilateral defaults this session beyond: the engine-down banner copy/pattern (D-039), the liveness cadence constants (D-040), LOCALTOOLS_TEMP_ROOT as the isolation seam (D-041) — all recorded in DECISIONS.md, override if desired.

## Environment / local state notes

- Rust toolchain on the dev host: rustup 1.29.1, stable 1.98.1 (x86_64-pc-windows-msvc). `cargo` at `C:\Users\mshah\.cargo\bin` — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- Test-isolation temp roots (safe to delete): `%TEMP%/localtools-engine-downloader-test/`, `%TEMP%/localtools-engine-security-test/`.
- `apps/desktop/src-tauri/engine-dist/` is a BUILD PRODUCT (119MB, gitignored) — rebuild with `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose validation only in CI.
- `pnpm verify` takes 5–8 min (now includes the client suite) — ALWAYS background with notify.

## Useful context / gotchas discovered this session

- **apps/client tests resolve @localtools/pdf-core + image-core from their built dist** — after adding an option to a core package, REBUILD the package (`pnpm --filter <pkg> build`) before apps/client typecheck, or tsc reports the new option as unknown.
- **apps/client tsconfig**: `rootDir: src` broke when test/ was included — the whole tsconfig is now `noEmit: true` with include [src, test, vitest.config.ts] (matching pdf-core's pattern); vite owns the actual build.
- **No testing-library/jsdom in the workspace** — hook tests must avoid renderers: extract pure functions (see `nextLivenessPercent`) or test via mocked globals (see engine-health.test.ts's vi.stubGlobal fetch + `__LOCALTOOLS__`).
- **The client test that enforces copy-completeness parses SOURCE FILES of other packages** (regex over the error-code union). Two regexes are needed: `export type XErrorCode =` unions AND media-core's inline `readonly code:` class-field union. Keep them in sync if a package moves its taxonomy.
- **Engine temp-root flake root cause** (D-041): vitest runs each test FILE in its own worker process, but all engine files shared `%TEMP%/localtools-engine` — root-scanning assertions (downloader leftover scan, security dir-count/traversal scan) race with sibling suites' in-flight request dirs. Private `LOCALTOOLS_TEMP_ROOT` per file fixes it; if you write NEW root-scanning engine tests, isolate the root the same way.
- **Prettier formats more than you touched** — `pnpm format` reflowed several files; always run it before `pnpm verify` (format:check is the first gate).
- **Tauri window init-script, canonicalize/UNC paths, NSIS-not-Inno, 7zr→7z chain, msiexec /a, generate_context! frontendDist, pnpm deploy --legacy, per-child healthz port, taskkill-tree/process-group, manifest statics E0716, MSYS path conversion, CI runner-grandchild kills (process_group + setsid ci_smoke + libc::kill)** — all still true, see session-13 HANDOFF in git history (`2a4f1f3^`) if needed; unchanged by Phase 11.
- **`engine-client.ts` exports `engineBaseUrl` re-exported from `lib/engine-url.ts`** — one source of truth now; engine-health and the client calls can never drift apart.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
