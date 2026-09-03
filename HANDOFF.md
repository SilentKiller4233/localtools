# HANDOFF — read this first in any new session

_Last updated: 2026-09-03 ~22:45 PKT (UTC+05:00), end of session 7 — Phase 4 COMPLETE and CI FULLY GREEN (verify ubuntu+windows + compose-stack Docker acceptance), HEAD `f41b560`_

## Where things stand right now

**Phases 0–4 complete, CI fully green.** Phase 4 (PDF suite Group B) is DONE end-to-end: 6 engine endpoints in `@localtools/engine` behind the full Section 5 control set, 39/39 engine tests against the REAL native tools, client wired (engine-client + EngineRunnerPage + all 8 tool cards), and the Docker stack acceptance (Section 14.7: compose build → healthz → deep-compress round-trip through the containerized engine → client serves) PASSED as the new `compose-stack` CI job. Six fix-forward commits on top of `31c388e` (Phase 4 `233e444` + five CI fixes ending `f41b560`).

## Last thing done

Compose-stack CI saga resolved: five fix-forwards (tsconfig.base.json into BOTH Dockerfiles; shared-types dist in the runtime image; `pnpm deploy --prod --legacy` for a self-contained image — plain COPY of pnpm-workspace node_modules misses per-package symlinks, container died on `ERR_MODULE_NOT_FOUND 'fastify'`; runtime COPYs matching deploy's FLAT layout; in-container 0.0.0.0 bind via LOCALTOOLS_ENGINE_HOST with host-side loopback enforced by compose's 127.0.0.1:8787:8787 mapping). Run 33785873711: all three jobs green. TESTS.md Docker row → PASS. This HANDOFF rewrite is the session's final repo action.

## In-progress / uncommitted work

Verify before trusting: `git status` should show only this HANDOFF edit (or nothing if already committed as a docs commit). If CI on `233e444` shows the compose-stack job red, likely suspects in order: (1) `pip3 install --break-system-packages weasyprint` on node:22-bookworm-slim (bookworm needs the flag — it's there; if pip is missing install python3-pip is present), (2) LibreOffice apt package pull size/time (timeout-minutes: 30 on the job), (3) `docker compose up -d --wait` healthcheck timing. Everything else in the stack was validated locally as far as possible without Docker.

## Next immediate steps (in order — do these first)

1. CI is GREEN on `f41b560` (all three jobs: verify ubuntu + windows + compose-stack — the Docker stack acceptance PASSED, Section 14.7 PDF round trip through the containerized engine). Nothing to confirm; go straight to Phase 5.
2. **Phase 5 — Image suite (entirely Group A)**: all 14 tools from Section 3.3 (@jsquash/* converters, heic2any, exifr, tesseract.js, svgo, background-remover with the @imgly license re-check due AT THIS PHASE per D-006, palette k-means, favicon, screenshot annotator, meme, base64). Acceptance: 14.1/14.2 per tool + the EXIF-strip byte-level test (GPS actually gone from output bytes).
3. Wire image tools into the client ToolRunnerPage pattern (worker offload like pdf-core; new `image-core` package).

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
- **pnpm-workspace Docker images**: never COPY workspace node_modules directly — pnpm hoists per-package deps via symlinks that don't survive; use `pnpm --filter <pkg> --prod --legacy deploy /pruned` (v10 needs --legacy without inject-workspace-packages) and COPY from the deploy dir. The deploy layout is FLAT (package.json + dist/ + node_modules at the deploy root).
- **Compose "unhealthy" was a crash**: `docker compose up -d --wait` reports a dead container as unhealthy ~30s later; the ci.yml now always dumps `docker compose logs engine` (if: always()) — that's how the ERR_MODULE_NOT_FOUND was found. Add log-dump steps to any container CI on day one.
- **In-container bind must be 0.0.0.0** — a 127.0.0.1 bind inside a container namespace is unreachable through the published port. Section 5.1's loopback guarantee is enforced host-side by the 127.0.0.1:8787:8787 compose mapping; LOCALTOOLS_ENGINE_HOST controls the in-container bind.
- Prior sessions' pdf-lib/pdfjs/qpdf gotchas all remain valid (see pdf-document-processing skill + earlier HANDOFFs in git history).
