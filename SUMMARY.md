# LocalTools — Project Summary

_Last updated: 2026-08-24, after Phase 0 — Repo scaffold_

## What this project is

LocalTools is an open-source, self-hosted, privacy-first alternative to the whole category of rate-limited/paywalled/ad-choked "free tool" websites (iLovePDF-style PDF tools, social media downloaders, image converters, JSON formatters). It ships as a one-click desktop app (Tauri) and a Docker Compose stack, and every tool is free and unlimited.

## Current status

- Phases complete: 0 of 15 (Section 15)
- PDF suite: not started
- Media suite: not started
- Image suite: not started
- Text & Dev suite: not started
- Desktop app (Tauri): not started (placeholder `apps/desktop/README.md` only)
- Docker Compose target: compose file + both Dockerfiles scaffolded with hardened defaults (non-root, read-only rootfs, loopback-only engine port); images **not yet built/run**
- Test suite (`pnpm verify`): passing (format + lint + typecheck + build); no functional tests yet — they arrive from Phase 3 onward

## What has been built so far

**Phase 0 — repo scaffold**

- pnpm workspaces (`apps/*`, `packages/*`) + Turborepo 2.x (`tasks` schema) monorepo at repo root
- Strict TypeScript baseline: root `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …) shared via `tooling/tsconfig` presets (`node.json`, `react.json`)
- Shared tooling packages: `tooling/eslint-config` (flat config, strictTypeChecked, react-hooks), `tooling/prettier-config`
- Stub apps that build clean:
  - `apps/client` — Vite 6 + React 18 + TS shell listing the four suites (real UI arrives Phases 1–2)
  - `apps/engine` — Fastify 5 server exposing only `GET /healthz`, bound to `127.0.0.1:8787`
- Six stub packages wired into the graph: `pdf-core`, `media-core`, `image-core`, `devtext-core`, `ui`, `shared-types`
- Docker placeholders: `docker-compose.yml` (hardened: non-root, read-only, cap-drop ALL, no-new-privileges, loopback-published engine port), `docker/client.Dockerfile`, `docker/engine.Dockerfile`, `docker/Caddyfile` (optional caddy profile)
- CI placeholder: `.github/workflows/ci.yml` (verify on ubuntu+windows matrix, compose syntax check); `.github/workflows/release-desktop.yml` present but disabled via `if: false` until Phase 10
- Repo hygiene: `.gitignore`, `.gitattributes` (LF everywhere), `.editorconfig`, `.env.example` covering every Section 5 env var with safe defaults, `.vscode/extensions.json`
- Docs seeded: README, SECURITY.md, ARCHITECTURE.md, CONTRIBUTING.md, TESTS.md, DECISIONS.md (D-001…D-009), LICENSE (MIT)

## What's left

- Phase 1 — design direction via Stitch MCP → tokens + base components in `packages/ui`; `/dev/ui-preview` route
- Phase 2 — client shell: routing, suite nav, filterable tool grids for all Section 3 tools, PWA manifest/service worker (Lighthouse PWA ≥90)
- Phase 3 — PDF Group A tools + tests (Sections 14.1–14.3 incl. redaction content-removal test)
- Phase 4 — PDF Group B endpoints behind Section 5 controls (Docker target)
- Phase 5 — Image suite (all Group A) + EXIF-stripping byte-level test
- Phase 6 — Text & Dev suite (all Group A)
- Phase 7 — Media conversion (ffmpeg Group B) + ffprobe sanity checks
- Phase 8 — Media downloader (Group C) with full Section 5.8 SSRF set from the start
- Phase 9 — Speech-to-text (whisper.cpp WASM) + auto-captions
- Phase 10 — Tauri desktop shell + sidecar + lazy downloads
- Phase 11 — integration polish · Phase 12 — accessibility/responsiveness · Phase 13 — test/CI finalization · Phase 14 — performance/size · Phase 15 — docs & v1.0.0 release

## Key architectural decisions made so far

All detailed in [DECISIONS.md](DECISIONS.md): MIT license with subprocess-boundary reasoning for AGPL deps (D-001); stub engine intentionally minimal + loopback-only until its security phases land (D-002); Node 22 LTS + pnpm 10 pinned (D-003); Turbo 2 `tasks` schema (D-004); release workflow committed disabled until Phase 10 (D-005); source-first TS exports across workspace packages (D-007); `tooling/` added alongside spec tree for shared configs (D-008).

## Known issues / tech debt

- Engine has zero Section 5 controls yet (by design at this phase; see D-002) — must never be exposed past localhost until Phases 4/7/8 land those controls.
- `apps/desktop` contains no code yet; directory exists only as README placeholder.
- GitHub remote not yet attached (Composio connection status checked at end of Phase 0; result recorded in HANDOFF.md).
- CI workflow is untested against a real remote until the repo is pushed.

## How to run the project right now

```bash
pnpm install          # pnpm-lock.yaml is committed
pnpm dev              # client → http://localhost:5173 ; engine health → http://127.0.0.1:8787/healthz
pnpm build            # all workspaces
pnpm verify           # format + lint + typecheck + build gate
# optional: docker compose up --build   → client :5173, engine :8787 (loopback only)
```

No tools are functional yet beyond the stub shells — tool grids arrive in Phase 2. The engine's `/healthz` was runtime-verified this phase (HTTP 200 `{"ok":true,"data":{"status":"ok"}}`, listening on `127.0.0.1` only).
