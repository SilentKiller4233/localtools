//! Shell tests (Section 14.7 desktop smoke, non-GUI part).
//!
//! Run under plain `cargo test` (apps/desktop/src-tauri): they prove the
//! download pipeline verifies SHA-256 against a local mock server
//! (D-026-style — CI never touches the network) and that manifest pins
//! are well-formed. The sidecar smoke boots the REAL engine and probes
//! /healthz — `#[ignore]`d by default so plain `cargo test` needs no
//! engine build; CI runs it with `--ignored` after building.

use crate::downloads::DownloadManager;
use crate::manifest;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Find the monorepo root from CARGO_MANIFEST_DIR.
fn repo_root() -> PathBuf {
    let mut dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for _ in 0..6 {
        if dir.join("pnpm-workspace.yaml").exists() {
            return dir;
        }
        dir = dir.parent().expect("walked past root").to_path_buf();
    }
    panic!("monorepo root not found from CARGO_MANIFEST_DIR");
}

#[test]
fn manifest_pins_are_wellformed() {
    for tool in manifest::native_tools() {
        assert!(!tool.id.is_empty());
        assert!(!tool.artifacts.is_empty(), "{} has no artifacts", tool.id);
        for art in tool.artifacts {
            assert!(!art.per_os.is_empty(), "{} has no per-OS entries", art.id);
            for osa in art.per_os {
                assert!(osa.url.starts_with("https://"), "{}: non-https url", art.id);
                assert_eq!(osa.sha256.len(), 64, "{}: sha256 not 64 hex chars", art.id);
                assert!(
                    osa.sha256.chars().all(|c| c.is_ascii_hexdigit()),
                    "{}: sha256 not hex",
                    art.id
                );
            }
        }
    }
}

#[test]
fn env_bindings_point_at_sane_layouts() {
    // Values are relative paths joined onto the tool dir — never
    // absolute (they'd escape the scoped tools root) and never empty.
    // (Windows accepts '/' in joined paths — Node spawn included — so
    // the separator itself is not an error.)
    for tool in manifest::native_tools() {
        for b in tool.env_bindings {
            assert!(
                !b.windows.is_empty() && !b.linux.is_empty(),
                "{} {} missing per-OS value",
                tool.id,
                b.var
            );
            assert!(
                !b.windows.starts_with('/') && !b.windows.starts_with('\\'),
                "{} {} windows value is absolute",
                tool.id,
                b.var
            );
            assert!(
                !b.linux.starts_with('/'),
                "{} {} linux value is absolute",
                tool.id,
                b.var
            );
        }
    }
}

#[test]
fn download_manager_reports_uninstalled_and_envs() {
    let tmp = tempfile::tempdir().unwrap();
    let mgr = DownloadManager::new(tmp.path().to_path_buf());
    let statuses = mgr.all_status();
    assert!(!statuses.is_empty());
    for s in &statuses {
        assert!(!s.installed, "{} looked installed in a fresh dir", s.id);
    }
    // D-033 contract: tool_env() emits overrides for EVERY manifest tool
    // pointing at final install paths, EVEN BEFORE any download — the
    // engine's per-process path cache means overrides must exist at
    // spawn time; absent tools then ENOENT → honest 503, and a later
    // download just makes the file appear behind the same override.
    let env = mgr.tool_env();
    assert!(
        env.contains_key("LOCALTOOLS_YTDLP_PATH"),
        "yt-dlp env binding missing in fresh dir (D-033 pre-wiring)"
    );
    assert!(env["LOCALTOOLS_YTDLP_PATH"].ends_with("yt-dlp.exe"));
    assert!(
        env.contains_key("LOCALTOOLS_FFMPEG_PATH"),
        "ffmpeg env binding missing in fresh dir"
    );
    // Simulate an install: marker + file for yt-dlp (SingleFile kind) —
    // the env value is UNCHANGED (same final path), only the file
    // appeared: exactly the no-restart contract.
    let dir = tmp.path().join("yt-dlp");
    std::fs::create_dir_all(dir.join("downloads")).unwrap();
    std::fs::write(dir.join("downloads").join("yt-dlp.exe"), b"x").unwrap();
    std::fs::copy(dir.join("downloads").join("yt-dlp.exe"), dir.join("yt-dlp.exe")).unwrap();
    std::fs::write(dir.join(".installed"), b"ok").unwrap();
    let env_after = mgr.tool_env();
    assert_eq!(
        env["LOCALTOOLS_YTDLP_PATH"], env_after["LOCALTOOLS_YTDLP_PATH"],
        "env override must be stable across the install"
    );
    assert!(std::path::PathBuf::from(&env_after["LOCALTOOLS_YTDLP_PATH"]).exists());
}

/// A tiny local HTTP server for download-pipeline tests (no network).
struct MockServer {
    url: String,
    hits: Arc<AtomicUsize>,
}

impl MockServer {
    fn serve(payload: Vec<u8>) -> Self {
        let hits = Arc::new(AtomicUsize::new(0));
        let hits2 = hits.clone();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut s) = stream else { break };
                let mut buf = [0u8; 2048];
                let _ = s.read(&mut buf);
                hits2.fetch_add(1, Ordering::SeqCst);
                let body = payload.clone();
                let _ = s.write_all(
                    format!(
                        "HTTP/1.0 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    )
                    .as_bytes(),
                );
                let _ = s.write_all(&body);
            }
        });
        Self { url: format!("http://127.0.0.1:{port}/"), hits }
    }
}

/// Build a fake tool pointing at the local mock server. Box::leak gives
/// the manifest-shaped slices 'static lifetime without shared-state
/// traps (each call gets its OWN artifact — the mismatch test relies
/// on two different shas coexisting).
fn fake_tool(url: &'static str, sha256: &'static str) -> manifest::NativeTool {
    let osa: &'static manifest::OsArtifact =
        Box::leak(Box::new(manifest::OsArtifact {
            os: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            url,
            sha256,
            file_name: "fake.exe",
        }));
    let art: &'static manifest::ToolArtifact =
        Box::leak(Box::new(manifest::ToolArtifact {
            id: "fake",
            label: "fake",
            approx_mb: 1,
            kind: manifest::ArtifactKind::SingleFile,
            per_os: std::slice::from_ref(osa),
        }));
    manifest::NativeTool {
        id: "fake",
        label: "Fake",
        prompt_copy: "",
        artifacts: std::slice::from_ref(art),
        env_bindings: &[],
    }
}

#[test]
fn download_pipeline_verifies_sha_and_rejects_mismatch() {
    let payload = b"fake-yt-dlp-binary-bytes".to_vec();
    let mut hasher = sha2::Sha256::new();
    hasher.update(&payload);
    let digest = hex::encode(hasher.finalize_reset());
    let good_sha: &'static str = Box::leak(digest.into_boxed_str());

    let server = MockServer::serve(payload.clone());
    let url: &'static str = Box::leak(server.url.clone().into_boxed_str());
    let mut progress = |_, _| {};

    // Good path: matching sha installs and lands at its final path.
    let tmp = tempfile::tempdir().unwrap();
    let mgr = DownloadManager::new(tmp.path().to_path_buf());
    mgr.ensure_tool(&fake_tool(url, good_sha), &mut progress)
        .unwrap();
    assert!(mgr.is_installed("fake"));
    assert!(tmp.path().join("fake").join("fake.exe").exists());

    // Bad path: mismatched sha fails, discards, stays uninstalled.
    let tmp2 = tempfile::tempdir().unwrap();
    let mgr2 = DownloadManager::new(tmp2.path().to_path_buf());
    let err = mgr2
        .ensure_tool(&fake_tool(url, ZERO_SHA), &mut progress)
        .unwrap_err();
    assert_eq!(err.code, "checksum-mismatch");
    assert!(!mgr2.is_installed("fake"));
    assert!(!tmp2.path().join("fake").join("fake.exe").exists());
    assert_eq!(server.hits.load(Ordering::SeqCst), 2);
}

const ZERO_SHA: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[test]
fn network_failure_surfaces_retryable_error() {
    // Nothing listens on this port — the client must see a friendly
    // network-error, not a panic, and the tool stays uninstalled.
    let tmp = tempfile::tempdir().unwrap();
    let mgr = DownloadManager::new(tmp.path().to_path_buf());
    let mut progress = |_, _| {};
    let err = mgr
        .ensure_tool(&fake_tool("http://127.0.0.1:1/x", ZERO_SHA), &mut progress)
        .unwrap_err();
    assert_eq!(err.code, "network-error");
    assert!(!mgr.is_installed("fake"));
}

#[test]
#[ignore = "boots the real engine; run via cargo test -- --ignored after building engine dist"]
fn sidecar_boots_engine_and_answers_healthz() {
    let root = repo_root();
    let node = which_node();
    let entry = root
        .join("apps")
        .join("engine")
        .join("dist")
        .join("server.js");
    assert!(
        entry.exists(),
        "engine dist missing — run pnpm --filter @localtools/engine build"
    );

    let log = root
        .join("apps")
        .join("desktop")
        .join("src-tauri")
        .join("target")
        .join("test-engine.log");
    let port = 8791u16; // dedicated smoke port to avoid clashes
    let mut sc = crate::sidecar::Sidecar::spawn(
        node,
        entry,
        vec![("LOCALTOOLS_ENGINE_PORT".into(), port.to_string())],
        log,
    )
    .expect("spawn engine");
    sc.wait_healthy().expect("engine healthy");
    assert!(crate::sidecar::try_health_probe(port));
    sc.stop();
}

fn which_node() -> PathBuf {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let out = Command::new(finder).arg("node").output().expect("find node");
    let text = String::from_utf8_lossy(&out.stdout);
    PathBuf::from(text.lines().next().expect("node on PATH").trim())
}
