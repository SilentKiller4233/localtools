# HANDOFF — read this first in any new session

_Last updated: 2026-08-25 ~21:45 PKT (UTC+05:00), end of session 1 — Phase 0 complete, Phase 1 not started_

## Where things stand right now

Phase 0 (Repo scaffold) of PROJECT_SPEC Section 15 is **complete and committed** (`436f583`, branch `main`). Both acceptance criteria verified: `pnpm install && pnpm build` succeeds with stub apps, and SUMMARY.md/HANDOFF.md exist per Section 17 templates. Phase 1 (design direction via Stitch MCP) has **not** been started. The repo also exists on GitHub as [SilentKiller4233/localtools](https://github.com/SilentKiller4233/localtools) (created via Composio, public, empty), but the local commit could **not** be pushed — see Blockers.

## Last thing done

Attempted to push `main` → GitHub through three transports (Windows Credential Manager credential, gh CLI keyring token, SSH) — all denied for write access; read access works fine. Before that: committed Phase 0 as `chore: scaffold monorepo per PROJECT_SPEC Phase 0` after a green `pnpm verify` and a runtime smoke test of the engine.

## In-progress / uncommitted work

None, working tree is clean (`git status` empty). All Phase 0 work is in commit `436f583`.

## Next immediate steps (in order — do these first)

1. **Ask the user to fix push credentials, then push.** Either: (a) add the current repo to the fine-grained PAT's "Repository access" allowlist at github.com/settings/personal-access-tokens (then `gh auth refresh`-less retry of step below), (b) create a classic PAT with `repo` scope and run `gh auth login` / update Windows Credential Manager, or (c) add an SSH key. Then run:
   `cd "/d/random projects vibecoded/QOL tools" && git push -u origin main`
2. Verify CI ran on the push (Actions tab): ci.yml should show a green verify matrix (ubuntu+windows) + compose-validate job. Fix any CI-only failures before Phase 2 relies on it.
3. Start Phase 1 per spec order: call Stitch MCP FIRST for the five screens named in Section 9 (home suite-nav + tool grid, Merge PDF, Universal Downloader, Image Converter, JSON Formatter, shared drop-zone) BEFORE writing any component code.
4. Translate the Stitch direction into design tokens + base components in `packages/ui`; expose them at `/dev/ui-preview` in both themes (Phase 1 acceptance).
5. Update SUMMARY.md at end of Phase 1; commit with conventional message.

## Blockers / open decisions needing human input

- **Push credentials (needs human action).** The gh CLI token is a fine-grained PAT whose repository allowlist doesn't include repos created after it was issued; Credential Manager holds another insufficient credential; no SSH key exists. Repo creation itself worked via Composio (its GitHub App connection has admin rights there), but Composio's `GITHUB_COMMIT_MULTIPLE_FILES` would create divergent history — do NOT use it to work around this. Local commits continue to be safe meanwhile.
- Deferred (recorded in DECISIONS.md, not blocking): @imgly/background-removal license re-check (Phase 5, D-001); ffmpeg build variant (Phase 7, D-001); SECURITY.md contact address (D-006).

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces in path — always quote).
- Windows host, bash (MSYS) shell. Node v22.23.2 at `$HOME/AppData/Local/hermes/node/node.exe`; system Node v25.2.1 also installed (not targeted). pnpm 10.34.5 global. Git identity: SilentKiller4233 / 112719730+SilentKiller4233@users.noreply.github.com.
- `pnpm verify` currently green (format+lint+typecheck+build across all 8 workspaces). Client bundle ≈46KB gzipped (budget 250KB).
- Port 8787 free (test engine was killed after verification). No Docker daemon verified — compose images never built yet (not required by Phase 0 acceptance).
- Remote `origin` = https://github.com/SilentKiller4233/localtools.git (attached; push blocked as above).

## Useful context / gotchas discovered this session

- tsconfig `extends` paths resolve relative to the FILE doing the extending — from `packages/x/` or `tooling/y/` the repo root is `../../`, not `../../../`.
- Relative `rootDir`/`outDir` must live per-package (they anchor to the base config's directory otherwise). Base config now carries none.
- Module strategy is split deliberately: base = NodeNext (engine needs explicit `.js` relative imports), `tooling/tsconfig/react.json` overrides to Bundler (Vite code). DOM + WebWorker libs conflict in TS 5.9 stdlib — react.json uses DOM only.
- pnpm 10 blocks postinstall scripts by default; esbuild is allowlisted via root package.json `pnpm.onlyBuiltDependencies`. Future deps needing build scripts must be added there explicitly (supply-chain rule).
- Every workspace package needed its own `eslint` devDep (peer-only declaration doesn't put the binary on PATH under pnpm).
- Background node processes survive their wrapper shell on this host — kill by PID from netstat (`MSYS_NO_PATHCONV=1 taskkill /F /PID <pid>`), don't trust process(kill) on the wrapper alone.
- Prettier runs over tracked .md files too (no markdown linting conflicts, but expect reflow diffs after python-based edits; `.prettierrc.json`: singleQuote, width 100, trailingComma all).
