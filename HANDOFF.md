# HANDOFF — read this first in any new session

_Last updated: 2026-09-03 ~21:40 PKT (UTC+05:00), end of session 7 — Phase 4 COMPLETE (PDF Group B engine, 39/39 tests), pushed as `233e444`; CI status to confirm on open_

## Where things stand right now

**Phases 0–4 complete.** Phase 4 (PDF suite Group B) is DONE: all 6 engine endpoints live in `@localtools/engine` behind the full Section 5 control set, 39/39 engine tests passing against the REAL installed native tools, client wired via `engine-client.ts` + `EngineRunnerPage` + real pages for all 8 Group B tool cards. `pnpm verify` fully green (165 pdf-core + 39 engine tests + builds). Committed as `233e444` and pushed on top of `31c388e`.

## Last thing done

Phase 4 commit `233e444` pushed to origin/main (51 files). CI is running — the `verify` matrix should pass (it's the same command that ran green locally); **the new `compose-stack` job runs for the FIRST TIME** (Docker build of the engine image + healthz gate + deep-compress round-trip through the container). If it fails, fix-forward on a new commit — do not amend. This HANDOFF rewrite is the session's final repo action.

## In-progress / uncommitted work

Verify before trusting: `git status` should show only this HANDOFF edit (or nothing if already committed as a docs commit). If CI on `233e444` shows the compose-stack job red, likely suspects in order: (1) `pip3 install --break-system-packages weasyprint` on node:22-bookworm-slim (bookworm needs the flag — it's there; if pip is missing install python3-pip is present), (2) LibreOffice apt package pull size/time (timeout-minutes: 30 on the job), (3) `docker compose up -d --wait` healthcheck timing. Everything else in the stack was validated locally as far as possible without Docker.

## Next immediate steps (in order — do these first)

1. Confirm CI green on the latest push (`gh run list --limit 1`; repo SilentKiller4233/localtools). The compose-stack job went through 4 fix-forward rounds this session: (a) engine image missing `tsconfig.base.json`, (b) CLIENT image missing it too — the failure was shared-types building inside the client image, (c) engine runtime stage missing `packages/shared-types/dist`, (d) plain COPY of workspace `node_modules` misses pnpm's per-package symlinks → container booted into `ERR_MODULE_NOT_FOUND 'fastify'` → now uses `pnpm --filter @localtools/engine --prod deploy /pruned` and copies from /pruned. If STILL red: `gh run view --log` → the job now always dumps `docker compose logs engine` (diagnostics step) — read those first.
2. If compose-stack passes, the Docker stack acceptance (Section 14.7 PDF round trip) is done; update TESTS.md's `Docker stack round trip` row from `pending push` to `PASS` and commit with any other leftovers.
3. **Phase 5 — Image suite (entirely Group A)**: all 14 tools from Section 3.3 (@jsquash/* converters, heic2any, exifr, tesseract.js, svgo, background-remover with the @imgly license re-check due AT THIS PHASE per D-006, palette k-means, favicon, screenshot annotator, meme, base64). Acceptance: 14.1/14.2 per tool + the EXIF-strip byte-level test (GPS actually gone from output bytes).
4. Wire image tools into the client ToolRunnerPage pattern (worker offload like pdf-core; new `image-core` package).

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- Classic PAT (repo+workflow scopes) transited chat ~5 sessions ago — rotate before Phase 15's public flip.
- Context7 MCP still NOT connected — verify version-sensitive APIs from installed `.d.ts`/source (this is how D-014/D-015 were done).
- @imgly/background-removal license re-check is due AT Phase 5 start (D-006 deferral); if unacceptable, fall back to ONNX Runtime Web + U2Net per spec.
- Composio GitHub integration still unused (plain git+PAT works); note the deviation if it persists.
- Discord webhook confirmed WORKING by the user this session — ping at session end is expected going forward.

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — always quote). Windows 11, bash (MSYS). pnpm 10.34.5, Node 22.
- **Native tools installed this session (dev host)**: Ghostscript 10.07.1 → repo-local `gs10.07.1/` (installer extracted to cwd — gitignored); Tesseract 5.4.0 → `C:\Program Files\Tesseract-OCR\` (+eng tessdata); LibreOffice 26.8.0.3 → `C:\Program Files\LibreOffice\` (use `soffice.com`, NOT `soffice.exe`); GTK3 runtime → repo-local `GTK3-Runtime Win64/` (gitignored; installed elevated with `/VERYSILENT` — the user approved UAC); WeasyPrint 69.0 → pip-installed in the Hermes venv python (`py` finds it; bare `python` on PATH resolves to a uv python WITHOUT it).
- `gs10.07.1/` + `GTK3-Runtime Win64/` are gitignored (`gs10.*/` + `GTK3-Runtime*/`) — never commit them.
- Engine tool-path resolution derives the repo root from `import.meta.url` (works under vitest/turbo where cwd ≠ repo root).
- Engine tsconfigs split: `tsconfig.json` (src+test, noEmit) vs `tsconfig.build.json` (src→dist) — same pattern as pdf-core. Client consumes shared-types' `dist/` — **rebuild `@localtools/shared-types` after changing its src before client typecheck**.
- Turbo caches `test` aggressively — `pnpm test --force` to prove tests ran.
- pnpm filter builds: `pnpm --filter @localtools/engine... build`.

## Useful context / gotchas discovered this session

- **LibreOffice PDF import is Draw by default** — from-PDF conversions MUST pin `--infilter=writer_pdf_import` (Word) / `impress_pdf_import` (PowerPoint) AND use the explicit OOXML export filter (`docx:MS Word 2007 XML`, `pptx:Impress MS PowerPoint 2007 XML`); bare `docx` or `writer8` exports produce INVALID renamed-ODF files (test's odg sniff catches this). **PDF→Excel is impossible on stock LibreOffice** (pdfimport.xcd only has draw/impress/writer imports) — the engine rejects it with a clear error. Every soffice invocation gets an isolated profile via `-env:UserInstallation` (file:// URL into the request temp dir) to dodge the single-instance profile lock.
- **WeasyPrint on Windows**: PATH alone is NOT enough for GTK — cffi's libgobject dlopen fails 0x7e on transitive deps; `os.add_dll_directory()` is required. The engine spawns `apps/engine/scripts/weasyprint-launcher.py` (does the add_dll_directory + runs weasyprint's CLI main) via the Windows `py` launcher. Page size/margins go through a per-request `@page { size; margin }` user stylesheet passed with `-s` (the CLI's `-s` is STYLESHEETS, not page size).
- **Fastify plugins are encapsulated by default** — hooks registered inside a plain plugin NEVER fire on root routes. Wrap with `fastify-plugin` (headers/auth both hit this; tests caught it as missing CSP headers + auth never rejecting).
- **@fastify/multipart with attachFieldsToBody: true** wraps text fields as `{ value, type: 'field' }` — extract `.value` before JSON.parse. Its stream-level fileSize rejection throws a Fastify error that must be mapped to our JSON envelope via setErrorHandler.
- **Python-based str.replace file edits silently fail on CRLF files** (this session's recurring trap — several "applied" patches weren't). Use the `patch` tool, then verify with a grep before trusting.
- `body.error.code` assertions in tests: check for `undefined` guards — the multipart Fastify error shape has no envelope until setErrorHandler maps it.
- LibreOffice's first conversion after boot takes ~10s (cold profile) — engine testTimeout is 60s; the 429 test polls `/healthz` (`busy` counter) for determinism instead of fixed sleeps.
- `py` on this host = `C:\Users\mshah\AppData\Local\Programs\Python\Launcher\py.EXE`; `python` = uv cpython 3.11 (no weasyprint). LOCALTOOLS_PYTHON_PATH override exists if needed.
- Engine `/healthz` now returns `{ status, busy, capacity }` — busy = current subprocess count (used by tests; safe to expose, no names).
- Prior sessions' pdf-lib/pdfjs/qpdf gotchas all remain valid (see pdf-document-processing skill + earlier HANDOFFs in git history).
