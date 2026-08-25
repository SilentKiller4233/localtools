# DECISIONS.md

Every non-obvious decision made during the build, newest section at the bottom
within each phase. Spec-mandated notes required by PROJECT_SPEC Section 14.8
are marked **[required-by-CI]** as they accumulate across phases.

---

## Phase 0 — Repo scaffold

### D-001 — License: MIT for LocalTools itself

**[required-by-CI groundwork]**
MIT chosen for maximum simplicity and compatibility with the dependency set,
which is dominated by MIT/BSD/Apache-2.0 packages. AGPL components are invoked
strictly as subprocesses (never linked) so their licenses do not propagate into
this work:

- Ghostscript (AGPL-3.0/commercial dual) — deep compress/PDF-A/deep repair, subprocess only. Same boundary reasoning used by Stirling-PDF and OCRmyPDF's dependency chain.
- `@imgly/background-removal` (AGPL-3.0/commercial dual) — **decision deferred to Phase 5** per spec Section 4.3: license terms to be re-confirmed at implementation time, with the documented fallback being ONNX Runtime Web + a permissively licensed U2Net/MODNet model. If AGPL proves unacceptable for a browser-bundled asset, the fallback is used.
- ffmpeg — build variant decided in Phase 7 (LGPL-only build vs GPL static build); either way it is a separately executed binary, and the choice will be recorded here **[required-by-CI]**.
- RAR extraction-only constraint (bonus v1.1 tool, if built): RARLAB's `unrar` is freely redistributable for extraction only; creating `.rar` archives is license-restricted and will never be supported. Recorded now as forward constraint **[required-by-CI when built]**.
- LanguageTool (LGPL-2.1 core, bonus v1.1): introduces the stack's only JVM dependency; acceptable because it runs as a user-started local helper, not bundled runtime.

Third-party trademarks (iLovePDF etc.) appear in README only as descriptive
references to the category; no logos, no implied endorsement.

### D-002 — Stub server has minimal surface by design

The Phase 0 engine exposes exactly one endpoint (`GET /healthz`) and binds to
`127.0.0.1`. None of the Section 5 controls (auth token enforcement, magic-byte
validation, rate limits, SSRF guards) exist yet — they arrive with the phases
that introduce the corresponding endpoints (4/7/8). Consequence: **the Docker
engine port is published loopback-only in compose**, and exposing the engine
beyond localhost before those phases complete would be unsafe. This is stated
explicitly so mid-build state is never mistaken for the finished posture.

### D-003 — pnpm 10 + Node 22 LTS pinned

Node 22 (current LTS) and pnpm 10 pinned via `engines` + `packageManager`.
Matches the CI matrix and the Dockerfiles (`node:22-alpine`). System Node 25
exists locally but is not targeted — LTS maximizes compatibility with
node-gyp-dependent future deps (WASM/native builds).

### D-004 — Turbo 2.x `tasks` schema

Turborepo ≥2.0 uses the flat `tasks` key (not the legacy `pipeline`). All task
graphs (`build`, `typecheck`, `lint`, `test`) are defined once in root
`turbo.json`; packages declare only plain npm scripts.

### D-005 — Release workflow committed disabled (`if: false`)

`.github/workflows/release-desktop.yml` exists from Phase 0 as a guarded
placeholder so the trigger contract (`v*` tags) is visible early, but cannot
run until the real Tauri matrix replaces it in Phase 10. Prevents accidental
broken-release runs if someone tags prematurely.

### D-006 — SECURITY.md contact placeholder

No public contact address exists yet (repo unpublished). SECURITY.md directs
reporters to GitHub private security advisories; revisit when the repo goes
public or a domain exists.

### D-007 — Workspace packages export compiled `dist` output

Supersedes an earlier Phase 0 idea of exporting TS source directly. A runtime
check proved why: the engine runs under plain Node ESM, which resolves
workspace deps through normal `main`/`exports` fields — TS-source exports only
work under bundler/tsx loaders. All six packages therefore point at
`dist/index.js` (+ types), Turborepo orders consumer builds after dependency
builds (`^build`), and Vite consumes them without issue. Related: module
resolution is split per preset — `node.json` inherits NodeNext from the base
config (explicit `.js` extensions required in Node-run relative imports),
while `react.json` keeps Bundler resolution for Vite-resident browser code.

### D-008 — `tooling/` directory added alongside the spec tree

Spec Section 1's layout doesn't name shared-config packages; adding
`tooling/eslint-config`, `tooling/prettier-config`, `tooling/tsconfig` keeps
root config single-sourced without polluting `packages/` (which stays
product-facing). Conservative extension of the given structure, same pattern
Turborepo's own kitchen-sink uses.

### D-009 — `pnpm verify` composition at scaffold stage

`verify = format:check → lint → typecheck → build`. Test runners join this
chain from Phase 3 onward as suites gain real tests (Section 14 wiring happens
progressively; full automation finalizes in Phase 13).
