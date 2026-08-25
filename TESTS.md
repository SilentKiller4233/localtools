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
