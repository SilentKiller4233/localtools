# ARCHITECTURE.md

LocalTools is three layers with two distribution targets, organized internally
into four suites. Authoritative spec: PROJECT_SPEC.md Sections 1–5.

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 3 — Distribution                                            │
│   Desktop app (Tauri, primary)   ·   Docker Compose (power users) │
├──────────────────────────────────────────────────────────────────┤
│ Layer 1 — Core app (shared by both targets)                       │
│   Vite + React + TS · all UI · every Group A tool (in-process/    │
│   WASM, no native helper, no network)                             │
├──────────────────────────────────────────────────────────────────┤
│ Layer 2 — Local processing engine (optional helper)               │
│   Fastify + TS on 127.0.0.1 · shells out to native CLI tools      │
│   (Group B) · yt-dlp for outbound downloads (Group C)             │
│   Tauri sidecar (desktop) or `engine` container (Docker)          │
└──────────────────────────────────────────────────────────────────┘
```

## Suites & processing groups

| Suite       | Nav section | Dominant group                                                |
| ----------- | ----------- | ------------------------------------------------------------- |
| PDF Tools   | `/pdf`      | Group A                                                       |
| Media Tools | `/media`    | C (downloader) + B (ffmpeg conversion) + A (small clips, STT) |
| Image Tools | `/image`    | Group A entirely                                              |
| Text & Dev  | `/devtext`  | Group A entirely                                              |

Group definitions (PROJECT_SPEC Section 3):

- **Group A** — in-process/WASM in the browser tab. No native helper, no network call, works offline.
- **Group B** — needs the local engine (Layer 2), operating only on user-provided local input; no third-party network calls.
- **Group C** — engine + outbound requests to sites the user pastes in (downloader only; extra Section 5.8 controls).

## Monorepo layout

pnpm workspaces + Turborepo; TypeScript strict everywhere in Layers 1–2.

```
apps/client     Layer 1 — UI + all Group A tool logic (via packages/*)
apps/engine     Layer 2 — Fastify API for Group B/C endpoints
apps/desktop    Tauri shell (Phase 10)
packages/*      pdf-core · media-core · image-core · devtext-core · ui · shared-types
tooling/*       shared eslint-config · prettier-config · tsconfig
docker/         client.Dockerfile · engine.Dockerfile · Caddyfile
```

## Security boundaries (summary)

Full requirements live in PROJECT_SPEC Section 5; implementation lands per
phase. Key structural facts:

1. **Layer 2 binds to loopback only** unless explicitly exposed (`LOCALTOOLS_EXPOSE=true` **and** a ≥32-char bearer token, enforced at boot).
2. **Subprocesses always take argument arrays** (`execFile`/`spawn`) — shell-string construction of commands is lint-blocked at the ESLint level.
3. **Downloader requests pass an SSRF guard first**: scheme allowlist, hostname resolution against private/loopback/link-local ranges (including cloud metadata `169.254.169.254`), re-checked on every redirect hop.
4. **No telemetry, no external CDNs** — the web target precaches everything needed offline except Group C's inherent network use.
