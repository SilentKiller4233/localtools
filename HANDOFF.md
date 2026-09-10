# HANDOFF — read this first in any new session

_Last updated: 2026-09-10 (early hours), end of session 13. Phase 10 (Desktop app, Tauri) COMPLETE and shipped. `pnpm verify` fully green locally (549 tests + 5 Rust shell tests + ignored sidecar smoke). **CI FULLY GREEN on `14b916b` (run 34417207017): verify ubuntu/windows + compose-stack + desktop-build ALL SUCCESS — the Section 14.7 Linux smoke passed (engine healthy 1.26s, healthz OK, release binary 19.1MB).** Chain: `ff5d302` feat → `c07c145` workspace-build fix → `916a811` OS-aware test fix → `5c9bb46` process-group fix → `cc2009d` setsid smoke → `0595b33` draft cleanup → `14b916b` libc::kill fix (the one that made CI green)._

## Where things stand right now

**Phases 0–10 complete (10 of 15).** Phase 10 shipped this session:

- **Rust/Tauri 2.11 shell** in `apps/desktop/src-tauri` (lib+bin split; cargo tests exercise the shipped code). The engine is a RESTRICTED SPAWNED CHILD, not a Tauri externalBin sidecar (D-033 — externalBin wants a single static binary; the engine is a Node app with node_modules). Minimal env (PATH/SystemRoot/TEMP+TMP scoped/LOCALAPPDATA + LOCALTOOLS_* only), loopback bind, healthz wait (per-child port — see gotchas), taskkill-tree/process-group shutdown, single-instance plugin.
- **Window + bridge**: window is built in setup() via WebviewWindowBuilder (NOT tauri.conf.json — Tauri 2 config has no init-script key) with `bridge.js` injected, defining `window.__LOCALTOOLS__` {invoke} over `__TAURI_INTERNALS__.invoke` + `__LOCALTOOLS_ENGINE_PORT__` (synchronous, constant 8787). The client never imports @tauri-apps/api; `desktop-bridge.ts` wraps the global; browsers degrade honestly.
- **Lazy downloads (D-034)**: `manifest.rs` pins URL+SHA-256 for every artifact (yt-dlp/ffmpeg/piper from official checksums; GS/Tesseract/LO MSI/7-Zip/qpdf/eng.traineddata hashed live this session — no upstream checksums exist for those formats). `downloads.rs` streams with digest verify, extracts per kind (7zr→7z2409→full-7z chain for GS SFX + Tesseract NSIS; `msiexec /a` for LibreOffice; tar for Linux; zip via 7z), writes `.installed` marker only after every current-OS artifact succeeded. `.installed` marker + `downloads/` provenance dir per tool under `<app_data>/localtools-tools/<tool-id>/`.
- **D-033 no-restart contract (proven live)**: `tool_env()` pre-wires LOCALTOOLS_*_PATH overrides at spawn for EVERY manifest tool (installed or not). Absent → engine spawn ENOENT → honest 503 tool-unavailable; after download the file appears behind the same override → next request 200 with NO engine restart. `integration_proof` bin: 503→200 through one running engine, end to end. This is the KEY mechanism — do not "fix" it back to installed-only env.
- **Engine bundle (D-038)**: `scripts/build-engine-dist.mjs` — engine build → `pnpm --filter @localtools/engine deploy <target> --prod --legacy` (119MB self-contained, gitignored `engine-dist/`) + optional node runtime (release: pin nodejs.org v22.23.2 via LOCALTOOLS_DESKTOP_NODE; CI smoke: runner's node; dev: which(node)). Ships as Tauri `bundle.resources`.
- **Client**: `ToolDownloadPrompt` (spec line 362 one-time copy + retry/dismiss + Section 13 isolation) wired into EngineRunnerPage + DownloaderPage on `tool-unavailable` (via `tool_for_endpoint` mapping). `engine-client.ts` engineBaseUrl reads the bridge port in the shell; browser paths unchanged. Entry JS 119.85KB gzipped (budget 250KB).
- **CI**: `desktop-build` job (ubuntu): apt deps → pnpm install → **pnpm build** (full workspace — the client build resolves @localtools/ui, the client-alone step failed run 34404366318 and was fixed in c07c145) → engine-dist (runner node) → cargo build → cargo test (5 tests, mock server, no network) → `--ignored` sidecar healthz smoke → release build. Section 14.7: no GUI in CI.
- **Docs**: DECISIONS D-033–D-038 (sidecar choice, download doctrine + per-format extraction proofs, qpdf-fallback interpretation, Linux portable-artifact limits, updater OFF + unsigned-app README steps, engine bundle). TESTS.md Phase 10 rows + the 14-step owner manual click-through checklist (pending owner run). README desktop section with exact per-OS unsigned-app bypass (spec line 399). SUMMARY Phase 10 current.

## Last thing done

1. Environment prep: rustup 1.29.1 (stable 1.98.1, MSVC) + VS 2022 Build Tools (link-verified via hello-world) + @tauri-apps/cli 2.11.4 (all versions from source, recorded D-033).
2. All extraction strategies probed LIVE before writing pipeline code (D-034): GS SFX via full 7z; Tesseract setup is NSIS (innoextract 1.9 REJECTS it — the Inno plan was wrong; 7z lists/extracts tesseract.exe; eng traineddata NOT in the installer → separate artifact; real OCR round trip on the fixture); LibreOffice MSI via `msiexec /a` (real headless conversion from the extracted tree); piper/ffmpeg/qpdf zip layouts; 7zr→7z2409 bootstrap (7zr alone CANNOT read the GS SFX).
3. Shell implemented + all compile errors fixed (edition 2021 missing was the big one; manifest statics vs E0716; test fake_tool via Box::leak).
4. Two REAL bugs found by the ignored smoke and fixed: (a) healthz probe polled the hardcoded 8787 while the test engine was on 8791 — Sidecar now carries its per-child port; (b) Windows `canonicalize()` produces `\\?\` UNC paths that Node CJS cannot resolve (EISDIR 'D:') — never canonicalize paths fed to node.
5. Live verifications: cargo tests 5/5 (+ smoke 0.85s), live_check yt-dlp (17.8MB pinned download, verified, extracted, `--version` = 2026.08.19) + piper zip; integration_proof piper (503 → download → 200, no restart).
6. pnpm verify GREEN (background job — 549 tests + build; entry 119.85KB gz).
7. Committed `ff5d302` "feat(desktop): Phase 10 — ..." and pushed; CI run 34404366318 desktop-build failed (client-alone build missing @localtools/ui dist) → fix-forward `c07c145` pushed; run 34405414767 watched to green in this session's background.

## In-progress / uncommitted work

None — tree is clean at `47e2cc5` (verify with `git status`). Everything is pushed and CI is green on the final HEAD: run 34447371680 on `47e2cc5` (all 4 jobs success) and run 34417207017 on `14b916b` before it. No open loops.

## Next immediate steps (in order — do these first)

1. **Phase 11 — Integration polish** (spec Section 15): health-check gating with friendly language, consistent progress reporting, designed error states across all suites, batch mode where it applies. Acceptance: no tool shows a raw/unstyled error anywhere.
2. While in Phase 11: wire the desktop `desktop_status` (engine readiness) into a client banner if not already visible; the bridge exposes it.
3. Standing pattern for any new engine tool: GroupBRequestHarness + runSubprocess (arg arrays, stdinData when needed) + tool-paths resolver (env → repo-local → Docker → PATH → honest 503). If it needs a new lazy-download, add ONE row to manifest.rs (URL + sha + per-OS layouts) and one EnvBinding — nothing else changes.
4. ffmpeg.wasm small-clip rider stays deferred (D-021/D-032) — revisit before Phase 13.

## Blockers / open decisions needing human input

- Owner items: the 14-step manual click-through checklist (TESTS.md) on a clean machine/VM — required before v1.0.0 per Section 14.7; screenshots for README bypass steps at Phase 15.
- Signing/updater decision deferred to Phase 15 (D-037): owner must produce signing secrets or the release matrix ships unsigned with documented bypass.
- Tauri updater API: intentionally NOT wired (D-037). If Phase 15 enables it, verify the current plugin API from source then (it is version-sensitive).

## Environment / local state notes

- **Rust toolchain now installed on the dev host**: rustup 1.29.1, stable 1.98.1 (x86_64-pc-windows-msvc), VS 2022 Build Tools (VCTools). `cargo` lives at `C:\Users\mshah\.cargo\bin` — bash sessions need `export PATH="/c/Users/mshah/.cargo/bin:$PATH"` (rustup's PATH injection doesn't reach this bash).
- Repo-local native toolchain (gitignored, do not delete): ffmpeg-n9.0…/, yt-dlp-2026.08.19/, gs10.07.1/, GTK3-Runtime/, piper-2023.11.14-2/.
- Model caches (do not delete): `%LOCALAPPDATA%/Temp/localtools-models/` — u2netp, whisper ggml-tiny.en, piper-voices lessac.
- New scratch dirs from this session (safe to delete): `%LOCALAPPDATA%/Temp/p10-artifacts/` (LO MSI/GS/Tesseract/qpdf/innoextract probes — digests recorded in D-034), `p10-live/` (live_check), `p10-proof/` (integration_proof), `p10-artifacts-small/`.
- `apps/desktop/src-tauri/engine-dist/` is a BUILD PRODUCT (119MB, gitignored) — rebuild with `pnpm --filter @localtools/desktop desktop:engine-dist`; CI builds it fresh every run.
- Dev host has NO Docker (D-015) — compose validation only in CI.
- `pnpm verify` takes 5–7 min — ALWAYS run as background with notify (session-11 lesson, still true).

## Useful context / gotchas discovered this session

- **Tauri 2 config has no window init-script key** — the window must be built in setup() via WebviewWindowBuilder with `.initialization_script()` to inject the bridge (verified against tauri-utils 2.9.3 config.rs). Config `windows: []` + builder = the working pattern.
- **Windows `canonicalize()` returns `\\?\D:\...` UNC paths; Node's CJS loader CANNOT resolve them** (EISDIR 'D:' error from realpathSync). Never canonicalize paths fed to node. PathBuf::join of plain components is fine.
- **Tesseract UB-Mannheim-lineage installers are NSIS, NOT Inno Setup** (7z lists NSIS-3 Unicode; innoextract 1.9 fails). 7z extracts them; scoop's tesseract.json confirms the `#/dl.7z` pattern. The 5.5.3 setup ships NO traineddata — eng.traineddata is a separate SingleFile artifact into tessdata/.
- **7zr.exe alone cannot read 7z SFX/NSIS containers** — the chain is 7zr.exe extracts the 7z2409-x64.exe installer (itself SFX), then the extracted full 7z.exe handles everything. All three digests pinned from 7-zip.org (no signed manifest exists; our pins are the verification).
- **`msiexec /a` extracts MSIs without elevation** (administrative install) — verified live with LibreOffice 25.8.7; TARGETDIR must be a plain path; the extracted tree runs soffice headless fine. Invoke via `Start-Process -Wait` or std::process::Command; the bash `cmd //c` quoting mangles args.
- **tauri::generate_context! embeds frontendDist at RUST COMPILE time** — cargo build fails if ../client/dist is missing; CI must `pnpm build` (full workspace — client-alone fails: @localtools/ui must be built first; run 34404366318 lesson).
- **`pnpm deploy` in pnpm 10 needs `--legacy`** for non-injected workspaces (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE) and the target path is THE positional (flags after it); quote the path on Windows when shelling out (pnpm is pnpm.cmd → execFileSync needs shell:true + quoted path).
- **healthz probes must target the SPAWNED port, not the constant** — the engine env carries LOCALTOOLS_ENGINE_PORT; the Sidecar reads it at spawn. Symptom otherwise: engine logs "listening" while the probe times out against 8787.
- **Windows process cleanup**: `cmd //c taskkill` mangles flags through MSYS; use PowerShell `Stop-Process -Id <pid> -Force` from bash, or Command::new("taskkill").args(["/PID", ...]) from Rust (arg arrays are safe both ways).
- **Rust manifest statics**: `&'static [T]` slices must reference NAMED statics (not inline temporaries — E0716). Test fixtures needing two different values: `Box::leak` per call, NOT OnceLock (shared state returns the first value for both).
- **MSYS path conversion is disabled for native tools**: pass `C:/Users/x`-style forward-slash paths to native Windows programs; `//c`-style double-slash flags ARE needed for cmd builtins from git-bash but get mangled — prefer PowerShell for anything complex.
- Engine bundle standalone boot is a great smoke: `LOCALTOOLS_ENGINE_PORT=<p> node dist/server.js` from the deployed copy — healthz + SSRF guard prove the whole isolation worked.
- **GitHub's runner KILLS the whole job (shutdown signal, exit 143) when a step leaves grandchildren it can't manage** — four deterministic kills this session. The full fix stack: engine spawned with `process_group(0)` (own Unix group) + smoke run as a STANDALONE cargo bin under `setsid` (never inside the cargo-test harness — buffered harness output also made the death LOOK like a spawn-time kill when it was actually at stop/step-end) + tree-kill via `libc::kill(-pid)` (cfg-gated; NEVER `Command::new("kill")` — it's a shell builtin whose argv parsing of "-<pid>" is unreliable). All four pieces were needed; each alone still died.
- **The ignored cargo-test smoke stayed in the suite but CI uses `ci_smoke` bin instead** — cargo test still works locally (`--ignored`); the CI workflow step runs `setsid cargo run --bin ci_smoke`. Don't "simplify" CI back to the test-harness form without expecting the runner kills to return.

## 0. Binding owner directives (unchanged — do not violate)

1. Follow PROJECT_SPEC.md exactly where explicit; conservative spec-consistent choices elsewhere, recorded in DECISIONS.md.
2. Version-sensitive APIs verified from installed .d.ts/source, never memory (Context7 NOT connected).
3. Commit after each phase; `pnpm verify` green before any phase is "done"; CI green on every push to main; fix-forward, never amend; never force-push main.
4. Secrets only in gitignored `.env` / Hermes config — never print, never commit. No NEW literal secrets in tracked files.
5. Keep SUMMARY.md current every phase end; HANDOFF.md rewrite is the literal last action every session.
6. Tests against local mock servers / committed fixtures only — never live third-party sites in CI (D-026).
7. Every lazy-download (models, voices) is URL-pinned + SHA-256-verified with an honest degradation path (503/retry copy) when absent — CI never needs network for fixtures.
