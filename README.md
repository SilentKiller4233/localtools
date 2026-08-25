# LocalTools

Self-hosted, open-source, privacy-first alternative to the paywalled/rate-limited
"free tool" websites — iLovePDF, social media downloaders, image converters,
JSON formatters, and their whole category. Every tool those sites gate is free
and unlimited here.

**Status:** early scaffold (Phase 0 of 15 — see [`SUMMARY.md`](SUMMARY.md)).

## Why this exists

Every tool in this repo runs on your machine. Files processed by Group A tools
never leave it; Group B uses a local helper; only the Media downloader makes
outbound requests, and then only via yt-dlp to sites you paste in. No telemetry,
no analytics, no third-party CDNs. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
three-layer architecture and the Group A/B/C definitions.

## Status & continuity docs

- [`SUMMARY.md`](SUMMARY.md) — current project state ("catch me up" document)
- [`HANDOFF.md`](HANDOFF.md) — exact resume point for the next work session
- [`DECISIONS.md`](DECISIONS.md) — every non-obvious call and its reasoning
- [`TESTS.md`](TESTS.md) — automated + manual test log

## Quick start (development)

Prerequisites: Node.js ≥ 22, pnpm ≥ 10 (`corepack enable` or `npm i -g pnpm`).

```bash
pnpm install
pnpm dev        # client at http://localhost:5173 · engine API at 127.0.0.1:8787/healthz
pnpm build      # build all workspaces
pnpm verify     # format + lint + typecheck + build gate
```

## Docker quick start

```bash
cp .env.example .env   # defaults are safe: loopback-only engine binding
docker compose up --build
# client → http://localhost:5173 · engine → 127.0.0.1:8787/healthz
```

The engine binds to loopback only. Exposing beyond localhost requires both
`LOCALTOOLS_EXPOSE=true` and a ≥32-char `LOCALTOOLS_AUTH_TOKEN`, enforced at boot
(Section 5.1). See [.env.example](.env.example).

## Roadmap

15 phases per PROJECT_SPEC Section 15, from scaffold through v1.0.0 release.
Current status lives in SUMMARY.md. Noted as possible **v2 ideas**: PDF→EPUB,
vocal/stem separation (both deliberately out of scope for v1 per Section 7).
