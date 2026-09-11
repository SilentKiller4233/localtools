# HANDOFF — read this first in any new session

_Last updated: 2026-09-11 (evening), end of session 15. Phase 12 (Accessibility & responsiveness) COMPLETE: axe/responsive/keyboard/WebKit all green locally, `pnpm verify` green (see verify log), CI accessibility job added (first run happens on this session's push). Includes a MAJOR pre-existing bug fix: every Text & Dev tool was broken in browsers since Phase 6 (devtext worker module-init failures) — fixed + verified 36/36 in real browser Workers._

## Where things stand right now

**Phases 0–12 complete (12 of 15).** Phase 12 shipped this session (D-042):

- **axe-core gate (Section 14.6)**: `apps/client/scripts/a11y-scan.mjs` — every route (home + 4 suites + /dev/ui-preview + 97 tool pages) × BOTH themes, WCAG 2.x AA + best-practice tags; zero critical/serious/moderate/minor on the final build (initial scan: 292 critical/serious — all fixed at source). Runs as the new CI `accessibility` job → fails the build.
- **Token WCAG test**: `apps/client/test/token-contrast.test.ts` (in `pnpm verify` — 3 new tests) computes real contrast ratios for every composed token pair, both themes. It caught 3 hover/text states axe can't see: dark accent-hover #388bfd→#2a6fe0, NEW `--lt-accent-text` token (light #0f62fe / dark #58a6ff) for accent-as-text (dark fill-blue was 3.73:1 on surface), light faint #9ca3af→#7d8590 (placeholders ≥3:1).
- **DropZone rebuilt (the 268-violation fix)**: native file input IS the interactive control (focusable, Enter/Space, aria-label) — wrapper is a plain div with drag handlers; focus ring via CSS `:has()`. `packages/ui/src/DropZone.tsx` + `styles/drop-zone.css`.
- **390px responsive**: `responsive-check.mjs` — 13 routes × 390/768/1280px, zero overflow/off-viewport controls. SuiteNav wraps <720px, tabs wrap, tighter gutters <480px, headers wrap.
- **Keyboard sweep**: `keyboard-sweep.mjs` — Tab-order walk on all 103 routes + 4 real keyboard-only tool runs (merge-pdf / json-formatter / image-converter complete; video-converter reaches designed engine-gated state). Skip-to-content button in SuiteNav (programmatic main.focus()); ThemeToggle now in the production nav (was only on /dev/ui-preview — Section 8 gap); inert nav search removed.
- **WebKit WASM smoke (Section 13)**: `webkit-wasm-smoke.mjs` (Playwright WebKit) — boots, qpdf-wasm protect-pdf end-to-end, `crossOriginIsolated === false` (D-029 no-COOP/COEP contract), devtext worker healthy. Runs in the CI accessibility job.
- **THE BIG FIX — Text & Dev suite was fully broken in browsers since Phase 6** (Node tests never saw it): (1) ulid@2.4.0 module-eval `detectPrng()` throws in windowless Workers → in-house ULID in `devtext-core/src/tools/generators.ts` (Crockford base32 over crypto bytes; ulid demoted to devDep, tests cross-check via decodeTime); (2) clean-css/terser read `process.platform` at module-eval → minimal browser `process` shim at the devtext worker entry (`apps/client/src/workers/devtext.worker.ts`); (3) prettier browser bundle can't resolve parsers → `prettier/standalone` + explicit postcss/babel/estree/html plugins in `devtext-core/src/tools/minify.ts`. Verified: 36/36 devtext tool variants through the real production Worker in Chromium (sweep deleted after use — the coverage lives in keyboard-sweep + WebKit smoke + the suite tests), 172/172 devtext Node tests still green.
- **Shared Chrome discovery**: `apps/client/scripts/lib/find-chrome.mjs` (system Chrome → Playwright registry) so CI can install Chromium via playwright; `axe-core` + `playwright` are new client devDeps.

## Last thing done

1. All four Phase 12 scripts green on the final build: A11Y_SCAN_PASS (206 route-theme scans, 0 violations), RESPONSIVE_CHECK_PASS, KEYBOARD_SWEEP_PASS, WEBKIT_WASM_SMOKE_PASS.
2. `pnpm verify` green (578 tests: 165 pdf + 131 engine + 65 image + 172 devtext + 17 media-core + 28 client; entry JS 120.75KB gzipped, budget 250KB).
3. Docs: DECISIONS.md D-042; TESTS.md Phase 12 section (incl. the two PENDING owner manual items: screen-reader spot-check per suite, true macOS Safari); SUMMARY.md Phase 12 (12/15); this HANDOFF.

## In-progress / uncommitted work

None — tree is clean at the Phase 12 commit `88172c1` plus the CI fix-forward `bc0103d` (the first push's workflow had a bare `version:` key on pnpm/action-setup in the new accessibility job — GitHub rejected the whole file with zero jobs; fixed with the proper `with:` block). CI run 34609413694 in flight (verify ubuntu/windows, compose-stack, **accessibility (new — first run)**, desktop-build). Confirm it green before starting Phase 13; if the accessibility job fails on runner differences, the scripts take `CHROME_PATH` and all four print a failing line before exit 1.

## Next immediate steps (in order — do these first)

1. **Phase 13 — Testing & CI finalization** (spec Section 15): full Section 14 suite wired into `pnpm verify` + workflows. Known gaps: PWA offline check + worker-offload check are still manual scripts (`apps/client/scripts/offline-test.mjs`, `worker-offload-test.mjs`) — wire them into verify/CI; the shell-string-subprocess canary (14.4) verified once manually then reverted.
2. The 14-step manual click-through checklist (TESTS.md) + Phase 12's two manual items (screen-reader spot-check ×4 suites, macOS Safari hardware) remain owner items before v1.0.0.
3. Phase 14 (performance/size: Section 14.5 metrics into README incl. Docker image size) then Phase 15 (docs/release).
4. ffmpeg.wasm small-clip rider still deferred (D-021/D-032) — decide before Phase 15 whether it ships in v1 or moves to the roadmap.

## Blockers / open decisions needing human input

- Owner items: manual click-through (clean machine/VM, TESTS.md), screen-reader spot-check (4 suites), true macOS Safari pass — all logged in TESTS.md Phase 12 rows.
- Signing/updater decision deferred to Phase 15 (D-037).
- Unilateral defaults this session (all in DECISIONS.md D-042, override if desired): the specific replacement token values (#57606e, #2a6fe0, #58a6ff, #7d8590), the in-house ULID (vs pinning/patching ulid), the browser `process` shim in the devtext worker (vs lazy-import refactors), prettier/standalone + explicit plugins, skip-link as a button (vs hash anchor), ThemeToggle in the suite nav.

## Environment / local state notes

- Rust toolchain on the dev host: rustup 1.29.1, stable 1.98.1 (x86_64-pc-windows-msvc). `cargo` at `C:\Users\mshah\.cargo\bin` — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- Test-isolation temp roots (safe to delete): `%TEMP%/localtools-engine-downloader-test/`, `%TEMP%/localtools-engine-security-test/`.
- `apps/desktop/src-tauri/engine-dist/` is a BUILD PRODUCT (119MB, gitignored) — rebuild with `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose validation only in CI.
- `pnpm verify` takes 5–8 min — ALWAYS background with notify.
- Playwright WebKit 26.6 + Chromium are installed in the registry (`%LOCALAPPDATA%/ms-playwright/`) for the Phase 12 scripts.
- A `vite preview --port 4173` may still be running from this session (kill by port if Phase 13 needs it).

## Useful context / gotchas discovered this session

- **Node-only test suites cannot catch module-eval environment assumptions.** The devtext suite passed 172 Node tests while being 100% broken in browsers: ulid/clean-css/terser all throw at module-evaluation in windowless/`process`-less Worker contexts. Any package reachable from a Worker must be exercised IN one — the keyboard sweep + WebKit smoke now guard this class.
- **ulid@2.4.0**: `export const ulid = factory()` → `detectPrng()` at module-eval; only recognizes `window.crypto`; `require('crypto')` fallback obviously fails in browsers. If a future dep pulls ulid back in, import `factory` explicitly and pass a `globalThis.crypto` PRNG — or use the in-house implementation now in generators.ts.
- **prettier browser bundle**: `prettier` main entry resolves parsers from a Node plugin registry; in a browser Worker you MUST use `prettier/standalone` + explicit `plugins: [postcss, babel, estree, html]`. Same output in Node.
- **axe with hash-router SPAs**: run `axe.run(document, ...)` per route after `networkidle0`; set the theme explicitly (`data-theme` attribute) — the theme bootstrap reads localStorage at boot, and `evaluateOnNewDocument`-set storage can race the app's own bootstrap; re-asserting the attribute post-load is the reliable path.
- **puppeteer `evaluate` round-trips destroy typed arrays** (JSON serialization) — build Worker payloads INSIDE one `page.evaluate` call so structured clone carries the real `Uint8Array`.
- **Vite stale-workspace-dep builds**: after changing a workspace package (devtext-core), the client build bundles from its `dist/` — always `pnpm --filter <pkg> build` before the client build, or you chase ghosts (msCrypto fingerprints in old chunks are NOT proof of staleness — ulid is also inside html-minifier-terser/terser source; verify by content of your actual change, e.g. the `Uint32Array(1)` signature).
- **Contrast math gotcha**: compute ratios against the token the element actually sits on (`--lt-canvas` ≠ `--lt-surface`); hover states and text-role accent fills are invisible to axe — only the token-pair test catches them.
- **Blocked-command false positives**: long single-line greps with special chars can trip the agent's terminal parser — use `search_files`/`execute_code` for content inspection of built chunks.
- **Prettier formats markdown docs too** — run `pnpm format` after writing TESTS/DECISIONS/SUMMARY content or format:check fails verify.
- Session-13/14 gotchas (Tauri init-script, UNC paths, NSIS-not-Inno, 7zr→7z, msiexec /a, generate_context!, pnpm deploy --legacy, per-child healthz, taskkill-tree, manifest statics, MSYS paths, CI process-group kills, engine temp-root isolation, Vite dep-optimize cache) — all still true; see `2a4f1f3^` / `a91da56^` history if needed.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
