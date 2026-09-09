# HANDOFF — read this first in any new session

_Last updated: 2026-09-09, end of session 12. Phase 9 (Media speech & audio) COMPLETE and shipped. `pnpm verify` fully green locally (549 tests: 165 pdf + 130 engine + 65 image + 172 devtext + 17 media-core speech). **CI GREEN end-to-end on `08444d4` (run 34335101202: verify-ubuntu ✓, verify-windows ✓, compose-stack incl. the new Piper speech round-trip ✓).** Working tree clean, all pushed (chain: `ac54c0a` Phase 9 feature → `3364fbf` + `08444d4` two CI fix-forwards for the engine Docker image)._

## Where things stand right now

**Phases 0–9 complete (9 of 15).** Phase 9 (Sections 3.2, 15) shipped end-to-end across two sessions (session 11 did the research/scoping and nearly all implementation; session 12 = this recovery session — lint/verify finishing, ship, and two Docker CI fixes):

- **Group A (client-side)**: transcribe-media + auto-captions run whisper.cpp WASM in the browser via `@fugood/node-whisper-wasm` 1.1.3 (D-029). Models (tiny/base/small.en) lazy-download on first use from whisper.cpp's HF ggml repo, SHA-256-verified, cached in the browser Cache API; Node tests use the Temp-dir cache with the FS-preseed loading contract. 16kHz mono resample + SRT/VTT caption builders live in `packages/media-core/src/speech.ts`. Whisper WASM (4.1MB) + models are LAZY chunks — entry stays 118.96KB gzipped (250KB budget).
- **Group B (engine-side)**: text-to-speech + pdf-to-audiobook via Piper 2023.11.14-2 subprocess (D-030/D-031). Voices (en_US-lessac-medium default, en_US-amy, en_GB-alba) lazy-download from rhasspy/piper-voices with per-file SHA-256 pins (`apps/engine/src/speech/voices.ts`). Audiobook: pdf-core loadPdf/extractText → outline chapters → ≤800-char chunks → per-chunk Piper WAVs → ffmpeg concat. `runSubprocess` grew an optional `stdinData` (Piper reads text on stdin — never argv). Routes at `/media/text-to-speech` + `/media/pdf-to-audiobook` behind the existing GroupBRequestHarness.
- **Speech fixture** (D-028): `fixtures/media/sample-speech.wav` = Piper-generated "The quick brown fox jumps over the lazy dog. LocalTools speech test." — keyword-set assertions, P(fail) < 1e-4. Regenerate script: `apps/engine/scripts/regenerate-speech-fixture.ts`.
- **Docker**: engine image installs piper from the SHA-pinned GitHub release tarball at /opt/piper; CI compose-stack gained a `SPEECH_STACK_PASS` round trip (TTS through the containerized engine, voice lazy-downloads in-container).

## Last thing done

Session 12 (the "get context" recovery session resumed here after provider 429s killed it mid-verify):

1. Fixed 10 lint errors the dead session never reached (media-core `unbound-method`/`toThrowError`/non-null-assertion; engine route `as never` casts, voices template-literal number + useless-catch, piper-tools pdfjs import → the repo's `.then((m) => m as PdfjsLike)` pattern).
2. downloader-canary: allowlisted `speech/voices.ts` (pinned-HF fetches only, D-030/D-031) + added a NEW static assertion proving voices.ts builds fetch URLs only from the pinned `HF_BASE` const (fetch() count == 1, both fetchVerified calls rooted at HF_BASE).
3. Full `pnpm verify` green; committed `ac54c0a` "feat(media): Phase 9"; pushed.
4. CI fix-forward #1 (`3364fbf`): engine Dockerfile was missing `COPY packages/pdf-core` (the audiobook route imports it) — containerized tsc failed TS2307. Fixed; local filter build verified before push.
5. CI fix-forward #2 (`08444d4`): node:22-bookworm-slim has no curl — the piper tarball fetch exited 127; also reordered the RUN chain so the curl fetch precedes the purge. Linux tarball SHA re-verified live against the GitHub release before pushing.
6. CI run 34335101202 on `08444d4`: all three jobs success. This HANDOFF + SUMMARY/TESTS/DECISIONS updates are the only remaining actions; SUMMARY/TESTS were already Phase-9-accurate from session 11.

## In-progress / uncommitted work

None — tree is clean at `08444d4`, everything pushed. (Verify with `git status`.)

## Next immediate steps (in order — do these first)

1. **Phase 10 — check PROJECT_SPEC Section 15 for the next named phase** (likely Image suite hardening or the Tauri desktop app scaffold; the spec's phase list is authoritative — read it before planning).
2. Standing pattern for any new engine tool: GroupBRequestHarness + runSubprocess(arg arrays, `stdinData` when needed) + tool-paths resolver (env → repo-local → /opt|Docker → PATH → honest 503).
3. ffmpeg.wasm small-clip rider stays deferred (D-021/D-032) — revisit trigger: before Phase 13's CI finalization.

## Blockers / open decisions needing human input

- None new. Standing owner-side items: Safari/WebKit manual checks scheduled for Phase 12 (TESTS.md); Play Console $25 / Tauri signing considerations land at their phases.
- Model routing `z-ai/glm-5.3-free` 429s interrupted the previous session twice — batch tool calls, run long commands as background jobs with notify, and pause/resume from the todo list.

## Environment / local state notes

- Repo-local native toolchain (all gitignored, do not delete): `ffmpeg-n9.0-latest-win64-gpl-9.0/`, `yt-dlp-2026.08.19/`, `gs10.07.1/`, `GTK3-Runtime/`, **`piper-2023.11.14-2/` (new — Windows amd64, zip SHA f3c58906... verified)**.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — `u2netp.onnx`, `whisper/ggml-tiny.en.bin` (77.7MB), `piper-voices/en_US-lessac-medium.onnx(+.json)`. amy/alba voices NOT cached locally (lazy-download on first use, only lessac is exercised by tests).
- Dev scratch dirs from the Phase 9 scouting (safe to delete if space needed): `%LOCALAPPDATA%/Temp/p9-scout/`, `p9-voices/`, `p9-tts-smoke.mjs` etc.
- Dev host has NO Docker (D-015) — compose validation happens only in CI's compose-stack job.
- `pnpm verify` takes ~5–7 min full (format + lint + typecheck + 549 tests + build); run as a background job with notify, never inline.
- Voices/whisper lazy-download URLs are pinned + SHA-256-verified in code; the downloader-canary statically proves voices.ts can only fetch from the pinned HF_BASE.

## Useful context / gotchas discovered this session

- **Engine Dockerfile COPY set is now load-bearing**: `packages/pdf-core` must be COPYed (audiobook route imports it). If any future engine code imports another workspace package, add its COPY line or the containerized `tsc --project tsconfig.build.json` fails TS2307 while local builds stay green (local pnpm workspaces resolve; Docker's isolated context doesn't).
- **node:22-bookworm-slim ships no curl** — anything downloading in the runtime image needs `curl` + `ca-certificates` in the apt install list. Purge build-only tools AFTER their last use in the RUN chain (the first fix had the purge before the fetch — ordering matters in one RUN).
- **Piper GitHub releases carry no upstream checksums** — our pinned SHA in the Dockerfile IS the verification (D-030 doctrine). Verified live: linux_x86_64 tarball `a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992` (26.5MB, root dir `piper/` → `--strip-components=1` puts the binary at `/opt/piper/piper`).
- **`@typescript-eslint/unbound-method` fires on destructured node-builtin methods** (`const { join } = await import('node:path')`) — keep the module namespace (`const nodePath = await import('node:path'); nodePath.join(...)`) instead of destructuring or wrapping.
- **`toThrowError` is deprecated** in this vitest/eslint setup — use `toThrow`.
- **The repo's pdfjs typing pattern** (from pdf-core tools/text.ts): `import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as PdfjsLike)` — a plain `as` cast on the awaited import trips `no-unsafe-call`; the `.then()` form passes both lint and typecheck.
- **downloader-canary allowlist discipline**: every entry must carry its justification in the test comment AND a companion static assertion pinning the safety property (the voices.ts entry now proves fetch() count and HF_BASE-rooted URLs). Do not allowlist without the companion assertion.
- **Engine test suite takes ~4 min** (130 tests, real subprocesses) — full verify ~5–7 min; the previous session's 420s execute_code timeout killed its final verify run, which is why the lint errors survived to this session. Always run verify as `terminal(background=true, notify=true)`.
- **Session-recovery lesson**: when a session dies on provider 429s mid-task, the working tree + session DB (`state.db` messages table) fully reconstruct the state — check `git status` first, then page the dead session's tail via session_search before redoing anything.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
