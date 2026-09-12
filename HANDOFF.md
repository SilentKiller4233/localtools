# HANDOFF — read this first in any new session

_Last updated: 2026-09-12 (evening), end of session 16. Phase 13 (Testing & CI finalization) is CODE-COMPLETE and locally verified on branch `phase-13-ci-finalization` @ `9e2af40` (+ this docs commit), PR #1 open. **BLOCKED ON OWNER: GitHub Actions billing died mid-acceptance** — run 34710264986: all 7 jobs "not started because recent account payments have failed or your spending limit needs to be increased". Fix Billing & plans, then re-run CI on the PR head; the merge IS the acceptance. Full local verify is green including both browser checks with the final anti-wedge discipline._

## Where things stand right now

**Phases 0–13 complete (13 of 15).** Phase 13 shipped this session (D-043), branch `phase-13-ci-finalization`, PR #1 (the repo's FIRST PR — retires the "workflows untested against PRs" known-issue):

- **14.5 bundle-size gate**: `apps/client/scripts/bundle-size-check.mjs` as the client `postbuild` — walks the Vite manifest's entry static-import graph (manifest now emitted, `build.manifest: true`), gzip-9 per chunk. Initial = 121.60KB gzipped vs 250KB budget (BUNDLE_SIZE_PASS locally + in CI run 34641228513's verify jobs).
- **Self-contained worker-offload + offline checks** in `pnpm verify` AND the CI accessibility job. These needed THREE hardening rounds on ubuntu runners (see gotchas) — final form: watchdog armed BEFORE any async work, `withTimeout()` races on browser launch/close, 127.0.0.1-only binding + `AbortSignal.timeout`-bounded readiness probes, explicit `process.exit` on both paths, CI step-level `timeout-minutes: 6`.
- **14.8 licensing gate**: `tools/licensing-check.mjs` in `pnpm verify` + dedicated CI `licensing` job (passed in every CI run that started).
- **14.4 shell-string canary — acceptance DONE and evidenced**: `shell:false`→`true` flipped live; security tests still passed 15/15 (layered defense) but `apps/engine/test/shell-canary.test.ts` failed with `SHELL_CANARY_FAIL: subprocess.ts: shell:true`; reverted; canary committed as a permanent import-aware guard (2/2 green).
- **Supply chain**: `pnpm audit --audit-level high` on the verify CI matrix (js-yaml 4.3.2 + adm-zip 0.6.1 override fixed — audit clean); CI `supply-chain` job = Trivy HIGH/CRITICAL on the engine image (`--ignore-unfixed`) + `cargo audit` (vulns fail, unmaintained warnings don't — see D-043) — **passed in runs 34637640479/34641228513/34644521693**. Trivy's first scan found 1 CRITICAL + 10 HIGH — all in the base image's bundled npm CLI tree → npm stripped from the runtime image (~80MB smaller, scan clean). `.github/dependabot.yml` (inert until the D-010 public flip).
- **release-desktop.yml**: real three-OS tauri-action matrix written, `if: false` until the Phase 15 D-037 signing decision.

## Last thing done

1. CI-proven greens before billing died (run 34644521693): compose-stack, licensing, supply-chain (Trivy+cargo audit), verify(windows), desktop-build — 5/7.
2. Root-caused the two ubuntu wedges (worker-offload step 26min; verify(ubuntu) 6h — the SAME wedge inside `pnpm verify`'s tail) and landed the final anti-wedge discipline (`9e2af40`); both scripts verified green locally after the rewrite.
3. **Discovered the acceptance blocker**: run 34710264986 — all jobs not started, GitHub Actions billing/spending limit. The 6-hour hung job + ~8 fix-forward restarts plausibly drained it.
4. Docs: D-043 (with the CI-hardening addendum), TESTS.md Phase 13 section, SUMMARY.md at 13/15, this HANDOFF.

## In-progress / uncommitted work

This docs commit. Everything else is pushed on the branch. **OPEN LOOP: PR #1 needs one green CI run on `9e2af40`-or-later, then merge** — blocked on the owner's GitHub Actions billing, not on code.

## Next immediate steps (in order — do these first)

1. **OWNER ACTION: fix GitHub Actions billing** (Settings → Billing & plans: failed payment or spending limit). Then `gh pr checks 1` / re-run the failed run — nothing about the branch needs to change. If a wedge somehow recurs despite the anti-wedge discipline, the step now fails loudly within 6 minutes with diagnostics — read the step log.
2. When the PR's 7 checks are green → `gh pr merge 1 --merge` → confirm main's own CI run green (fix-forward if not). That completes the Phase 13 acceptance ("CI green on a clean PR").
3. **Consider CI-minutes hygiene before Phase 14** (recommendation, not yet implemented — the browser checks currently run TWICE per push: inside `pnpm verify` on the verify matrix AND as accessibility-job steps; a `LOCALTOOLS_SKIP_BROWSER_CHECKS=1` env on the verify matrix would halve that burn. Decide + record in DECISIONS if adopted.)
4. **Phase 14 — Performance & size pass** (spec 14.5 into README): re-measure Lighthouse on the current build (Phase 2 baseline: perf 82 / a11y 100 / BP 100 / SEO 91); Docker image size note (Section 11; the npm strip shrank it — measure via CI or state the estimate honestly); bundle numbers already gated.
5. Phase 15 — docs & v1.0.0 release (README/LEGAL/CONTRIBUTING, TESTS fully logged, DECISIONS finalized, D-010 public flip — activates Dependabot — D-037 signing decision → un-gate release-desktop.yml, tag v1.0.0).
6. Owner manual items before v1.0.0 (TESTS.md): desktop click-through (clean machine/VM), screen-reader spot-check ×4, true macOS Safari.

## Blockers / open decisions needing human input

- **GitHub Actions billing (BLOCKING the Phase 13 acceptance merge)** — owner must fix payment/spending limit; then re-run PR #1's CI.
- Owner manual items (TESTS.md): click-through, screen-reader spot-check, macOS Safari.
- Signing/updater = Phase 15 (D-037). Public flip = Phase 15 (D-010).
- Unilateral defaults this session (all in D-043): bundle gate counts entry JS+CSS (vs JS-only); offline check browser-level (vs kill-the-server); canary committed permanently (vs revert-only); Trivy `--ignore-unfixed`; audit gate covers dev deps; adm-zip root override 0.6.1; npm stripped from the engine runtime image; cargo audit without `--deny warnings`; browser checks double-run in verify+a11y (see step 3 — decide whether to keep).

## Environment / local state notes

- Rust toolchain on the dev host: rustup 1.29.1, stable 1.98.1 (x86_64-pc-windows-msvc). `cargo` at `C:\Users\mshah\.cargo\bin` — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- `apps/desktop/src-tauri/engine-dist/` is a BUILD PRODUCT (119MB, gitignored) — rebuild with `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose/Trivy only in CI.
- `pnpm verify` takes ~10–12 min now — ALWAYS background with notify.
- Playwright WebKit 26.6 + Chromium installed in `%LOCALAPPDATA%/ms-playwright/`; system Chrome present for find-chrome.
- Browser-check ports: 4181 (worker-offload), 4182 (offline); a11y job's Phase 12 scripts still use 4173.

## Useful context / gotchas discovered this session

- **Ubuntu-runner browser-check wedges are real and cost ~2 CI-hours + plausibly the billing limit.** Two silent hangs: worker-offload (26 min, run 34641228513) and verify(ubuntu) tail (6 HOURS, run 34644521693 — the default job timeout, not my 30/40-min caps, is what finally killed it). Root causes NOT deterministic code bugs: puppeteer launch/close and unbounded awaits can stall forever on hosted runners. Discipline that finally worked: watchdog armed BEFORE any async work (my first fix armed it after server-start — the gap), `withTimeout()` Promise.race on every unbounded puppeteer call, `--host 127.0.0.1` + `AbortSignal.timeout(2000)` on readiness probes, explicit `process.exit(0/1)` on both paths, and step-level `timeout-minutes: 6` in CI as the outer belt.
- **A 6-hour default-timeout job is a spending-limit grenade.** For any job with flaky potential, set `timeout-minutes` explicitly (the a11y job has 40; verify jobs DON'T — consider adding one at the root workflow level next session).
- **GitHub billing-death signature**: all jobs fail in 2–3s, log blobs 404 (never flushed), and the run view's ANNOTATIONS carry the billing message. Don't debug the workflow when you see this.
- **`docker compose config --images` lists ALL services** — grep for 'engine' picked localtools-client first (run 34635101666). Filter by service arg (`--images engine`) or parse the JSON config.
- **Trivy on node:\*-slim images flags the bundled npm CLI's own tree** (tar/pacote/sigstore/ip-address/brace-expansion/picomatch — 1 CRITICAL + 10 HIGH, none in app deps). Runtime images that only need `node` should strip `npm`/`npx`.
- **cargo audit `--deny warnings` is wrong for Tauri apps**: Tauri's tree carries unmaintained/unsound advisories (proc-macro-error, unic-*, glib) you can't remove. Spec wording ("fail on high/critical") is the correct setting — plain `cargo audit`.
- **Windows `spawn('npx.cmd', …)` needs `shell: true`** (EINVAL otherwise); `fileURLToPath` must be imported explicitly in .mjs.
- **Vite manifest entry**: html entry's `file` is its JS chunk; detect via `isEntry:true` + `src` ending `.html`; `build.manifest` must be enabled explicitly.
- **The engine's functional security tests cannot catch a shell-string regression** (hostile input never reaches argv) — that's exactly why the 14.4 static canary exists. Proven live.
- **Inline python-in-bash heredocs break on backticks** — write edit scripts to a temp .py file and run it.
- **Logs 404 mid-run** — Azure blobs flush only at completion; use the jobs API's step state (`--jq '.steps[] | select(.conclusion == null)')` to see where a running job is.
- Prior-session gotchas (Vite stale-workspace-dep builds, UNC paths, taskkill-tree, axe+hash-router, prettier formats markdown) — still true; see git HANDOFF history.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
