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

### D-010 — Repository is PRIVATE during the build (user decision)

The spec's Definition of Done assumes a public repo at v1.0.0 ("The repo is
public", Section 0.3), and the repo was created public accordingly. The user
then directed it be made private for now (2026-08-25); visibility will be
flipped back to public as part of Phase 15 (tag/release step). Consequences:

- Supply-chain scanning does not depend on visibility: Trivy/Grype in CI (Sections 5.4/5.5) remains the control; Dependabot security updates were left disabled either way.
- No code may assume public artifacts (no external CDN/raw-file links — consistent with Section 5.7 regardless).
- Flip back to public is part of Phase 15's release checklist.

Operational note discovered while applying: Composio's repository-update call
resets unset fields to API defaults — e.g. `delete_branch_on_merge` reverted
to `false` after being set `true` at creation, and `has_projects` flipped to
`true`. Re-apply desired settings explicitly after any future update call.

---

## Phase 1 — Design direction

### D-011 — Stitch direction translated to tokens; delivery details

The Phase 1 visual direction was generated via Stitch MCP **before** any
component code (Section 9 mandate): one design system (`assets/5698721899487494889`)
and six screens (home suite-nav + tool grid, Merge PDF, Universal Downloader,
Image Converter, JSON Formatter, drop-zone component sheet). The generated
HTML is archived verbatim under `packages/ui/stitch-reference/` as the design
source of truth (excluded from Prettier).

Implementation decisions on top of it:

- **Token namespace:** every custom property is prefixed `--lt-*` and defined
  once in `packages/ui/src/tokens.css` (light canonical, dark override via
  `[data-theme='dark']`). Stitch generated light-only output; the dark theme
  is hand-derived per Section 8 with a contrast-adjusted accent (`#1f6feb`)
  to hold WCAG AA against white text.
- **Fonts not yet vendored:** Inter + JetBrains Mono are named in the token
  stacks with system-font fallbacks; self-hosting is tracked in
  `packages/ui/fonts/README.md` and must land before release (Section 7,
  no third-party CDNs). No CDN reference exists anywhere today.
- **CSS delivery:** component TSX imports no CSS. tsc-compiled `dist/` cannot
  resolve relative `.css` imports (they are emitted verbatim), so the package
  exposes a single stylesheet entry consumed as
  `import '@localtools/ui/styles.css'`, which Vite resolves at app build time.
- **Icons:** Lucide is the chosen set (Section 7) but is wired in Phase 2
  alongside real routing; Phase 1 components accept inline glyph nodes.
- **Theme contract verified end-to-end** on the production build:
  `prefers-color-scheme` bootstrap → manual toggle writes `data-theme` +
  localStorage → restore across reload, both directions.

---

## Phase 2 — Client shell

### D-012 — Phase 2 acceptance reinterpretation; media-phase assignment; puppeteer-core devDep

Three Phase 2 calls, recorded together:

- **"Lighthouse PWA ≥90" is unsatisfiable as written.** Lighthouse 12 removed
  the PWA category entirely (upstream change; no PWA score is produced at all).
  Rather than pinning an old Lighthouse major just to keep scoring a category
  the tool abandoned, the acceptance is reinterpreted to its substance: Chrome
  installability prerequisites hold (valid manifest + versioned service worker
  that registers and controls + full icon set, all served same-origin), and a
  controlled offline-reload test demonstrates the actual requirement
  ("offline reload works") end-to-end — puppeteer warmup confirms
  `serviceWorker controlling:true`, the server is killed and verified down,
  then a reload renders the Media suite (h1 + all 18 tool cards) purely from
  the SW cache (`scripts/offline-test.mjs`, logged in TESTS.md). Performance
  tuning remains deferred to Phase 14 per spec phase order; the Phase 2 run's
  scores (perf 82 / a11y 100 / BP 100 / SEO 91) are recorded in TESTS.md as
  the regression baseline.
- **Piper TTS + PDF→audiobook assigned to Phase 9.** Section 15 lists no
  explicit phase for the Media suite's Group B text-to-speech tools (Section
  3.2). Conservative choice: they ride with the media speech phase (Phase 9),
  whose lazy-download model-caching infrastructure they share; encoded in
  `apps/client/src/lib/tool-registry.ts` `PHASE_OVERRIDES` and surfaced by the
  tool grid badges now, so the UI never promises a tool before its phase.
- **`puppeteer-core` (not `puppeteer`) is a devDependency of `apps/client`.**
  It exists solely to drive the offline-reload acceptance script against the
  system Chrome executable; `puppeteer-core` ships no browser download (that
  would add ~300MB to every CI install for a tool the app itself never uses at
  runtime), and the script resolves the local Chrome path explicitly. It is
  dev-only, never imported by app code, and can be dropped once Phase 13 wires
  PWA/offline checks into `pnpm verify` proper (or kept there for the same
  purpose).
