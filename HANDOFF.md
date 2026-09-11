# HANDOFF — read this first in any new session

_Last updated: 2026-09-12 (early AM), end of session 16. Phase 13 (Testing & CI finalization) COMPLETE: commit `f9a1e32` on branch `phase-13-ci-finalization`, PR #1 (the repo's FIRST PR — also retires the "workflows untested against PRs" known-issue). All Section 14 suite wired into `pnpm verify` + both workflows. `pnpm verify` green locally with the new gates (580 tests; BUNDLE_SIZE / LICENSING / WORKER_OFFLOAD / OFFLINE_RELOAD all PASS). CI on the PR in flight at session end — see "Where things stand" for the exact state._

## Where things stand right now

**Phases 0–13 complete (13 of 15).** Phase 13 shipped this session (D-043):

- **14.5 bundle-size gate**: `apps/client/scripts/bundle-size-check.mjs` as the client `postbuild` (every build gates it) — walks the Vite manifest's entry static-import graph (manifest now emitted, `build.manifest: true`), gzip-9 per chunk. Initial = 121.60KB gzipped (entry JS 117.62 + entry CSS 3.98) vs 250KB budget. Warn-tier within 10% of budget (recorded, not fatal).
- **Self-contained acceptance checks, both in `pnpm verify` (after build) AND as steps in the CI accessibility job**: worker-offload (own `vite preview` :4181, 52MB fixture → 0 long tasks) and the REWRITTEN offline check (browser-level `setOfflineMode(true)` instead of the old kill-the-server two-phase; own preview :4182; SW renders Media suite w/ 18 cards). Both share `scripts/lib/find-chrome.mjs`.
- **14.8 licensing gate**: `tools/licensing-check.mjs` — five required DECISIONS.md notes; in `pnpm verify` + a dedicated CI `licensing` job.
- **14.4 shell-string canary — the acceptance's "verified once manually then reverted" is DONE and evidenced**: flipped `shell:false`→`true` in subprocess.ts; security.test.ts still passed 15/15 (hostile input never reaches argv — layered defense holds); the new `apps/engine/test/shell-canary.test.ts` failed with `SHELL_CANARY_FAIL: subprocess.ts: shell:true`; reverted (git diff clean); canary committed as a PERMANENT import-aware guard (bans `shell:true`, `exec/execSync`, spawn-without-`shell:false` in any child_process-importing engine file; RegExp.exec/comment-"spawn" don't false-positive).
- **Supply chain (5.4/5.5/DoD)**: `pnpm audit --audit-level high` rides the verify CI matrix (after every `pnpm verify`); new CI `supply-chain` job = Trivy `--severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed` on the built engine image + `cargo audit --deny warnings`; `.github/dependabot.yml` (npm/cargo/actions, weekly — INERT until the D-010 public flip or owner-enables dependency graph). Two REAL advisories found & fixed while wiring the audit gate: **js-yaml 4.3.1→4.3.2** (GHSA-2883-xcg3-v3hh high — merge-key CPU DoS; devtext-core's direct dep) and **adm-zip 0.6.0→0.6.1** via root `pnpm.overrides` (GHSA-vwc7-r8mq-g2x9 moderate — transitive of onnxruntime-node). `pnpm audit` now fully clean.
- **release-desktop.yml**: real three-OS tauri-action matrix (windows/macos/ubuntu, engine-dist step, draft release) written; stays `if: false` until Phase 15's D-037 signing decision — the CI desktop-build job already exercises the same pipeline pieces.

## Last thing done

1. `pnpm verify` green END-TO-END with the new chain: format+lint+typecheck → 580 tests (165 pdf + 133 engine [131 + 2 shell-canary] + 65 image + 172 devtext + 17 media-core + 28 client) → build (+bundle-size postbuild: BUNDLE_SIZE_PASS 121.60KB) → LICENSING_CHECK_PASS → WORKER_OFFLOAD_PASS → OFFLINE_RELOAD_PASS.
2. Commit `f9a1e32` on `phase-13-ci-finalization`, pushed, **PR #1 opened** (first PR in repo history). CI in flight at session end — 7 jobs: verify×2, compose-stack, desktop-build, accessibility (+2 new steps), licensing (new), supply-chain (new).
3. Docs: DECISIONS.md D-043 (8 numbered sub-decisions); TESTS.md Phase 13 section (11 rows); SUMMARY.md at 13/15 (test-suite bullet, Phase 13 built-section, known-issues cleaned); this HANDOFF.

## In-progress / uncommitted work

The Phase 13 commit is pushed; working tree clean on the branch. **OPEN LOOP: PR #1's CI runs must be confirmed green and the PR merged to main** — that merge IS the acceptance ("CI green on a clean PR"). If a job fails, fix-forward on the branch and re-push (never force-push main).

## Next immediate steps (in order — do these first)

1. **Watch PR #1 CI to completion** (run 34633815682). `gh pr checks 1`. If all green → `gh pr merge 1 --merge` (or rebase per repo convention — no convention yet; merge is fine) → main's own CI run must also be green (fix-forward if not). If a job fails, read its log, fix on the branch, push; the PR updates itself.
2. **Phase 14 — Performance & size pass** (spec Section 15 / 14.5): Lighthouse-style metrics recorded in README (perf was 82 at Phase 2 — re-measure on the current build; a11y 100 / BP 100 / SEO 91); Docker image size note (Section 11 — the engine image is big: bookworm-slim + LO/ffmpeg/piper; measure via `docker compose build` on CI or note the estimate honestly); bundle numbers already gated by the new 14.5 check.
3. **Phase 15 — Documentation & release**: README (what/why, screenshots per suite, two quick-starts, full tool list, Mermaid architecture), LEGAL.md (Section 6), CONTRIBUTING.md, TESTS.md fully logged, DECISIONS.md finalized (must contain every 14.8 note — the new licensing-check enforces it), public flip (D-010 — activates Dependabot), signing/updater decision (D-037 → un-gate release-desktop.yml), tag v1.0.0.
4. Owner manual items before v1.0.0 (TESTS.md): 14-step desktop click-through (clean machine/VM), screen-reader spot-check ×4 suites, true macOS Safari pass.

## Blockers / open decisions needing human input

- Owner items: manual click-through, screen-reader spot-check, macOS Safari — all logged in TESTS.md.
- Signing/updater decision = Phase 15 (D-037). Public flip = Phase 15 (D-010).
- Unilateral defaults this session (all in DECISIONS.md D-043, override if desired): bundle gate = manifest-walk incl. entry CSS (vs entry-JS-only); offline check rewritten to browser-level offline mode (vs keeping the kill-the-server design); canary committed permanently (vs revert-only per literal spec reading); Trivy `--ignore-unfixed`; audit gate covers dev deps too; adm-zip overridden at root to 0.6.1.

## Environment / local state notes

- Rust toolchain on the dev host: rustup 1.29.1, stable 1.98.1 (x86_64-pc-windows-msvc). `cargo` at `C:\Users\mshah\.cargo\bin` — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- `apps/desktop/src-tauri/engine-dist/` is a BUILD PRODUCT (119MB, gitignored) — rebuild with `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose/Trivy validation only in CI.
- `pnpm verify` now takes ~10–12 min (the two browser checks add ~2-3 min) — ALWAYS background with notify.
- Playwright WebKit 26.6 + Chromium installed in the registry (`%LOCALAPPDATA%/ms-playwright/`).
- Ports 4181/4182 are the self-contained checks' ephemeral preview ports (4173 legacy-still-in-CI-a11y-job for the Phase 12 scripts).

## Useful context / gotchas discovered this session

- **Vite manifest entry key**: the html entry's manifest `file` points at its JS chunk, not an .html — detect via `isEntry:true` + `src` ending .html. Also `build.manifest` must be explicitly enabled; nothing emits it by default.
- **Windows `spawn('npx.cmd', …)` throws EINVAL** without `shell: true` in this bash host's Node (25.x) — the self-contained scripts set `shell: process.platform === 'win32'` for the SERVER spawn only (the canary's `shell:true` scan excludes non-child_process importers, and these are scripts/ not engine src/ — no conflict).
- **node:url's `fileURLToPath` must be imported explicitly in .mjs** — pathname.replace for Windows paths is fragile; always use fileURLToPath.
- **The engine's functional security tests CANNOT catch a shell-string regression** — hostile input never reaches argv (fresh internal names + zod), so they pass under `shell:true`. That's WHY the static canary exists; this is the exact finding the spec's 14.4 acceptance anticipated.
- **Python-in-bash heredocs with backticks break** (bash command substitution inside the quoted script) — write the edit script to a temp .py FILE and run it, never inline.
- **js-yaml GHSA-2883-xcg3-v3hh**: CPU DoS via empty-mapping merge keys; 4.3.2 counts merge sources. If a future dep pins js-yaml 3.x/4.3.0-, audit will now fail the verify matrix.
- **Background-process output capture**: `node script.mjs 2>&1 | tail` in a background terminal can swallow output on exit-code != 0 — for capture-critical runs, foreground the command.
- Prior-session gotchas (Vite stale-workspace-dep builds, UNC paths, taskkill-tree, CI process-group kills, axe+hash-router, prettier formats markdown) — all still true; see HANDOFF history in git if needed.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
