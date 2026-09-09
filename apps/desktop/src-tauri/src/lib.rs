//! LocalTools desktop shell library (PROJECT_SPEC Phase 10).
//!
//! Wraps the built Vite client (Layer 1) in a native window and manages
//! the engine (Layer 2) as a restricted child process, plus the pinned
//! lazy-download manager for every native tool (Tier 1 distribution).
//!
//! Everything here is deliberately thin: the client owns all UI, the
//! engine owns all processing. The shell's three jobs — window, sidecar
//! lifecycle, lazy downloads — stay the only shell concerns. A lib+bin
//! split lets `cargo test` exercise the same code the binary runs.

pub mod downloads;
pub mod manifest;
pub mod paths;
pub mod sidecar;

#[cfg(test)]
mod tests;

use downloads::DownloadManager;
use paths::ShellPaths;
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;

/// State shared across Tauri commands.
pub struct ShellState {
    manager: DownloadManager,
    sidecar: Mutex<Option<sidecar::Sidecar>>,
    paths: ShellPaths,
}

// ---------------------------------------------------------------------------
// Bridge commands (the client's window.__LOCALTOOLS__ surface)
// ---------------------------------------------------------------------------

/// Full bridge status for the client (port, engine readiness, tools).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeStatus {
    engine_port: u16,
    engine_ready: bool,
    engine_log_tail: String,
    version: String,
    tools: Vec<downloads::ToolStatus>,
}

#[tauri::command]
fn desktop_status(state: tauri::State<ShellState>) -> BridgeStatus {
    let guard = state.sidecar.lock();
    let (ready, tail) = match guard {
        Ok(mut guard) => match guard.as_mut() {
            Some(sc) => (true, sc.log_tail(6)),
            None => (false, String::new()),
        },
        Err(_) => (false, String::new()),
    };
    BridgeStatus {
        engine_port: sidecar::ENGINE_PORT,
        engine_ready: ready,
        engine_log_tail: tail,
        version: env!("CARGO_PKG_VERSION").to_string(),
        tools: state.manager.all_status(),
    }
}

/// One-time friendly prompt data for a tool (spec line 362).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolDownloadInfo {
    id: String,
    label: String,
    prompt_copy: String,
    approx_mb: u32,
    installed: bool,
    supported: bool,
}

#[tauri::command]
fn tool_download_info(
    state: tauri::State<ShellState>,
    tool: String,
) -> Result<ToolDownloadInfo, String> {
    let Some(t) = manifest::tool_by_id(&tool) else {
        return Err(format!("unknown tool: {tool}"));
    };
    Ok(ToolDownloadInfo {
        id: t.id.to_string(),
        label: t.label.to_string(),
        prompt_copy: t.prompt_copy.to_string(),
        approx_mb: t.artifacts.iter().map(|a| a.approx_mb).sum(),
        installed: state.manager.is_installed(t.id),
        supported: state.manager.supports_platform(&t),
    })
}

/// Download + install a tool (one-time, pinned URL + SHA-256-verified).
/// Emits `download://progress` events the client renders as a bar.
#[tauri::command]
async fn download_tool(
    state: tauri::State<'_, ShellState>,
    app: tauri::AppHandle,
    tool: String,
) -> Result<DownloadOutcome, DownloadBridgeError> {
    let Some(t) = manifest::tool_by_id(&tool) else {
        return Err(DownloadBridgeError::unknown_tool(tool));
    };
    if state.manager.is_installed(t.id) {
        return Ok(DownloadOutcome {
            installed: true,
            message: format!("{} is already installed.", t.label),
        });
    }
    let manager = DownloadManager::new(state.paths.tools_root.clone());
    let app = app.clone();
    let tool_id = t.id.to_string();
    let label = t.label.to_string();
    let res = tokio::task::spawn_blocking(move || {
        let mut progress = |done: u64, total: Option<u64>| {
            use tauri::Emitter;
            let _ = app.emit(
                "download://progress",
                ProgressPayload { tool: tool_id.clone(), done, total },
            );
        };
        manager.ensure_tool(&t, &mut progress)
    })
    .await
    .map_err(|e| {
        DownloadBridgeError::internal(format!(
            "The download task stopped unexpectedly: {e}"
        ))
    })?
    .map_err(|e| DownloadBridgeError {
        code: e.code.to_string(),
        message: e.message,
    });
    res.map(|_| DownloadOutcome {
        installed: true,
        message: format!("{label} is ready to use."),
    })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    tool: String,
    done: u64,
    total: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadOutcome {
    installed: bool,
    message: String,
}

/// Structured bridge error: the client reads `code` (network-error /
/// checksum-mismatch / extract-failed / unsupported-platform / internal)
/// to style its retry copy (Section 13's retryable degradation).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadBridgeError {
    code: String,
    message: String,
}

impl DownloadBridgeError {
    fn unknown_tool(tool: String) -> Self {
        Self {
            code: "unknown-tool".into(),
            message: format!("Unknown tool: {tool}"),
        }
    }
    fn internal(message: String) -> Self {
        Self { code: "internal".into(), message }
    }
}

/// Map an engine endpoint path → the tool whose download makes it work.
/// Mirrors tool-paths.ts so the client can offer the right prompt on a
/// 503 tool-unavailable (spec: prompt "the first time that specific
/// tool is used").
#[tauri::command]
fn tool_for_endpoint(endpoint: String) -> Option<String> {
    if endpoint.starts_with("/media/") {
        return Some("ffmpeg".into()); // conversion suite
    }
    match endpoint.as_str() {
        "/pdf/office-conversion" => Some("libreoffice".into()),
        "/pdf/ocr" => Some("tesseract".into()),
        "/pdf/deep-compress" | "/pdf/pdf-a" | "/pdf/deep-repair" => Some("ghostscript".into()),
        "/media/text-to-speech" | "/media/pdf-to-audiobook" => Some("piper".into()),
        "/downloader/metadata" | "/downloader/download" => Some("yt-dlp".into()),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

/// Run the desktop app (called by the thin bin in main.rs).
pub fn run() {
    let single = tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_focus();
        }
    });

    tauri::Builder::default()
        .plugin(single)
        .setup(|app| {
            // The window is built here (not in tauri.conf.json) so the
            // LocalTools bridge can be injected as an initialization
            // script — Tauri 2 config has no init-script key (verified
            // against tauri-utils 2.9.3 config.rs).
            let bridge = include_str!("../bridge.js");
            let win = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::default(),
            )
            .title("LocalTools")
            .inner_size(1280.0, 800.0)
            .min_inner_size(390.0, 600.0)
            .center()
            .initialization_script(bridge)
            .build()?;
            let _ = win;

            let paths = ShellPaths::resolve(app.handle())?;
            let manager = DownloadManager::new(paths.tools_root.clone());
            app.manage(ShellState {
                manager,
                sidecar: Mutex::new(None),
                paths,
            });

            // Boot the engine sidecar off the UI thread. Failure is
            // non-fatal: Group A tools keep working and the client shows
            // the engine-unavailable banner (Section 13 isolation).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = boot_sidecar(&handle) {
                    eprintln!("[localtools] engine sidecar failed: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            tool_download_info,
            download_tool,
            tool_for_endpoint,
        ])
        .run(tauri::generate_context!())
        .expect("error while running localtools desktop");
}

/// Boot the engine sidecar (setup thread).
fn boot_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let state: tauri::State<ShellState> = app.state();
    let paths = &state.paths;
    let engine_entry = paths.engine_entry().map_err(|e| e.to_string())?;
    let node = paths.node_runtime().map_err(|e| e.to_string())?;

    // Env: port + tool overrides for every installed tool + voice dir.
    // LOCALTOOLS_EXPOSE is deliberately never set (Section 5.1).
    let mut env: Vec<(String, String)> = vec![
        ("LOCALTOOLS_ENGINE_PORT".into(), sidecar::ENGINE_PORT.to_string()),
        ("LOCALTOOLS_ENGINE_HOST".into(), "127.0.0.1".into()),
        ("LOCALTOOLS_CLIENT_ORIGIN".into(), client_origin_for_shell()),
        (
            "LOCALTOOLS_VOICE_DIR".into(),
            paths.voice_dir.to_string_lossy().into_owned(),
        ),
    ];
    for (k, v) in state.manager.tool_env() {
        env.push((k, v));
    }

    let log_path = paths.log_dir.join("engine.log");
    let mut sc = sidecar::Sidecar::spawn(node, engine_entry, env, log_path)?;
    sc.wait_healthy()?;
    *state
        .sidecar
        .lock()
        .map_err(|_| "sidecar state poisoned".to_string())? = Some(sc);
    use tauri::Emitter;
    let _ = app.emit("engine://ready", sidecar::ENGINE_PORT);
    Ok(())
}

/// The origin the engine's exact-origin CORS accepts for shell requests.
/// Tauri 2 custom-protocol pages: `http://tauri.localhost` on Windows,
/// `tauri://localhost` on macOS/Linux (verified against Tauri 2 docs'
/// origin semantics; the smoke test pins the actual value the engine
/// sees at request time).
fn client_origin_for_shell() -> String {
    if cfg!(windows) {
        "http://tauri.localhost".into()
    } else {
        "tauri://localhost".into()
    }
}
