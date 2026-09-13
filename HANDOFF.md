# HANDOFF — read this first in any new session

_Last updated: 2026-09-13, mid session 19. **Phase 15 complete @ `36f47a0`; H4 (monitored real-URL downloader run) PASSED @ `f68c130`** — the last agent-runnable pre-release item. Local `pnpm verify` fully green (600 tests + all gates). **All 15 phases BUILT. Remaining v1.0.0 items are owner-gated**: (1) CI billing — STILL BLOCKED (5th failed probe: run 34760464159 on the Phase 15 push, same annotation); (2) PR #1 merge; (3) release-desktop.yml smoke; (4) D-037 signing; (5) public flip D-010; (6) manual items; then the v1.0.0 tag._ — README rebuilt with committed per-suite screenshots + verified 97-tool list + Mermaid diagram; LEGAL.md written (Section 6 three-location rule now fully satisfied); SECURITY.md accuracy debt cleared; D-046. Local `pnpm verify` fully green (600 tests + all gates). **All 15 phases are now BUILT. The only remaining v1.0.0 items are owner-gated**: (1) CI billing — STILL BLOCKED, 4th failed probe this session (rerun of run 34749561006 died in 5s with the same billing annotation); (2) PR #1 merge + green CI proof; (3) release-desktop.yml smoke; (4) D-037 signing; (5) public flip D-010; (6) owner manual items; then the v1.0.0 tag._

## Where things stand right now

**Phases 0–15 all complete (code + docs). External review fully responded (D-044). The project is code-complete for v1.0.0.** Everything left is gated on the owner's GitHub Actions billing decision and manual items — none of it needs new code.

Phase 15 deliverables just landed (`36f47a0`, all verified):

- **README rebuilt**: what/why, 9 committed screenshots in `docs/screenshots/` (home + 4 suite grids + 4 representative tool pages, 1280×800, captured from the production build by the new repeatable `apps/client/scripts/capture-screenshots.mjs`), dev + Docker quick-starts, the full 97-tool list by suite and group (programmatically verified against tool-registry.ts + i18n/en.json — all 97 names present, 73 A / 23 B / 1 C), a Mermaid three-layer architecture diagram with Group A/B/C data flows, a legal-use section linking LEGAL.md, license section. Status line: "15 of 15 phases built; v1.0.0 tag pending CI unblock."
- **LEGAL.md written** (repo root): all five spec Section 6 points; substance mirrors the Phase 8 in-app dismissible notice — the three-location rule (README + LEGAL.md + in-app notice) is now fully satisfied.
- **SECURITY.md accuracy fix**: the stale "Phase 0 stub engine" paragraph (D-002 mid-build state) replaced with the shipped-controls description — DoD requires docs accurate to shipped code.
- **CONTRIBUTING.md**: re-checked, complete since Phase 0, no change needed.
- **14.8 licensing gate re-verified**: `tools/licensing-check.mjs` LICENSING_CHECK_PASS — DECISIONS.md finalized per Phase 15.
- **TESTS.md** gained the Phase 15 section (incl. owner-gated tag row); **SUMMARY.md** at 15/15 with the owner-gated tail; **D-046** in DECISIONS.md.

## Last thing done

1. **H4 PASSED (live-verified)**: production-posture engine (dist build, no seams) + real YouTube "Me at the zoo" — metadata round trip (live title/uploader/duration/formats) + audio download verified genuine (ID3 magic, ffprobe: mp3, 19.006s, ~51kbps, sanitized filename). Bonus: `unsupported-site` live-verified (archive.org raw URL rejected — no-open-proxy holds), `blocked-host` live-verified (loopback target rejected). Logged in TESTS.md Phase 15; artifacts deleted; engine shut down. Commit `f68c130`.
2. Wrote `apps/client/scripts/capture-screenshots.mjs` (CDP-driven Chrome headless over raw WebSocket; ws@8.21.3 resolved from the pnpm store via file:// URL — no new dependency) and captured 9 screenshots of the production build into `docs/screenshots/`.
3. Rebuilt README (screenshots, verified tool list, Mermaid diagram, legal section), wrote LEGAL.md, fixed SECURITY.md, updated TESTS/SUMMARY/DECISIONS.
4. `pnpm format:check` clean; **`pnpm verify` fully green** (600 tests + bundle 121.60KB/250KB + licensing + worker-offload 0 long tasks + offline).
5. Commit `36f47a0` pushed to `phase-13-ci-finalization`.

## In-progress / uncommitted work

None — tree is clean at `36f47a0`, all pushed.

## Next immediate steps (in order — do these first)

1. **OWNER ACTION: GitHub Actions billing** — fix at Settings → Billing & plans, OR flip the repo public (public repos get free unlimited Actions minutes; also activates Dependabot; the D-010 public flip was already planned for v1.0.0), OR wait for the monthly minute reset (Oct 1). The zero-cost unblock is the public flip.
2. Once CI can start: re-run PR #1's checks (`gh run rerun <latest-run> --failed` or push any commit), watch all 7 jobs green, `gh pr merge 1 --merge`, confirm main's own run green. That completes the Phase 13 acceptance.
3. Exercise `release-desktop.yml` once via `workflow_dispatch` or a throwaway tag before the real v1.0.0 (review C3 recommendation).
4. **D-037 signing decision** → un-gate release-desktop.yml's `if: false`.
5. Public flip (D-010) if not already done in step 1 → Dependabot activates.
6. Owner manual items (TESTS.md): desktop click-through on a clean machine, screen-reader spot-check ×4, true macOS Safari. (H4 real-URL downloader run: DONE 2026-09-13, agent-run — TESTS.md Phase 15.)
7. **Tag `v1.0.0`** — triggers release-desktop (three-OS installers, draft release). Then final HANDOFF/SUMMARY truth-up per the DoD ("current as of the v1.0.0 tag").

## Blockers / open decisions needing human input

- **GitHub Actions billing (BLOCKING everything CI)** — owner to pick: fix billing / flip public / wait for reset. 5 failed probes across sessions (runs 34710264986, 34710597715, 34723093833, 34749561006, 34760464159).
- D-037 signing decision (Phase 15 tail): sign installers (needs certs) or ship unsigned with the documented per-OS bypass steps.
- Owner manual items list (above).
- Unilateral defaults this session (recorded in D-046): screenshots committed (not gitignored) because README references them; capture script uses ws from the pnpm store via file:// URL (no new dep); README status phrased "15 of 15 built, tag pending" rather than claiming the release; LEGAL.md mirrors in-app notice substance.

## Environment / local state notes

- Rust toolchain: rustup 1.29.1, stable 1.98.1 — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- `apps/desktop/src-tauri/engine-dist/` is a build product (gitignored) — rebuild via `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose/Trivy only in CI.
- `pnpm verify` ~10–12 min — ALWAYS background with notify.
- Playwright WebKit 26.6 + Chromium in `%LOCALAPPDATA%/ms-playwright/`; browser-check ports 4181/4182 (a11y job 4173); screenshot script uses preview :4189 + CDP :9223.
- Client has `happy-dom` devDep (engine-surfaces tests only, per-file `@vitest-environment` annotation).

## Useful context / gotchas discovered this session

- **Windows ESM loader rejects absolute import paths**: `await import('D:/…')` throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` — convert with `pathToFileURL(p).href` first. Needed for importing `ws` from the pnpm store.
- **ws 8.x ESM interop**: the store copy exports the constructor as `default`, not a named `WebSocket` — use `mod.default ?? mod.WebSocket`.
- **CDP `/json/new` needs PUT** on recent Chrome (GET returns 405).
- **Capture-script pattern**: spawn Chrome `--headless=new --remote-debugging-port`, poll `http://127.0.0.1:<port>/json/version` (AbortSignal-bounded), open a WebSocket to the page target's `webSocketDebuggerUrl`, `Emulation.setDeviceMetricsOverride` (NOT `Page.setDeviceMetricsOverride` — doesn't exist), navigate → wait ~900ms → `document.fonts.ready` → two rAFs → `Page.captureScreenshot`. Full discipline in `capture-screenshots.mjs`.
- **Prettier reflows long markdown lines** — verify presence-checks against README AFTER `pnpm format` (two tool names initially "went missing" only because of line rewrap, caught by the programmatic check).
- **Blank-vs-real screenshot heuristic**: a rendered 1280×800 suite grid PNG is 85–133KB; a blank page is ~5KB. Tool pages 24–28KB.
- **Model in this Hermes session is text-only** — vision_analyze on local PNGs fails; verify screenshots programmatically (dimensions + file size).
- Prior-session gotchas (billing signatures v1/v2, wedge discipline, react-test-renderer deprecated, esbuild `→` in .tsx test names, prettier reflow vs patch, `Reflect.deleteProperty`, no-dynamic-delete on process.env, ULID/worker env quirks) — still true; see git HANDOFF history.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context3 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
