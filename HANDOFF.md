# HANDOFF — read this first in any new session

_Last updated: 2026-09-30, end of session 20. **CI IS UNBLOCKED AND FULLY GREEN — run 36764811728, 7/7 pass, conclusion `success`.** The billing "blocker" that led the last several handoffs was stale: the repo had already been flipped public (D-010), so a plain `gh run rerun` started every job. D-037 is resolved (owner chose SHIP UNSIGNED) and `release-desktop.yml` is un-gated. **The v1.0.0 tag is now the only remaining step**, and it is an owner action._

## Where things stand right now

**All 15 phases built. Full CI matrix green for the first time in the repo's history. Every prior v1.0.0 blocker except the tag itself is closed.**

What changed this session (the first session where CI could actually run):

1. **The billing blocker was already gone.** `gh repo view` → `visibility: PUBLIC`. The last billing-annotated run was 16 days old. `gh run rerun 34860363797 --failed` started immediately and all 7 jobs launched. No billing fix was ever required. This is why the previous handoff's "9th failed probe pending" would have been a wrong report if trusted without re-probing.
2. **First real CI execution found 4 genuine failures** (run 34860363797: 3 pass / 4 fail). These had never been caught because the jobs had never run. All fixed — see below.
3. **D-037 resolved: ship unsigned.** `release-desktop.yml`'s `if: false` removed → a `v*` tag now builds the real three-OS tauri-action matrix and publishes a **draft** release.
4. **Final state: run 36764811728, 7/7 pass, `success`.** This is the Phase 13 acceptance run.

## Last thing done

1. **`pnpm verify` green locally** (600 tests + all gates) at the overridden tree — WORKER_OFFLOAD_PASS, OFFLINE_RELOAD_PASS, LICENSING_CHECK_PASS, bundle gate. Re-run 3× this session: twice it stopped at the Prettier gate because my own doc edits weren't formatted (fixed with `pnpm format`, no content change).
2. **compose-stack fixed** (a latent repo bug, not dependency drift): the Phase 14 Section 11 step used `{{div .Size 1048576}}` in a `docker image inspect` Go template; Docker's template set has no `div` → "function div not defined". It had never executed because CI was billing-blocked. Moved the MB math to bash and added an empty-value guard — bash arithmetic treats `""` as 0, so without the guard a missing image would record a bogus "0MB" and **pass**. Guard proven red-capable (empty → exit 1).
3. **verify jobs fixed** via scoped pnpm overrides for two new advisories: `fast-uri` (3.1.8 / 4.1.5, transitive of fastify via ajv) and `brace-expansion` (1.1.21 / 5.0.12, via minimatch in eslint/typescript-eslint). Pinned to the newest patch, not the minimum clearing the high gate, so moderates go too. `pnpm audit` at ALL severities → **"No known vulnerabilities found"**.
4. **supply-chain fixed** — two distinct cargo advisories, not one: (a) RUSTSEC-2026-0285 rustls 0.23.44, a real TLS vulnerability with a patch → bumped properly to 0.23.45 (`cargo update -p rustls --precise 0.23.45`; lockfile diff is exactly one version line); (b) RUSTSEC-2024-0429 glib 0.18.5 `VariantStrIter` `unsound`, patched only in glib ≥0.20.0, which `gtk 0.18.2` (via tauri 2.11.5) forbids — verified by trying the bump and reading the error. Handled with a new `apps/desktop/src-tauri/audit.toml` ignoring that ONE id, rationale inline, explicitly not a blanket exemption. Local `cargo test --lib` 5/5 against rustls 0.23.45.
5. **The Section 11 image size finally recorded**: `ENGINE_IMAGE_SIZE=1464260273 bytes (1396MB)`. README now carries the measured number with provenance, replacing a promise to fill it in later.
6. Committed and pushed: `8579e86`, `63a277c`, `05c3fe5`, `e304c04`, `73ae826` on `phase-13-ci-finalization`.

## In-progress / uncommitted work

None — tree is clean at `73ae826` apart from this HANDOFF rewrite, which is committed with it.

## Next immediate steps (in order — do these first)

1. **Merge PR #1** — all 7 checks are green on run 36764811728. `gh pr merge 1 --merge` (the handoff's stated intent is a merge commit, not squash), then confirm `main`'s own run is green.
2. **Owner's manual items** (TESTS.md) — the only things no agent run can discharge: desktop click-through on a clean machine, screen-reader spot-check ×4, true macOS Safari.
3. **Optional: exercise `release-desktop.yml` before the real tag** via a throwaway tag (review C3's recommendation). The `desktop-build` job has already proven every piece of the same pipeline on 36764811728, so this is belt-and-braces, not a known gap.
4. **Tag `v1.0.0`** → triggers the now-un-gated release workflow (three-OS installers, **draft** release). Publishing that draft is a separate, explicit human step after items 2–3.
5. Final HANDOFF/SUMMARY truth-up against the tagged state (the DoD asks docs be "current as of the v1.0.0 tag").

## Blockers / open decisions needing human input

- **None blocking the tag.** Both former blockers are closed: billing (resolved by the public flip) and D-037 (owner chose unsigned; updater deliberately stays OFF — unsigned self-updating trains users to click through warnings for any later binary).
- The `audit.toml` glib exception is a standing, deliberate trade-off: re-examine it if any LocalTools Rust code ever uses glib Variants directly, and delete it when Tauri ships on gtk-rs 0.20+. Recorded in-file and in DECISIONS D-047.
- Owner manual items above.
- Unilateral defaults this session (D-047): chose the newest patched dependency versions over the minimum that clears the high gate; treated the glib advisory as an audited, scoped exception rather than loosening the cargo-audit gate; kept `releaseDraft: true` so a green tag cannot auto-publish ahead of the manual checks.

## Environment / local state notes

- **pnpm is NOT on PATH in the Hermes bash shell.** `npx --yes pnpm@10.34.5` works for one-off calls, BUT it is not sufficient for this repo: pnpm does not inject itself into child PATH, and the root `verify` script chains its own nested `pnpm` calls, so `npx pnpm verify` dies on the inner invocations. **Use instead:** `export PATH="/c/Users/mshah/AppData/Local/npm-cache/_npx/381139ee5d646d31/node_modules/.bin:$PATH"` — a real pnpm 10.34.5 shim, then plain `pnpm` works at every level. (Verified: `pnpm --version` → 10.34.5, workspace resolution OK, turbo 2.10.12 reachable, child processes see `pnpm`.)
- Rust toolchain: rustup 1.29.1, cargo/rustc 1.98.1 — bash needs `export PATH="/c/Users/mshah/.cargo/bin:$PATH"`. `cargo audit` is NOT installed on this host (installing it takes ~7 min); CI runs it in the supply-chain job.
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/`.
- `apps/desktop/src-tauri/engine-dist/` is a build product (gitignored) — rebuild via `pnpm --filter @localtools/desktop desktop:engine-dist` before any sidecar smoke.
- Dev host has NO Docker (D-015) — compose/Trivy only in CI.
- `pnpm verify` ~10–12 min — ALWAYS background with notify.
- Playwright WebKit 26.6 + Chromium in `%LOCALAPPDATA%/ms-playwright/`; browser-check ports 4181/4182 (a11y job 4173); screenshot script uses preview :4189 + CDP :9223.
- gh is authenticated as SilentKiller4233 (scopes repo+workflow; missing read:org, not needed here).

## Useful context / gotchas discovered this session

- **The big one: a blocker copied forward in a handoff must be re-probed before it is reported as live.** The billing issue had been carried as the top blocker for 9 sessions while the repo was already public. One `gh run view` would have caught it.
- **CI being dead hides real bugs, it doesn't just delay them.** The `{{div}}` template bug had been sitting in a committed workflow since Phase 14 and could not fail until the billing block lifted. Treat "this job has never run" as untested code, not as "this job is fine".
- **Bash arithmetic treats an empty string as 0.** A `$(...)` capture that fails silently turns into a plausible-looking `0` — so a size/metric step can pass while reporting nonsense. Guard with an explicit `[ -z "$VAR" ]` check; then prove the guard fails.
- **`gh run view --job <id> --log` returns nothing while the run is still in progress** (and even briefly after a job finishes). Wait for `status == completed` before reading logs, or you will conclude a step produced no output when you simply queried too early.
- **Reading only the tail of a CI log hid a second vulnerability.** The truncated `cargo audit` output showed one unsound advisory; the full log also contained RUSTSEC-2026-0285 (rustls, a real CVE with a patch). Pull the whole log before deciding a security job has a single cause.
- **pnpm does not add itself to the PATH of scripts it runs** — a wrapper that resolves pnpm is not enough when the scripts themselves call pnpm. Put a real pnpm on PATH.
- **Windows ESM loader rejects absolute import paths**: `await import('D:/…')` throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` — convert with `pathToFileURL(p).href` first.
- **Prettier reflows long markdown lines and can fail the whole verify** — run `pnpm format` after any doc edit, before starting a verify. It also rewrites `*and*` → `_and_` in prose, so `format` can produce a diff after a no-content-change edit.
- **Blank-vs-real screenshot heuristic**: a rendered 1280×800 suite grid PNG is 85–133KB; a blank page is ~5KB. Tool pages 24–28KB.
- **Model in this Hermes session is text-only** — vision_analyze on local PNGs fails; verify screenshots programmatically (dimensions + file size).
- Prior-session gotchas (wedge discipline, react-test-renderer deprecated, esbuild `→` in .tsx test names, no-dynamic-delete on process.env, ULID/worker env quirks, CDP `/json/new` needs PUT, `Emulation.setDeviceMetricsOverride` not `Page.setDeviceMetricsOverride`) still true; see git HANDOFF history.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context3 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
