# LocalTools

Self-hosted, open-source, privacy-first alternative to the paywalled/rate-limited
"free tool" websites — iLovePDF, social media downloaders, image converters,
JSON formatters, and their whole category. Every tool those sites gate is free
and unlimited here.

**Status:** 14 of 15 phases complete — pre-release, actively built (see [`SUMMARY.md`](SUMMARY.md)).

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

## Desktop app (Tauri) — install & first run

The desktop build wraps the same web client in a native window and runs the
processing engine as a local, loopback-only background process — no terminal
needed for anything below.

**First launch after install — per-OS "unsigned app" bypass (one time):**

The installers are not yet code-signed (signing is a Phase 15 item), so each OS
shows a one-time warning on first launch. These are the exact steps to get
past each one:

- **Windows:** the installer or app may trigger Microsoft Defender
  SmartScreen — "Windows protected your PC". Click **More info**, then
  **Run anyway**. This appears once; the app then launches normally.
- **macOS:** Gatekeeper blocks apps from unidentified developers. In Finder,
  **right-click (or Control-click) the app → Open → Open** in the dialog
  ("LocalTools" can't be verified…). Alternatively System Settings →
  Privacy & Security → **Open Anyway**. Once opened this way, subsequent
  launches are normal.
- **Linux (AppImage):** AppImages need the executable bit — in your file
  manager, right-click the AppImage → Properties → Permissions → check
  "Allow executing file as program", or in a terminal `chmod +x
LocalTools_*.AppImage` (a one-time step, not a security warning).

**On first use of a tool that needs a native helper** (video download,
PDF↔Office conversion, deep compression, OCR, media conversion,
text-to-speech…), the app shows a friendly one-time prompt like
_"Downloading videos needs yt-dlp — a small one-time download (~30MB) that
keeps working offline afterwards."_ Downloads are URL-pinned and
SHA-256-verified, cached in the app's local data directory, and never need
re-downloading. Everything else keeps working while a download runs, and a
failed download can always be retried.

If you skip or lose a download, just run the tool again — the prompt comes
back. In Docker deployments the same helpers ship inside the engine image
instead.

## Performance & size (Section 14.5 — Phase 14 record)

Measured on the production client build (`vite preview`, Lighthouse 13.4.1,
system Chrome headless; three consecutive runs, identical scores):

| Metric                                 | Phase 2 baseline | Phase 14 (current, 97 tools) | Budget / rule                                                         |
| -------------------------------------- | ---------------- | ---------------------------- | --------------------------------------------------------------------- |
| Lighthouse Performance                 | 82               | **79**                       | no >10-point regression (spec 14.5) — 3-point delta, within tolerance |
| Lighthouse Accessibility               | 100              | 100                          | —                                                                     |
| Lighthouse Best Practices              | 100              | 100                          | —                                                                     |
| Lighthouse SEO                         | 91               | 91                           | —                                                                     |
| Initial JS+CSS (gzipped)               | 63.9KB           | **121.60KB**                 | 250KB budget (CI-gated, fails the build)                              |
| Main-thread long tasks, 50MB PDF merge | —                | **0 tasks / 0ms**            | worker-offload check (CI-gated)                                       |

Notes on the 3-point performance delta: with 90+ more tools and the full
worker/bridge plumbing landed since Phase 2, the initial bundle roughly
doubled (still less than half the budget) and TBT stayed at 0ms / CLS 0.
The measured LCP (~3.9s) is dominated by headless-Chrome font-render
overhead on the dev host (server-response 0ms, network RTT 0ms,
main-thread 0.7s) — not app work. The number is recorded honestly; the
gate that matters (bundle size + worker offload) is automated in CI.

**Docker engine image size (Section 11):** the image is intentionally
heavy — it bundles Node 22 slim plus Ghostscript, Tesseract (+eng data),
LibreOffice, ffmpeg, WeasyPrint, pinned yt-dlp 2026.08.19, and Piper
(with SHA-verified voices fetched lazily at runtime). Stripping the npm
CLI from the runtime image (the Trivy-driven fix) cut it by ~80MB and
removed 1 CRITICAL + 10 HIGH CVEs from npm's own tree. The exact final
size is printed by the CI compose-stack job (`docker images` step) —
record it here from the next green CI run. A `docker-compose.slim.yml`
variant without the Media suite's native tools is a v1.1 nice-to-have
per the spec.

## Roadmap

15 phases per PROJECT_SPEC Section 15, from scaffold through v1.0.0 release.
Current status lives in SUMMARY.md. Noted as possible **v2 ideas**: PDF→EPUB,
vocal/stem separation (both deliberately out of scope for v1 per Section 7);
ffmpeg.wasm in-browser small-clip processing (cut from v1.0.0 scope — see
DECISIONS.md D-044).
