# apps/desktop — LocalTools desktop shell (Phase 10)

The Tier 1 desktop distribution (PROJECT_SPEC Sections 1 Layer 3, 5.4,
10): a thin Rust/Tauri 2.11 shell that

1. wraps the built Vite client (`apps/client/dist`) as a native window,
2. runs the processing engine (`apps/engine`) as a **restricted child
   process** — loopback-only, minimal env, scoped temp dir, no elevation
   (D-033), and
3. manages **lazy downloads** for every native tool with pinned URLs +
   SHA-256 verification (D-034): yt-dlp, ffmpeg, Piper, Ghostscript,
   Tesseract (+eng data), LibreOffice, and qpdf-fallback plumbing.

The client never imports `@tauri-apps/api` — the shell injects
`window.__LOCALTOOLS__` (an invoke-only bridge, `src-tauri/bridge.js`)
so the client bundle stays browser-buildable and behaves identically in
Docker/dev. In a plain browser the bridge is absent and every desktop
feature degrades honestly to the pre-Phase-10 behavior.

## Layout

```
src-tauri/
├── src/
│   ├── manifest.rs      # pinned tool artifacts (URL + SHA-256) + env bindings
│   ├── downloads.rs     # streaming digest-verified downloads + extraction
│   ├── sidecar.rs      # engine child-process lifecycle (spawn/health/kill-tree)
│   ├── paths.rs        # app-data dirs, resource bundle, dev-checkout fallback
│   ├── lib.rs          # Tauri app + the 4 invoke commands
│   ├── tests.rs        # cargo test smoke (mock server — no network in CI)
│   └── bin/            # live_check / integration_proof (dev verification tools)
├── bridge.js           # injected as the window init script
├── tauri.conf.json     # window/bundle/resources config
├── engine-dist/        # built engine bundle (gitignored; scripts/build-engine-dist.mjs)
└── icons/
scripts/
└── build-engine-dist.mjs  # pnpm deploy isolation + node runtime packing
```

## Commands

```bash
pnpm desktop:engine-dist   # build the self-contained engine bundle
pnpm dev                   # tauri dev (client dev server + engine from the checkout)
pnpm desktop:build         # tauri build (installer/AppImage via beforeBuildCommand)
cargo test --manifest-path src-tauri/Cargo.toml            # shell tests
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored  # + real sidecar smoke
```

Dev verification tools (not part of the test suite):

```bash
cargo run --bin live_check -- <tools-root-dir> yt-dlp       # real pinned download
cargo run --bin integration_proof -- <tools-root-dir> piper  # 503→200 no-restart proof
```

Signing/updater: deliberately OFF until the owner provides signing
secrets (D-037); unsigned-app first-launch bypass steps live in the
root README.
