//! Scratch live-verification harness (NOT part of the test suite).
//! Proves the real pipeline: yt-dlp download from the pinned URL,
//! SHA-256 verification, extraction to the final layout, env binding.
//! Run: cargo run --bin live_check -- --root <scratch-dir>
//! (added as a dev-only example binary; never in CI).

use localtools_desktop::downloads::DownloadManager;
use localtools_desktop::manifest;
use std::path::PathBuf;

fn main() {
    let root = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .expect("usage: live_check <tools-root>");
    let tool_id = std::env::args().nth(2).unwrap_or_else(|| "yt-dlp".into());
    let tool = manifest::tool_by_id(&tool_id).expect("tool in manifest");
    println!("== live check: {} ==", tool.id);
    let mgr = DownloadManager::new(root.clone());
    let mut progress = |done: u64, total: Option<u64>| {
        print!("\r  {} / {} bytes   ", done, total.map(|t| t.to_string()).unwrap_or_else(|| "?".into()));
        use std::io::Write;
        std::io::stdout().flush().ok();
    };
    match mgr.ensure_tool(&tool, &mut progress) {
        Ok(()) => println!("\n  installed: {}", mgr.is_installed(tool.id)),
        Err(e) => {
            println!("\n  FAILED: [{}] {}", e.code, e.message);
            std::process::exit(1);
        }
    }
    let env = mgr.tool_env();
    for (k, v) in &env {
        println!("  env {} = {}", k, v);
    }
    // Verify the binaries actually exist at the bound paths.
    for (k, v) in &env {
        let p = PathBuf::from(v);
        if !p.exists() {
            println!("  MISSING: {} -> {}", k, v);
            std::process::exit(1);
        }
        println!("  exists: {} -> {}", k, v);
    }
    println!("== live check PASS ({}) ==", tool.id);
}
