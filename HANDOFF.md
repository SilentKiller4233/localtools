# HANDOFF — read this first in any new session

_Last updated: 2026-09-13, end of session 17. The external Claude pre-release review was fully triaged and responded to; all code/doc fixes landed on `phase-13-ci-finalization` @ `1fec940` (pushed), local `pnpm verify` fully green (600 tests). **PR #1 remains blocked on the owner's GitHub Actions billing** — runs 34710264986, 34710597715, and 34723093833 ALL died with the same annotation ("recent account payments have failed or your spending limit needs to be increased"). The owner says the account should be completely free — the resolution is EITHER fix billing at Settings → Billing & plans OR flip the repo public (public repos get free unlimited Actions minutes; the D-010 public flip was already planned for Phase 15) OR wait for the monthly minute-reset. Owner decision pending on which route._

## Where things stand right now

**Phases 0–13 complete. External review response complete (D-044).** Claude's adversarial review of the four docs produced C1–C3 / H1–H5 / M1–M7 / N1–N4. Everything code-fixable is fixed, tested, committed, and pushed:

- **C1 (SSRF DNS-rebinding pinning): VERIFIED CLEAN by reading code** — resolve-once, validate EVERY A/AAAA record, connect to the pinned IP literal on both proxy paths. No change needed.
- **C1 companion bug (found during verification): FIXED** — the CONNECT path's `':'`-split mangled IPv6 authority-form targets. New `parseConnectTarget()` in ssrf-guard.ts (WHATWG URL parse, bracket-strip, default 443, malformed → invalid-option); 4 unit tests.
- **C2 (mock seam backdoor): HARDENED** — `LOCALTOOLS_DOWNLOADER_MOCK_TARGET` seam is now triple-gated: engages ONLY when `NODE_ENV=test` + `LOCALTOOLS_DOWNLOADER_TEST_MODE=true` + MOCK_TARGET all set. Docker pins NODE_ENV=production; desktop sidecar `env_clear()`s NODE_ENV away; production `node dist/server.js` has it unset/production. Tests prove: hostile .env with both vars under production/unset NODE_ENV → seam dead → `blocked-host`. Static artifact tests: compose forwards neither var, Dockerfile pins production, sidecar.rs never passes them.
- **C3 (CI green): still blocked on billing** (see header) — no code involved.
- **H1** AGPL network-clause note added to DECISIONS.md D-001. **H2** redact tool now shows the user-facing warning at the point of use (images covered, not pixel-removed). **H3** four "manual (code review)" Phase-11 rows converted to real tests (`apps/client/test/engine-surfaces.test.tsx`, 9 tests, happy-dom + createRoot/act; react-test-renderer is deprecated — don't reintroduce). **H4** stays an owner manual item (one monitored real-URL downloader run pre-v1). **H5** Docker yt-dlp pinned to 2026.08.19 (matches desktop) + `ytdlp-flags.test.ts` asserts every sandbox flag exists in the installed binary's --help.
- **M2** ffmpeg.wasm **CUT by owner decision** (D-044 supersedes D-021/D-032). **M5** SUMMARY counts resynced. **M1/M4/M6/M7/N1/N2/N3** all landed as doc fixes (Trivy footnote, desktop no-auto-update note, spec PDF→Excel amendment, Dependabot gap note, manifest.rs QPDF reserved-comment, licensing-gate comment, Piper pin-time scope note). **N4** = Phase 14's re-baseline bar.

## Last thing done

1. Full external-review triage → fixes → tests → docs (D-044 in DECISIONS.md, TESTS.md review-response section, PROJECT_REVIEW.md tech-debt register updated, SUMMARY.md synced).
2. `pnpm verify` green end-to-end: **600 tests** (engine 131→144: +10 review-hardening, +1 ytdlp-flags; client 28→37: +9 engine-surfaces) + build + bundle gate + licensing + worker-offload + offline.
3. Commit `1fec940` pushed to `phase-13-ci-finalization`; the triggered CI run 34723093833 queued ~5min then died with the SAME billing annotation — confirming it's account-level, not code.

## In-progress / uncommitted work

None — tree is clean at `1fec940`, all pushed. (PROJECT_REVIEW.md is now committed as part of the review-response commit.)

## Next immediate steps (in order — do these first)

1. **OWNER ACTION (still): GitHub Actions billing** — one of: fix payment/spending limit at Settings → Billing & plans; OR flip the repo public early (public = free unlimited Actions minutes; also activates Dependabot early); OR wait for the monthly minute reset. The owner stated the account should be "completely free" — if billing still refuses after checking, the public flip is the zero-cost unblock.
2. Once CI can start: re-run PR #1's checks (`gh run rerun 34723093833 --failed` or push any commit), watch all 7 jobs, merge when green, confirm main's own run green. That completes the Phase 13 acceptance ("CI green on a clean PR").
3. Also exercise `release-desktop.yml` once via `workflow_dispatch` or a throwaway tag before the real v1.0.0 tag (review C3 recommendation).
4. **Phase 14 — Performance & size pass**: re-measure Lighthouse (regression from Phase 2's perf 82 is the bar — review N4), record bundle/Docker-image numbers in README.
5. Phase 15 — docs, public flip (D-010), signing decision (D-037) → un-gate release-desktop.yml, tag v1.0.0.
6. Owner manual items before v1.0.0: desktop click-through, screen-reader spot-check ×4, true macOS Safari, the H4 monitored real-URL downloader run.

## Blockers / open decisions needing human input

- **GitHub Actions billing (BLOCKING the Phase 13 acceptance merge)** — owner to pick: fix billing / flip public / wait for reset.
- Owner manual items (TESTS.md): desktop click-through, screen-reader ×4, macOS Safari, H4 real-URL downloader run.
- Signing/updater = Phase 15 (D-037). Public flip = Phase 15 (D-010) — could be pulled earlier to unblock CI free minutes.
- Unilateral defaults this session (all recorded in D-044): C2 gate via NODE_ENV=test; IPv6 fix via WHATWG URL parse (not a hand-rolled parser); H3 tests via happy-dom+createRoot (not react-test-renderer — deprecated); ytdlp Docker pin matches desktop 2026.08.19; ffmpeg.wasm cut (owner's explicit call).

## Environment / local state notes

- Rust toolchain: rustup 1.29.1, stable 1.98.1 — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- `apps/desktop/src-tauri/engine-dist/` is a build product (gitignored) — rebuild via `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose/Trivy only in CI.
- `pnpm verify` ~10–12 min — ALWAYS background with notify.
- Playwright WebKit 26.6 + Chromium in `%LOCALAPPDATA%/ms-playwright/`; browser-check ports 4181/4182 (a11y job 4173).
- Client now has `happy-dom` devDep (for engine-surfaces tests only — per-file `@vitest-environment` annotation; the rest of the client suite stays node-env).

## Useful context / gotchas discovered this session

- **GitHub Actions billing-death signature v2**: jobs can QUEUE for ~5 minutes before the billing annotation kills them (run 34723093833) — the older signature (2-3s instant fail, logs 404) isn't the only shape. If a run's jobs all fail at exactly ~5m with zero log content, check ANNOTATIONS for the billing message before debugging the workflow.
- **react-test-renderer is deprecated** (React types + eslint `no-deprecated` fire on `create`/`act` imports): use happy-dom + `createRoot` + `act` from 'react' for component tests in this repo. react-test-renderer was installed then removed this session — don't reintroduce.
- **renderToStaticMarkup does NOT run useEffect** — server rendering skips effects; hook-state tests must mount with createRoot and assert via the rendered DOM (closure-captured hook values go stale by construction).
- **Stubbing the desktop bridge in node tests**: `desktop-bridge.ts` reads `window.__LOCALTOOLS__` (typed via `declare global`); in happy-dom, assign it with a structural cast — the internal `DesktopBridge` interface is NOT exported.
- **Fake-Worker harness pattern**: the worker client registers BOTH 'message' and 'error' listeners — a stub storing one handler silently drops one. Store handlers per event type in a Map.
- **esbuild (vite transform in vitest) can choke on `→` inside test names** in .tsx files under some conditions — prefer ASCII-safe test names (`->` not `→`) in this repo's client tests.
- **Prettier reflows long lines between write and patch** — after `prettier --write`, re-read the exact region before patching (two of my patches missed because signatures were reflowed).
- **no-dynamic-delete fires on `delete process.env[key]`** in test cleanup — use `Reflect.deleteProperty(process.env, key)`.
- Prior-session gotchas (billing signature v1, wedge discipline, UNC paths, taskkill-tree, axe+hash-router, prettier-formats-markdown, Vite stale-workspace-deps) — still true; see git HANDOFF history.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
