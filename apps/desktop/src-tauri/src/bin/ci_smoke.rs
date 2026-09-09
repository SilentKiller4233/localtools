//! CI smoke: boot the engine sidecar + prove /healthz, as a standalone
//! binary (NOT a cargo test). CI runners manage their step's process
//! tree and a long-lived grandchild spawned from inside cargo's test
//! harness wedges their cleanup (three deterministic job kills — the
//! runner sent its shutdown signal exactly at the engine spawn, see
//! DECISIONS.md D-033 gotcha list). A plain binary under `setsid` in the
//! workflow keeps the engine out of the runner's managed tree entirely.
//!
//! Usage: cargo run --bin ci_smoke -- <repo-root> [port]

use localtools_desktop::sidecar::Sidecar;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let root = PathBuf::from(std::env::args().nth(1).expect("repo root"));
    let port: u16 = std::env::args()
        .nth(2)
        .and_then(|p| p.parse().ok())
        .unwrap_or(8799);

    let entry = root.join("apps").join("engine").join("dist").join("server.js");
    assert!(
        entry.exists(),
        "engine dist missing at {entry:?} — run pnpm --filter @localtools/engine build"
    );
    let node = which_node();

    let log = root
        .join("apps")
        .join("desktop")
        .join("src-tauri")
        .join("target")
        .join("ci-smoke-engine.log");
    let start = Instant::now();
    let mut sc = Sidecar::spawn(
        node,
        entry,
        vec![("LOCALTOOLS_ENGINE_PORT".into(), port.to_string())],
        log,
    )
    .expect("spawn engine");
    sc.wait_healthy().expect("engine healthy");
    println!("engine healthy on {port} in {:?}", start.elapsed());
    assert!(localtools_desktop::sidecar::try_health_probe(port));
    println!("healthz probe: OK");
    sc.stop();
    println!("SIDECAR_HEALTHZ_PASS");
}

fn which_node() -> PathBuf {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let out = std::process::Command::new(finder).arg("node").output().expect("find node");
    let text = String::from_utf8_lossy(&out.stdout);
    PathBuf::from(text.lines().next().expect("node on PATH").trim())
}
