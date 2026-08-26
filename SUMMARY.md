# LocalTools — Project Summary

_Last updated: 2026-08-26, after Phase 1 — Design direction_

## What this project is

LocalTools is an open-source, self-hosted, privacy-first alternative to the whole category of rate-limited/paywalled/ad-choked "free tool" websites (iLovePDF-style PDF tools, social media downloaders, image converters, JSON formatters). It ships as a one-click desktop app (Tauri) and a Docker Compose stack, and every tool is free and unlimited.

## Current status

- Phases complete: 1 of 15 (Section 15)
- PDF suite: not started (design direction done — Merge PDF screen generated)
- Media suite: not started (design direction done — Universal Downloader screen generated)
- Image suite: not started (design direction done — Image Converter screen generated)
- Text & Dev suite: not started (design direction done — JSON Formatter screen generated)
- Desktop app (Tauri): not started (placeholder `apps/desktop/README.md` only)
- Docker Compose target: compose file + both Dockerfiles scaffolded with hardened defaults; images **not yet built/run**
- Test suite (`pnpm verify`): passing (format + lint + typecheck + build across 8 workspaces); functional tests arrive from Phase 3 onward

## What has been built so far

**Phase 0 — repo scaffold**

- pnpm workspaces (`apps/*`, `packages/*`) + Turborepo 2.x monorepo; strict TS baseline via `tooling/tsconfig` presets; shared ESLint/Prettier configs
- Stub apps that build clean: `apps/client` (Vite 6 + React 18), `apps/engine` (Fastify 5, `/healthz`, loopback-only)
- Six workspace packages wired: `pdf-core`, `media-core`, `image-core`, `devtext-core`, `ui`, `shared-types`
- Hardened Docker placeholders, CI workflow (verify matrix ubuntu+windows + compose-validate), repo hygiene files, docs seeded (D-001…D-009)

**Phase 1 — design direction**

- Stitch MCP pass executed **before** any component code (Section 9 mandate): design system `assets/5698721899487494889` + six screens (home suite-nav/tool grid, Merge PDF, Universal Downloader, Image Converter, JSON Formatter, drop-zone states sheet); generated HTML archived verbatim in `packages/ui/stitch-reference/`
- Design tokens in `packages/ui/src/tokens.css`: full light theme + hand-derived dark theme (`--lt-*` namespace, strict type scale, 4px spacing scale, radii, motion, semantic status colors)
- Base components in `packages/ui`: Button (4 variants), Badge (7 tones incl. Instant/One-time setup), Card + ToolCard, Field/Input, DropZone (default/drag-over/uploading/error/compact states, keyboard-operable), ProgressBar, SuiteNav (wordmark + four segmented suite tabs + trailing slot), ThemeToggle
- Client wiring: theme bootstrap (`prefers-color-scheme` default, persisted manual override), minimal hash routing, `/dev/ui-preview` page rendering every component in **both** themes incl. suite-nav (Phase 1 acceptance criterion, verified live on the production build)
- Fonts: Inter/JetBrains Mono named in token stacks with system fallbacks; self-hosting checklist in `packages/ui/fonts/README.md`

## What's left

- Phase 2 — client shell: routing, suite nav, filterable tool grids for all Section 3 tools, PWA manifest/service worker (Lighthouse PWA ≥90); wire Lucide icon set; vendor the two webfonts
- Phase 3 — PDF Group A tools + tests (Sections 14.1–14.3 incl. redaction content-removal test)
- Phase 4 — PDF Group B endpoints behind Section 5 controls (Docker target)
- Phase 5 — Image suite (all Group A) + EXIF-stripping byte-level test
- Phase 6 — Text & Dev suite (all Group A)
- Phase 7 — Media conversion (ffmpeg Group B) + ffprobe sanity checks
- Phase 8 — Media downloader (Group C) with full Section 5.8 SSRF set from the start
- Phase 9 — Speech-to-text (whisper.cpp WASM) + auto-captions
- Phase 10 — Tauri desktop shell + sidecar + lazy downloads
- Phase 11 — integration polish · Phase 12 — accessibility/responsiveness · Phase 13 — test/CI finalization · Phase 14 — performance/size · Phase 15 — docs & v1.0.0 release (incl. flipping the repo back to public per D-010)

## Key architectural decisions made so far

All detailed in [DECISIONS.md](DECISIONS.md): MIT license with subprocess-boundary reasoning for AGPL deps (D-001); loopback-only stub engine until security phases land (D-002); Node 22 LTS + pnpm 10 pinned (D-003); Turbo 2 `tasks` schema (D-004); release workflow disabled until Phase 10 (D-005); compiled-dist exports across workspace packages (D-007); `tooling/` shared configs (D-008); repo private during build, public flip in Phase 15 (D-010); Stitch-derived token system, CSS delivery via single stylesheet entry, dark-theme derivation, font vendoring deferred with tracked checklist (D-011).

## Known issues / tech debt

- Inter/JetBrains Mono are not yet vendored (system-font fallbacks active); must land before release — see `packages/ui/fonts/README.md`.
- Lucide icons not yet wired; Phase 1 components use inline glyph placeholders.
- Engine has zero Section 5 controls yet (by design until Phases 4/7/8; see D-002) — never expose past localhost.
- `apps/desktop` contains no code yet (README placeholder only).
- CI is green on `main`; workflow remains untested against PRs/tags until later phases exercise them.

## How to run the project right now

```bash
pnpm install          # pnpm-lock.yaml is committed
pnpm dev              # client → http://localhost:5173 ; engine health → http://127.0.0.1:8787/healthz
pnpm build            # all workspaces
pnpm verify           # format + lint + typecheck + build gate
# Phase 1 acceptance surface: http://localhost:5173/dev/ui-preview (both themes, suite-nav)
```

No tools are functional yet beyond the shells — tool grids arrive in Phase 2. If the dev server serves stale `@localtools/ui` output after a package rebuild, restart it (Vite's dep-optimize cache doesn't always invalidate workspace deps; deleting `apps/client/node_modules/.vite` also works).
