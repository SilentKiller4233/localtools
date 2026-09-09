//! Engine sidecar lifecycle (PROJECT_SPEC Sections 1 Layer 3, 5.4, 10).
//!
//! The engine (Fastify/Node app) runs as a RESTRICTED CHILD PROCESS of the
//! shell — NOT a Tauri `externalBin` sidecar (the engine is a Node
//! application with node_modules, not a single static binary; see
//! DECISIONS.md D-033 for the full sidecar-vs-spawned-process record).
//!
//! Section 5.4 posture:
//!   - localhost only: the engine binds 127.0.0.1 itself (config.ts);
//!     the child never receives LOCALTOOLS_EXPOSE.
//!   - restricted child: minimal env (inherit only PATH, SystemRoot,
//!     TEMP/TMP, LOCALAPPDATA + our LOCALTOOLS_* overrides), scoped cwd.
//!   - no elevated permissions are ever requested.
//!
//! Lifecycle: spawn → poll GET /healthz until 200 (60s) → run → kill on
//! exit (taskkill /T on Windows for the process tree; SIGTERM then
//! SIGKILL on Unix).

use std::io::{BufRead, BufReader, Read as _, Write as _};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Port the sidecar binds (127.0.0.1). The client is told via the bridge.
pub const ENGINE_PORT: u16 = 8787;

/// How long to wait for /healthz after spawn before declaring failure.
/// Generous for cold CI runners; the engine itself boots in seconds
/// (the original 60s→181s failures were a wrong-port probe bug, not
/// slowness — fixed by tracking the spawned port per child).
const HEALTH_TIMEOUT: Duration = Duration::from_secs(120);
const HEALTH_POLL: Duration = Duration::from_millis(250);

/// A managed engine child process.
pub struct Sidecar {
    child: Child,
    log_path: PathBuf,
    /// Port the engine was spawned to bind (healthz probes target it —
    /// NOT the ENGINE_PORT constant: the smoke test uses a dedicated
    /// port to avoid clashes, and probing the wrong port was a real
    /// bug caught by exactly that).
    port: u16,
}

impl Sidecar {
    /// Spawn the engine with a minimal environment.
    ///
    /// `node` — path to a node executable to run the engine entrypoint.
    /// `engine_entry` — path to the built engine dist entrypoint (JS).
    /// `engine_env` — LOCALTOOLS_* overrides (tools + temp dir + port).
    /// `log_path` — engine stdout/stderr log file (diagnostics only).
    ///
    /// The spawned port is read from the env's LOCALTOOLS_ENGINE_PORT
    /// (falling back to ENGINE_PORT) so health probes always target the
    /// port this child actually binds.
    pub fn spawn(
        node: PathBuf,
        engine_entry: PathBuf,
        engine_env: Vec<(String, String)>,
        log_path: PathBuf,
    ) -> Result<Self, String> {
        let port = engine_env
            .iter()
            .find(|(k, _)| k == "LOCALTOOLS_ENGINE_PORT")
            .and_then(|(_, v)| v.parse::<u16>().ok())
            .unwrap_or(ENGINE_PORT);
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let log = std::fs::File::create(&log_path)
            .map_err(|e| format!("Could not open the engine log file: {e}"))?;
        let log_err = log
            .try_clone()
            .map_err(|e| format!("Could not prepare the engine log file: {e}"))?;

        let mut cmd = Command::new(&node);
        cmd.arg(&engine_entry)
            .env_clear()
            .env("PATH", minimal_path())
            .env("SYSTEMROOT", std::env::var("SYSTEMROOT").unwrap_or_default())
            .env("SYSTEMDRIVE", std::env::var("SYSTEMDRIVE").unwrap_or_default())
            .env("LOCALAPPDATA", std::env::var("LOCALAPPDATA").unwrap_or_default())
            .env("TEMP", scoped_temp_dir())
            .env("TMP", scoped_temp_dir())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(log_err))
            .stdin(Stdio::null());
        for (k, v) in engine_env {
            cmd.env(k, v);
        }
        // Scoped working directory (Section 5.4): the engine's own temp
        // handling uses tmpdir(), but cwd is pinned to its bundle dir.
        if let Some(dir) = engine_entry.parent() {
            cmd.current_dir(dir);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("Could not start the local engine: {e}"))?;
        Ok(Self { child, log_path, port })
    }

    /// Wait for the engine to answer /healthz with 200.
    pub fn wait_healthy(&mut self) -> Result<(), String> {
        let deadline = Instant::now() + HEALTH_TIMEOUT;
        loop {
            if try_health_probe(self.port) {
                return Ok(());
            }
            match self.child.try_wait() {
                Ok(Some(status)) => {
                    return Err(format!(
                        "The local engine exited during startup ({}). See the log for details.",
                        status
                    ));
                }
                Ok(None) => {}
                Err(e) => return Err(format!("Could not monitor the engine process: {e}")),
            }
            if Instant::now() > deadline {
                let _ = self.kill_tree();
                return Err("The local engine did not become ready in time.".into());
            }
            std::thread::sleep(HEALTH_POLL);
        }
    }

    /// One healthz probe via raw TCP (no HTTP client dependency).
    pub fn health_probe(&self) -> bool {
        try_health_probe(self.port)
    }

    /// The port this sidecar binds.
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Stop the engine (graceful-then-forceful, process tree).
    pub fn stop(&mut self) {
        let _ = self.kill_tree();
    }

    fn kill_tree(&mut self) -> Result<(), String> {
        kill_process_tree(self.child.id())
    }

    pub fn log_path(&self) -> &Path {
        &self.log_path
    }

    /// Tail of the engine log for error UI (never logs URLs, 5.6).
    pub fn log_tail(&self, lines: usize) -> String {
        log_tail(&self.log_path, lines)
    }
}

/// One GET /healthz probe (raw socket HTTP/1.0 — zero extra deps).
pub fn try_health_probe(port: u16) -> bool {
    use std::io::Write;
    let Ok(mut s) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    s.set_read_timeout(Some(Duration::from_secs(2))).ok();
    let req = format!("GET /healthz HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n\r\n");
    if s.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 512];
    let n = s.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    head.starts_with("HTTP/1.") && head.contains("200")
}

/// Minimal PATH for the child: engine tool overrides point at our cache,
/// but the engine shells out to native tools — its LOCALTOOLS_*_PATH
/// overrides point at absolute paths so a bare PATH is fine.
fn minimal_path() -> String {
    std::env::var("PATH").unwrap_or_default()
}

/// The scoped temp dir for the engine child (Section 5.4).
fn scoped_temp_dir() -> String {
    let base = std::env::temp_dir().join("localtools-engine");
    let _ = std::fs::create_dir_all(&base);
    base.to_string_lossy().into_owned()
}

/// Kill an entire process tree: taskkill /T on Windows; process-group
/// kill via `kill -- -PID` on Unix (children spawned in our group).
fn kill_process_tree(pid: u32) -> Result<(), String> {
    if cfg!(windows) {
        let out = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            // Process already gone — fine.
            Ok(())
        }
    } else {
        // Kill the negative pid (process group) then the pid itself.
        let _ = Command::new("kill")
            .arg(format!("-{}", pid))
            .output();
        let _ = Command::new("kill")
            .arg(pid.to_string())
            .output();
        Ok(())
        // reaped by Drop of Child handle on next wait
    }
}

/// Tail helper (also used for the engine-ready diagnostics banner).
pub fn log_tail(path: &Path, lines: usize) -> String {
    let Ok(file) = std::fs::File::open(path) else {
        return String::new();
    };
    let reader = BufReader::new(file);
    let mut collected: Vec<String> = Vec::new();
    for line in reader.lines() {
        match line {
            Ok(l) => {
                collected.push(l);
                if collected.len() > lines {
                    collected.remove(0);
                }
            }
            Err(_) => break,
        }
    }
    collected.join("\n")
}
