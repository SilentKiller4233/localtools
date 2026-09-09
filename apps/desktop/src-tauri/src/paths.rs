//! Shell filesystem layout (PROJECT_SPEC Phase 10; Section 5.4 scoping).
//!
//! All desktop-managed state lives under the OS-appropriate per-app dirs:
//!   <app_data_dir>/localtools-tools/    — lazy-downloaded native tools
//!   <app_data_dir>/logs/engine.log       — engine stdout/stderr
//!   <app_cache_dir>/voices/             — Piper voice models (engine env)
//!   <resource_dir>/engine/              — bundled engine + node runtime
//!                                          (Tauri resource, read-only)
//!
//! In dev (`tauri dev` inside the monorepo), the engine entrypoint and
//! node runtime resolve from the checkout instead of the bundle, so
//! `pnpm desktop:dev` works without a packaged build. The packaged app
//! resolves the engine bundle from the Tauri resource dir.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
pub struct ShellPaths {
    pub tools_root: PathBuf,
    pub log_dir: PathBuf,
    pub voice_dir: PathBuf,
    /// Bundled engine (Tauri resource dir; None in dev).
    pub resource_engine: Option<PathBuf>,
    /// Dev-monorepo fallback root (None in a packaged build).
    pub dev_repo_root: Option<PathBuf>,
}

#[derive(Debug)]
pub struct PathError(pub String);

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for PathError {}

impl ShellPaths {
    /// Resolve from a Tauri app handle (packaged or dev).
    pub fn resolve(app: &AppHandle) -> Result<Self, PathError> {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|e| PathError(format!("Could not resolve the app data directory: {e}")))?;
        let cache = app
            .path()
            .app_cache_dir()
            .map_err(|e| PathError(format!("Could not resolve the app cache directory: {e}")))?;

        let tools_root = data.join("localtools-tools");
        let log_dir = data.join("logs");
        let voice_dir = cache.join("voices");
        for d in [&tools_root, &log_dir, &voice_dir] {
            std::fs::create_dir_all(d)
                .map_err(|e| PathError(format!("Could not create app directories: {e}")))?;
        }

        // Packaged: the bundle ships as Tauri resources under engine/.
        let resource_engine = app
            .path()
            .resource_dir()
            .ok()
            .map(|r| r.join("engine"));

        let dev_repo_root = find_dev_repo_root();

        Ok(Self {
            tools_root,
            log_dir,
            voice_dir,
            resource_engine,
            dev_repo_root,
        })
    }

    /// The engine entrypoint JS file to run with node.
    pub fn engine_entry(&self) -> Result<PathBuf, PathError> {
        // 1. Packaged: <resource>/engine/bundle/dist/server.js
        if let Some(res) = &self.resource_engine {
            let entry = res.join("bundle").join("dist").join("server.js");
            if entry.exists() {
                return Ok(entry);
            }
        }
        // 2. Dev: <repo>/apps/engine/dist/server.js
        if let Some(repo) = &self.dev_repo_root {
            let dev = repo.join("apps").join("engine").join("dist").join("server.js");
            if dev.exists() {
                return Ok(dev);
            }
        }
        Err(PathError(
            "The engine bundle is missing. Run `pnpm --filter @localtools/desktop desktop:engine-dist` and try again.".into(),
        ))
    }

    /// A node executable to run the engine with.
    pub fn node_runtime(&self) -> Result<PathBuf, PathError> {
        // 1. Packaged: <resource>/engine/node/node[.exe]
        if let Some(res) = &self.resource_engine {
            let exe = res
                .join("node")
                .join(if cfg!(windows) { "node.exe" } else { "node" });
            if exe.exists() {
                return Ok(exe);
            }
        }
        // 2. Dev: the system node running the monorepo.
        if self.dev_repo_root.is_some() {
            if let Some(p) = which_node() {
                return Ok(p);
            }
        }
        Err(PathError(
            "The bundled Node runtime is missing. Reinstall the app.".into(),
        ))
    }
}

fn which_node() -> Option<PathBuf> {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let out = std::process::Command::new(finder).arg("node").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let first = text.lines().next()?.trim();
    if first.is_empty() {
        None
    } else {
        Some(PathBuf::from(first))
    }
}

/// Locate the monorepo root when running from a dev checkout.
fn find_dev_repo_root() -> Option<PathBuf> {
    // tauri dev binary: apps/desktop/src-tauri/target/debug/…exe
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?;
    for _ in 0..8 {
        if dir.join("pnpm-workspace.yaml").exists() {
            return Some(dir.to_path_buf());
        }
        dir = dir.parent()?;
    }
    // Test harness fallback: CARGO_MANIFEST_DIR walk-up.
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        let mut dir = PathBuf::from(manifest);
        for _ in 0..6 {
            if dir.join("pnpm-workspace.yaml").exists() {
                return Some(dir);
            }
            dir = dir.parent()?.to_path_buf();
        }
    }
    None
}
