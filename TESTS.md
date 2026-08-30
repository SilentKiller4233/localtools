# TESTS.md — verification log

Living record of automated coverage and `[manual]` checks per PROJECT_SPEC
Section 14. Automated tests run via `pnpm verify` (grows through Phase 13);
manual items are logged here as they are performed, never assumed done.

## Status: Phase 0

| Check                                                | Kind                    | Result             | Notes                                                                                                    |
| ---------------------------------------------------- | ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `pnpm install && pnpm build` succeeds with stub apps | automated (local)       | PASS               | Acceptance criterion for Phase 0                                                                         |
| Prettier format check                                | automated (local)       | PASS               | Part of `pnpm verify`                                                                                    |
| ESLint (strictTypeChecked) across workspaces         | automated (local)       | PASS               | Part of `pnpm verify`                                                                                    |
| TypeScript strict typecheck (all workspaces)         | automated (local)       | PASS               | `noUncheckedIndexedAccess` etc. enabled                                                                  |
| Engine `/healthz` runtime smoke test                 | manual (local, one-off) | PASS               | HTTP 200 `{"ok":true,"data":{"status":"ok"}}`; netstat confirmed listener bound to `127.0.0.1:8787` only |
| CI workflow syntax valid                             | automated (push)        | pending first push | ci.yml runs verify on ubuntu+windows                                                                     |

## Status: Phase 2

Phase 2 acceptance (Section 15): "Lighthouse PWA ≥90; offline reload works."
**Lighthouse 12 removed the PWA category entirely** — the "PWA ≥90" half of the
acceptance is unsatisfiable as written. The honest equivalents (Chrome
installability via valid manifest/SW/icons + a demonstrated offline reload)
were executed instead; rationale recorded as D-012. Performance tuning is
deferred to Phase 14 per spec phase order.

| Check                                                      | Kind              | Result | Notes                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ----------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify` (format + lint + typecheck + build, 8 tasks) | automated (local) | PASS   | Full Phase 2 tree                                                                                                                                                                                                                                                      |
| Bundle size (Section 8 budget 250KB gzipped)               | automated (local) | PASS   | 63.9KB gzipped initial JS — well under budget                                                                                                                                                                                                                          |
| Route + PWA asset smoke on prod build                      | manual (local)    | PASS   | All suite/tool routes + `manifest.webmanifest` / `sw.js` / icons serve HTTP 200 on `vite preview`                                                                                                                                                                      |
| Lighthouse 12 (real run against prod build)                | manual (local)    | PASS   | **perf 82 / a11y 100 / best-practices 100 / SEO 91**; no PWA category exists in Lighthouse 12 (removed upstream); perf tuning belongs to Phase 14                                                                                                                      |
| Offline reload (Section 8)                                 | manual (local)    | PASS   | `scripts/offline-test.mjs` (puppeteer-core + system Chrome): warmup pass confirmed `serviceWorker controlling:true` → server killed and verified down (curl connect refused) → reload rendered `h1="Media Tools"` + 18 tool cards from cache → **OFFLINE_RELOAD_PASS** |
| Chrome installability prerequisites                        | manual (local)    | PASS   | Manifest + versioned SW + icon set (SVG + PNGs) served; SW registers and controls the page on first load                                                                                                                                                               |

## Pending (scheduled by later phases)

- Per-tool functional tests — Phases 3–9 (Section 14.1/14.2)
- Redaction content-removal test — Phase 3 (Section 14.3)
- Security regression suite incl. Group C SSRF set — Phases 4/7/8 (Section 14.4)
- Performance/bundle-size/Lighthouse — Phases 2 & 14 (Section 14.5)
- axe-core accessibility scans — Phase 12 (Section 14.6)
- Docker round-trip + desktop smoke test — Phases 10–13 (Section 14.7)
- Licensing-docs CI grep — Phase 13 (Section 14.8)

## Manual log

(no manual checks performed yet)
