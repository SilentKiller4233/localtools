# HANDOFF — read this first in any new session

_Last updated: 2026-08-24 ~18:10 PKT, mid-session during Phase 0 (will be refreshed at session end)_

## Where things stand right now

Phase 0 (Repo scaffold) of PROJECT_SPEC Section 15, execution phase. All Phase 0 files are written to disk: pnpm workspaces + Turborepo root config, strict TS configs, ESLint/Prettier tooling packages, six stub packages under `packages/`, stub apps (`client` Vite+React, `engine` Fastify /healthz on 127.0.0.1:8787), docker/ + .github/ + .env.example placeholders, full doc set (README, SECURITY, ARCHITECTURE, CONTRIBUTING, TESTS, DECISIONS D-001..D-009), SUMMARY.md and this HANDOFF.md initialized per Section 17.

## Last thing done

Initialized SUMMARY.md and HANDOFF.md from the Section 17 templates. Next action queued: run `pnpm install` to generate the lockfile and node_modules, then a repo-wide Prettier format pass, then `pnpm verify`.

## In-progress / uncommitted work

Everything. Git repo not even initialized yet (`git init` + initial commit are pending steps below). No work has been lost; the tree on disk is complete through the docs step of Phase 0.

## Next immediate steps (in order — do these first)

1. Run `pnpm install` (expect a fresh `pnpm-lock.yaml`; commit it). Watch for peer-dep warnings on eslint/typescript versions.
2. Run `npx prettier --write .` once, then `pnpm verify` — fix any lint/type errors until green (Phase 0 acceptance).
3. `git init && git add -A && git commit -m "chore: scaffold monorepo (pnpm workspaces, turbo, strict ts, stub apps/packages, docs)"` — include PROJECT_SPEC.md, SUMMARY.md, HANDOFF.md in the same commit per Section 17.3.
4. Attempt GitHub repo creation via Composio (`GITHUB_CREATE_A_REPOSITORY` then push); if Composio lacks a connection, log the blocker here instead of stalling.
5. Begin Phase 1 (design direction): call Stitch MCP for the five screens named in Section 9 BEFORE writing any component code.

## Blockers / open decisions needing human input

- None blocking. GitHub remote creation depends on the Composio GitHub connection being active; if it isn't, local commits proceed and the remote is attached later.
- Deferred decisions recorded in DECISIONS.md, none requiring input now: @imgly/background-removal license re-check (Phase 5, D-001), ffmpeg build variant (Phase 7, D-001), SECURITY.md contact address (D-006).

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (path contains spaces — quote it in shell commands).
- Windows host, bash (MSYS) shell. Node: use Hermes' Node 22 at `$HOME/AppData/Local/hermes/node/node.exe` (v22.23.2); system Node 25 also exists at `C:\Program Files\nodejs`. Bare `node` was NOT resolving initially but npm/pnpm work after `npm i -g pnpm@10`.
- pnpm 10.34.5 installed globally via npm. Git identity configured (SilentKiller4233).
- No Docker Desktop daemon verified yet — compose build untested (not required for Phase 0 acceptance).
- Ports: nothing running yet; client will use 5173, engine 8787.

## Useful context / gotchas discovered this session

- `write_file`'s JSON validator rejects JSONC (comments in tsconfig.base.json) — keep comments out of tracked .json files.
- The `terminal` tool runs git-bash, not PowerShell; MSYS path quirks apply (use forward-slash native paths for native tools).
- Turbo 2.x requires `tasks` (not legacy `pipeline`) in turbo.json.
- Fastify 5 needs Node ≥20; Vite 6 needs Node ≥18 — both satisfied by pinned Node 22.
