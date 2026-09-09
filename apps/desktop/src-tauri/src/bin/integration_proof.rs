//! Scratch integration proof (NOT part of the test suite): the D-033
//! no-restart contract, live. Boots the sidecar with tool_env()
//! pre-wiring against a scratch tools root, proves (1) an absent tool
//! answers the honest 503 through the running engine, (2) after
//! downloading it into the same root (shell-side, no engine restart),
//! the very next request succeeds.
//!
//! Usage: cargo run --bin integration_proof -- <tools-root> <tool-id>

use localtools_desktop::downloads::DownloadManager;
use localtools_desktop::manifest;
use localtools_desktop::sidecar::Sidecar;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;

fn main() {
    let root = PathBuf::from(std::env::args().nth(1).expect("tools root"));
    let tool_id = std::env::args().nth(2).expect("tool id");
    let tool = manifest::tool_by_id(&tool_id).expect("tool in manifest");

    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..");
    let entry = repo.join("apps").join("engine").join("dist").join("server.js");
    assert!(entry.exists(), "engine dist missing");
    let node = which_node();

    let mgr = DownloadManager::new(root.clone());
    let port: u16 = 8797;

    // Spawn with FULL tool_env pre-wiring (D-033) — paths may not exist.
    let mut env: Vec<(String, String)> = vec![
        ("LOCALTOOLS_ENGINE_PORT".to_string(), port.to_string()),
        ("LOCALTOOLS_ENGINE_HOST".to_string(), "127.0.0.1".to_string()),
    ];
    env.extend(mgr.tool_env());
    let log = std::env::temp_dir().join("lt-integration-proof.log");
    let mut sc = Sidecar::spawn(node, entry, env, log).expect("spawn");
    sc.wait_healthy().expect("healthy");
    println!("engine up on {port}");

    // (1) Absent tool → honest 503 tool-unavailable through the engine.
    // The engine's contract is the client's: multipart with an `options`
    // JSON field (engine-client.ts runEngineTool), not a bare JSON body.
    let status = post_multipart(port, "/media/text-to-speech");
    println!("absent-tool reply: {}", status);
    assert!(
        status.contains("\"tool-unavailable\"") || status.contains("503"),
        "absent tool must answer 503 tool-unavailable, got: {status}"
    );

    // (2) Shell downloads the tool (no engine restart).
    let mut progress = |_, _| {};
    mgr.ensure_tool(&tool, &mut progress).expect("download");
    println!("downloaded {} (installed: {})", tool.id, mgr.is_installed(tool.id));

    // (3) Very next request through the SAME running engine succeeds.
    let status2 = post_multipart(port, "/media/text-to-speech");
    println!("after-download reply head: {}", &status2[..status2.len().min(120)]);
    assert!(
        status2.contains("\"ok\":true") || status2.contains("\"ok\": true"),
        "post-download request must succeed without engine restart, got: {status2}"
    );
    println!("== INTEGRATION PROOF PASS ({}) ==", tool_id);
    sc.stop();
}

fn post_multipart(port: u16, path: &str) -> String {
    let options = "{\"text\":\"Integration proof sentence.\",\"voice\":\"en_US-lessac-medium\",\"speed\":1}";
    let boundary = "lt-proof-boundary";
    let body = format!(
        "--{b}\r\nContent-Disposition: form-data; name=\"options\"\r\n\r\n{o}\r\n--{b}--\r\n",
        b = boundary,
        o = options
    );
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: multipart/form-data; boundary={b}\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n{body}",
        port = port,
        path = path,
        b = boundary,
        len = body.len(),
        body = body
    );
    let mut s = TcpStream::connect(("127.0.0.1", port)).expect("connect");
    s.write_all(req.as_bytes()).unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    String::from_utf8_lossy(&buf).into_owned()
}

fn which_node() -> PathBuf {
    let out = std::process::Command::new("where").arg("node").output().unwrap();
    let text = String::from_utf8_lossy(&out.stdout);
    PathBuf::from(text.lines().next().unwrap().trim())
}
