# HANDOFF — read this first in any new session

_Last updated: 2026-09-30, end of session 21. **v1.0.0 IS TAGGED AND RELEASED.** Tag `v1.0.0` at `6cdf3f0`; release workflow run 36779677622 concluded `success` with all three OS legs green, publishing a **draft** release carrying 7 installers, every one stamped 1.0.0. All 15 phases complete. The only outstanding items are four human-hardware checks, each recorded as owner-blocked with its exact reason in TESTS.md._

## Where things stand right now

**Shipped.** Reaching the tag required fixing five latent defects that had been hiding in a release workflow which had never once executed.

What this session did, in order:

1. **Merged PR #1** (`d010fe1`, merge commit) — the Phase 13 acceptance that had been blocked for nine sessions. Confirmed main's own run green 7/7 (`36769786973`).
2. **Audited `release-desktop.yml` before tagging** rather than trusting it, because it had never run. Found and fixed a `shell: bash` omission that would have failed the Windows leg (bash syntax under PowerShell).
3. **Rehearsed the release on disposable tags** (review C3's recommendation) — `v0.0.0-release-dryrun` through `-dryrun4`. Each run surfaced a different, later failure mode, all in never-executed code paths:
   - `frontendDist` was `../client/dist` → resolved to `apps/desktop/client/dist`, a path that does not exist. Correct value is `../../client/dist`. **Release-blocking.**
   - Desktop app still carried the Phase 10 placeholder `0.1.0` in `tauri.conf.json` + `Cargo.toml` — a v1.0.0 release whose installer reported 0.1.0. Bumped, with `Cargo.lock` updated via `cargo update` (CI builds `--locked`).
   - No `permissions:` block, and the repo defaults workflows to read-only, so tauri-action built every installer then failed creating the draft release. Granted `contents: write` to this workflow only.
   - Windows leg: `icons/icon.ico` exists in the repo but `bundle.icon` declared only the PNG, so WiX failed with "Couldn't find a .ico icon".
4. **Cut `v1.0.0`** at `6cdf3f0`, only after main was 7/7 green at that exact commit. Release run: `success`, 7 installers, all 1.0.0.
5. **Verified the artifact independently** — downloaded the Windows installer via the API: 30,343,200 bytes, `MZ` header. A genuine PE executable, not a placeholder.
6. Updated README/SUMMARY/TESTS to the tagged state (the DoD requires docs "current as of the `v1.0.0` tag").
7. **Audited every completion-contract gate at the shipped state** rather than trusting the earlier session. All satisfied: `pnpm verify` exit 0; CI run 36768728300 `success` (7/7); release lists Windows + macOS + Linux. Tests reconciled per suite to exactly **600** (delta 0). SSRF/security suites 56/56. `shell:false` canary proven red-capable by injection and the file restored byte-identical. 0 secrets across 385 tracked files (scan proven able to detect). All 12 lazy-download URLs have SHA-256 companions. Precious dirs intact; main never force-pushed or amended (reflog shows only `update by push`). Two real defects found and fixed — see "Last thing done".

## Last thing done

1. `v1.0.0` pushed at `6cdf3f0` (`git ls-remote` confirms `refs/tags/v1.0.0^{}` = `6cdf3f0`). Release run 36779677622: **conclusion `success`**, ubuntu/windows/macos all green.
2. Draft release `v1.0.0` (id 400456038) holds: `LocalTools_1.0.0_x64-setup.exe` (30,343,200 B), `LocalTools_1.0.0_x64_en-US.msi` (50,410,325 B), `LocalTools_1.0.0_aarch64.dmg` (45,519,488 B), `LocalTools_aarch64.app.tar.gz` (45,172,101 B), `LocalTools_1.0.0_amd64.deb` (50,866,640 B), `LocalTools-1.0.0-1.x86_64.rpm` (51,032,245 B), `LocalTools_1.0.0_amd64.AppImage` (124,615,160 B).
3. Re-verified at the tag commit: `cargo test --lib` **5/5**, and the PWA offline reload check **OFFLINE_RELOAD_PASS** (18 cards from cache).
4. Doc accuracy pass: killed three stale claims (README status line, Roadmap, SUMMARY's "stays `if: false`"), plus the bundle figure corrected earlier this session (121.60 → 121.70KB, verified stale rather than regressed).
5. Gates re-run locally: `pnpm format:check` clean, `LICENSING_CHECK_PASS`, `LINKS_OK` (23 relative links).
6. **Fixed four high-severity Fastify advisories (D-049).** The first CI run _after_ the tag failed on a docs-only commit — verify(ubuntu), verify(windows) and supply-chain all red. Not the docs: CVE-2026-84428 / 84469 / 84504 (header-validation bypass, request-validation bypass, unauthorized state change via request body replacement) plus two GHSA and a moderate DoS had been published after the tag, and `apps/engine`'s `fastify: ^5.1.0` resolved to 5.12.1 — inside every affected range. The range already permitted the fix, so it was a resolution floor, not an API change: raised to `^5.12.5`, lockfile pins 5.12.5. One root cause, three red jobs. Engine suite re-run against it: **144/144, same count as before**. Main CI run 36922004069 then went `success` on all 7 jobs. The release and its tag were not touched.
7. **Found and fixed a real security-reporting defect**: SECURITY.md told reporters to use the private advisory route "once this repo is published" — but the repo has been public since D-010 and `GET /private-vulnerability-reporting` returned `{"enabled": false}`, so the documented path led nowhere. Enabled it via the API (verified `{"enabled": true}`, advisories URL resolves) and rewrote the instruction to link the form directly. A security policy that routes reports into a void is worse than one that says "open an issue".

## In-progress / uncommitted work

None — the doc updates above are the only edits, committed with this handoff.

## Next immediate steps (in order — do these first)

1. **Owner: run the manual click-through** (TESTS.md steps 1–14) on a clean machine or clean VM using the released installer. This is the substantive remaining DoD item.
2. **Owner: publish the draft release** once the click-through passes. Deliberately a human gate (D-047) so a green tag cannot auto-publish ahead of the manual checks.
3. **Owner: screen-reader spot-check** on 4 suites (NVDA/VoiceOver) — see the owner-blocked register in TESTS.md for what automation already covers.
4. **Owner: true macOS Safari** check — Playwright WebKit covers Safari's engine; macOS-specific behaviour (OffscreenCanvas on the PDF render path, Gatekeeper prompt) does not.
5. **Review the 7 open Dependabot PRs** — they activated when the repo went public (D-010). Notable: `js-yaml 5.4.2` and `vitest 5.0.2` are major bumps that need judgement, not auto-merge.

## Blockers / open decisions needing human input

Four items, all owner-blocked for the same class of reason — they need hardware or human capability this environment lacks. Full register with exact reasons in TESTS.md; the post-release contract audit that re-verified every gate is recorded there too.

**Repro steps the owner needs** (so none of these is a vague 'please test'):

- _Click-through_: download `LocalTools_1.0.0_x64-setup.exe` from the v1.0.0 draft release, SmartScreen → More info → Run anyway, then walk TESTS.md steps 1–14 in order on a machine with no repo checkout.
- _Screen reader_: run NVDA (Windows) or VoiceOver (macOS) against one tool per suite — merge-pdf, image-converter, json-formatter, text-to-speech.
- _macOS Safari_: open the Docker-served client (`pnpm dev`, then :5173) in Safari on an actual Mac; watch OffscreenCanvas on the PDF render path and the TTS/worker pages.
- _Publish_: GitHub → Releases → the v1.0.0 draft → Publish release. Do this only after the click-through, since the draft exists precisely to gate it.

- **Clean-machine click-through** — this host is not clean: it carries the repo-local native toolchain (`ffmpeg-n9.0…/`, `yt-dlp-2026.08.19/`, `gs10.07.1/`, `piper-2023.11.14-2/`) and warm model caches, so "first launch downloads X" cannot be honestly reproduced — a run would resolve already-present tools and prove nothing.
- **Screen-reader spot-check** — NVDA is not installed on this host (`C:\Program Files\NVDA` absent) and a screen reader cannot be driven programmatically. Structure is fully covered by axe-core (103 routes × 2 themes, zero violations), the Tab-order sweep, and token-level contrast tests; what is unverified is announcement _quality_.
- **True macOS Safari** — host is Windows 11 (`MSYS_NT-10.0-26200`); GitHub's macOS runners are Linux and no macOS device is reachable.
- **Publishing the draft** — intentional human gate, not a technical blocker.

Unilateral defaults this session (D-048): chose the newest patched dependency versions over the minimum clearing the high gate; scoped the glib cargo-audit exception to one advisory id with inline rationale rather than loosening the gate; kept `releaseDraft: true`; rehearsed on disposable tags rather than tagging first.

## Environment / local state notes

- **pnpm is NOT on PATH in the Hermes bash shell.** `npx --yes pnpm@10.34.5` works for one-off calls but is **not sufficient** for this repo: pnpm does not inject itself into child PATH, and the root `verify` script chains its own nested `pnpm` calls. Use instead:
  `export PATH="/c/Users/mshah/AppData/Local/npm-cache/_npx/381139ee5d646d31/node_modules/.bin:$PATH"` — a real pnpm 10.34.5 shim, then plain `pnpm` works at every level.
- Rust: `export PATH="/c/Users/mshah/.cargo/bin:$PATH"` (rustup 1.29.1, cargo/rustc 1.98.1). `cargo audit` is NOT installed here (~7 min to build); CI runs it.
- **A release build now exists locally**: `apps/desktop/src-tauri/target/release/localtools-desktop.exe` (19,914,240 bytes) — the first time the desktop app has been compiled in release mode on this host.
- Repo-local native toolchain (gitignored, do not delete) is listed above; this is precisely why the clean-machine click-through cannot be faked here.
- `apps/desktop/src-tauri/engine-dist/` is a build product (gitignored); rebuild via `pnpm --filter @localtools/desktop desktop:engine-dist`.
- Dev host has NO Docker (D-015) — compose/Trivy only in CI.
- `pnpm verify` ~10–12 min — ALWAYS background with notify. Playwright WebKit + Chromium in `%LOCALAPPDATA%/ms-playwright/`.
- gh authenticated as SilentKiller4233 (repo+workflow). **Draft releases are not addressable by tag via REST** — list them: `gh api repos/SilentKiller4233/localtools/releases --jq '.[] | "\(.id) \(.tag_name) draft=\(.draft)"'`.
- Repo default workflow permissions are **read-only**; release-desktop.yml declares `contents: write` explicitly rather than the repo default being loosened.

## Useful context / gotchas discovered this session

- **A CI job that has never run is untested code.** Five distinct defects lived in the un-gated release workflow. The `desktop-build` job claimed it "exercises the same pipeline pieces" — true on Linux, which is exactly why the Windows-shell and icon defects survived. A green proxy job cannot stand in for the thing it proxies.
- **Rehearse destructive/irreversible automations on a disposable artifact.** Four throwaway tags cost ~40 minutes and found five defects that would otherwise have shipped under a public `v1.0.0`.
- **Don't trust a first diagnosis — let the log disprove it.** I assumed `beforeBuildCommand` wasn't running and "fixed" it with an extra build step; the dry-run log showed it running fine, which is what forced the real root cause (`frontendDist` off by one directory). A fix that changes nothing is a signal to re-diagnose, not to move on.
- **Prove a fix is red-capable before shipping it.** Re-injecting the bad `frontendDist` reproduced the failure on demand; then the corrected path cleared it. Same discipline for the bash empty-value guard (bash treats `""` as 0, so a failed capture would have recorded a bogus `0MB` and passed).
- **Read the WHOLE CI log, not the tail.** A truncated `cargo audit` output showed one advisory and hid RUSTSEC-2026-0285 (rustls, a real CVE with a patch).
- **`gh run view --job <id> --log` returns nothing while the run is in progress** — wait for `status == completed` or you'll conclude a step produced no output when you queried too early.
- **A stale blocker and a never-executed gate are the same error class**: assuming a thing's state instead of observing it. Both cost real time this session.
- **`read_file` output carries line-number prefixes — never feed it straight back to `write_file`.** The tool refuses it (correctly); use `patch` for edits. I hit this and confirmed via `git status` that nothing was corrupted.
- **Bash arithmetic treats an empty string as 0** — a silently-failed `$(...)` capture becomes a plausible `0` and passes. Guard with `[ -z "$VAR" ]`.
- **Windows ESM loader rejects absolute import paths** (`ERR_UNSUPPORTED_ESM_URL_SCHEME`) — use `pathToFileURL(p).href`.
- **Prettier reflows long markdown lines and can fail the whole verify** — run `pnpm format` after any doc edit. It also rewrites `*and*` → `_and_`, so `format` can produce a diff after a no-content-change edit.
- Prior-session gotchas (wedge discipline, react-test-renderer deprecated, no-dynamic-delete on process.env, ULID/worker env quirks, CDP `/json/new` needs PUT, `Emulation.setDeviceMetricsOverride` not `Page.setDeviceMetricsOverride`) still true; see git HANDOFF history.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context3 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
