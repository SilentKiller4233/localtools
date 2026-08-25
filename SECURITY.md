# Security Policy

## Supported version

Only the latest tagged release is supported with security fixes.

## How to report

**Please do not report vulnerabilities in public issues.** Use GitHub's private
security advisory feature once this repo is published (a dedicated contact
address may replace this — tracked in DECISIONS.md D-006).

We aim to acknowledge reports within 72 hours and publish advisories after a
fix ships.

## Security model in one paragraph

LocalTools processes untrusted input locally: Group A tools run untrusted bytes
through WASM/in-process code in your browser, and the engine shells out to
native binaries (ffmpeg, yt-dlp, LibreOffice, …) on user-supplied files and
makes outbound requests on your behalf (downloader). The full control set is
specified in PROJECT_SPEC Section 5: loopback-only binding by default,
bearer-token gating plus explicit opt-in before any exposure beyond localhost,
magic-byte upload validation, per-request temp directories with guaranteed
cleanup, arg-array subprocess execution (never shell interpolation), and a full
SSRF-prevention set on the downloader (scheme allowlist, private/link-local IP
blocking including redirect hops, output size caps, sandboxed yt-dlp flags).

Those controls land phase by phase. The Phase 0 stub engine exposes only
`/healthz`, binds to `127.0.0.1` only, and implements none of the deeper
controls yet — that is expected mid-build state, recorded in DECISIONS.md
D-002, and is why the engine must not be exposed past localhost until its
phase's security criteria are verified.

## Scope notes

- The downloader (Group C) never becomes a generic URL proxy (Section 5.8): unsupported sites get a clear error, never a raw-fetch fallback.
- DRM circumvention / login-bypass / paywall-bypass features will not be built (Section 6).
