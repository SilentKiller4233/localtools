# Shared TypeScript configs

Extends [`tsconfig.base.json`](../../../tsconfig.base.json), which carries the
strict-mode baseline required by PROJECT_SPEC Section 1 (`strict: true`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.).

- `base.json` — inherits everything from the repo root config.
- `node.json` — Node-targeted packages (`engine`, future CLI helpers).
- `react.json` — DOM/WebWorker-targeted packages (`client`, browser-side cores).
