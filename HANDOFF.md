# HANDOFF — read this first in any new session

_Last updated: 2026-08-30 19:55 PKT (UTC+05:00), end of session 4 — Phase 2 committed, pushed, CI green_

## Where things stand right now

**Phases 0–2 of PROJECT_SPEC Section 15 are complete, committed, pushed, and CI-green** on `main`. HEAD after Phase 2 commit: `be2d5c7` (`feat(client): Phase 2 — client shell, tool registry, PWA`); CI run 33318482555 succeeded (compose-validate + verify on ubuntu and windows). Phase 2 acceptance verified last session and logged in TESTS.md: Lighthouse 12 real run (perf 82 / a11y 100 / BP 100 / SEO 91; PWA category no longer exists upstream — reinterpretation recorded as D-012) plus a controlled offline-reload PASS (server killed → reload rendered `h1="Media Tools"` + 18 cards purely from the service-worker cache). **Next: Phase 3 — PDF suite Group A tools** (first functional-tool phase).

## Last thing done

This session closed out Phase 2 (code was built/verified last session but left uncommitted at the tool-call ceiling): removed the accidental `lucide-react` dep from `packages/ui` (lockfile re-synced; `apps/client` keeps it), appended the Phase 2 section to TESTS.md, recorded DECISIONS.md D-012 (Lighthouse-PWA reinterpretation; TTS/PDF→audiobook → Phase 9 via `PHASE_OVERRIDES`; puppeteer-core devDep rationale), ran `pnpm verify` green 8/8 (bundle 63.9KB gzipped), committed `be2d5c7` (26 files), pushed, confirmed CI green, updated SUMMARY.md to "2 of 15".

## In-progress / uncommitted work

None, working tree is clean after this session's final docs commit (SUMMARY.md + this HANDOFF.md rewrite). All Phase 2 work is inside `be2d5c7`; the docs closeout is the last commit on `main`.

## Next immediate steps (in order — do these first)

1. **Phase 3 kickoff:** implement the PDF suite's 21 Group A tools (Section 3.1) in `packages/pdf-core` using `pdf-lib` / `pdfjs-dist` / `@neslinesli93/qpdf-wasm` (add as deps of `pdf-core`; pull current docs via Context7 for `pdfjs-dist`'s worker setup and qpdf-wasm's `callMain` format — both are easy to misremember).
2. Start with the foundational four (Merge, Split by range/every-N/by-size, Extract pages, Rotate) so the per-tool page pattern (real drop zone → options → progress → human-readable errors, per Section 9) replaces the ToolPage placeholder for real tools; add per-tool routes as suites gain function.
3. Wire the Section 14.1/14.2 test harness: shared PDF fixtures (`simple-text.pdf`, `malformed.pdf`, `zero-page.pdf`, `password-protected.pdf`, `oversized.pdf`, …), happy-path + malformed/empty/oversized paths per tool; join the test chain into `pnpm verify` (D-009 anticipated this).
4. Section 14.3 redaction test (content-stream level, not overlay) must land with the Redact tool — treat it as part of that tool's definition of done, plus the 50MB no-main-thread-blocking worker check.
5. Keep `pnpm verify` green throughout; update SUMMARY.md at phase end; HANDOFF.md last. Commit: `feat(pdf): Phase 3 — PDF suite Group A tools`.

## Blockers / open decisions needing human input

None blocking. Non-blocking:

- Classic PAT used for pushes (`repo`+`workflow` scopes) transited chat two sessions ago — **rotate it** at github.com/settings/tokens when convenient (before Phase 15's public flip at the latest). After rotating, update `~/.git-credentials` and `%APPDATA%/GitHub CLI/hosts.yml` (both hold it; see session-1 gotchas for the eviction path).
- Deferred decisions unchanged: @imgly/background-removal license re-check (Phase 5, D-001); ffmpeg build variant (Phase 7, D-001); SECURITY.md contact address (D-006).

## Environment / local state notes

- Working dir: `D:\random projects vibecoded\QOL tools` (spaces — always quote). Windows host, bash (MSYS). Node v22 targeted, pnpm 10.34.5.
- Git auth: classic PAT in both `~/.git-credentials` and gh's hosts.yml; push works over HTTPS. Repo stays PRIVATE until Phase 15 (D-010).
- Ports 4173/5173/8787 all free (verified this session; no orphaned preview servers).
- Chrome for puppeteer-core scripts: `C:/Program Files/Google/Chrome/Application/chrome.exe` (offline-test.mjs auto-resolves it).
- The puppeteer PWA test profile lives at `%LOCALAPPDATA%/Temp/localtools-pwa-profile` — safe to delete if a future offline test behaves oddly (stale SW registration).
- `packages/ui` ships one stylesheet entry (`import '@localtools/ui/styles.css'`), zero CSS imports in TSX (tsc limitation, D-011).

## Useful context / gotchas discovered this session

- **Prettier check covers the root .md docs** — a plain-prose HANDOFF/TESTS/DECISIONS edit will fail `pnpm verify`'s format gate until `pnpm exec prettier --write <file>` is run. Budget one extra verify cycle for any docs-heavy session (hit this today).
- `pnpm --filter <pkg> add` installs into exactly that package — verify the target before running (this is how lucide-react landed in `packages/ui` last session).
- Prettier formats the registry's long tuple arrays; after prettier --write on `tool-registry.ts`, entries collapse to one line each — harmless, just noisy diffs.
- Tool registry shape: `[id, group, icon]` tuples in per-suite arrays (`PDF_GROUP_A`, `PDF_GROUP_B`, `MEDIA_TOOLS`, `IMAGE_TOOLS`, `DEVTEXT_TOOLS`); display strings in `apps/client/src/i18n/en.json` (97 tool keys); `PHASE_OVERRIDES` maps unlisted tools (TTS, audiobook → 9). Grep with `\['<id>', '(a|b|c)',` to find entries.
- Orphaned vite previews survive wrapper kills — free the port by PID: `netstat -ano` → `MSYS_NO_PATHCONV=1 taskkill /F /PID <pid>` (single slashes, `/F` not `//F`).
- `gh run view <id> --json status,conclusion` is the fast CI check; `gh run list --branch main --limit 3` for the run id right after a push (~20s trigger delay).
- Preview-pane element tracker (drive_preview) can wedge after interactions; `desktop_preview read` text dumps stay reliable.
- Prior sessions' gotchas still apply and are worth re-reading in git history (`docs: close out Phase 1 session`): gh CLI token validation quirks, Vite dep-optimize staleness, strict-TS lint traps (`no-confusing-void-expression`, `restrict-template-expressions`, `exactOptionalPropertyTypes`).
