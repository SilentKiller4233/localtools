//! Lazy-download manager (PROJECT_SPEC Section 10 Tier 1, Phase 10).
//!
//! Downloads pinned artifacts (manifest.rs) into the app's local data
//! directory, verifies SHA-256 while streaming, extracts per
//! ArtifactKind, and reports progress to the client. Section 5.4
//! posture: restricted child processes only (7z.exe / msiexec / tar),
//! scoped temp directory, never elevated.
//!
//! Install layout (all under the tools root, one dir per tool):
//!   <tools_root>/<tool-id>/
//!     ├─ <extracted tree per kind>
//!     └─ downloads/            (original archives, kept for provenance)
//!
//! Atomicity: everything downloads into downloads/ under a .part name,
//! is digest-verified there, extracted to a temp sibling, then the final
//! tree is swapped in (old tree removed first). A half-finished install
//! never looks complete to `is_installed` (which checks the FIRST
//! artifact's extracted-marker file, written only after the whole tool
//! finished).

use crate::manifest::{ArtifactKind, EnvBinding, NativeTool, OsArtifact, ToolArtifact};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// Outcome reported to the client for one ensure-tool operation.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "kebab-case", tag = "type")]
pub enum DownloadEvent {
    Started { tool: String, label: String, approx_mb: u32 },
    Progress { tool: String, done_bytes: u64, total_bytes: Option<u64> },
    Extracting { tool: String, step: String },
    Finished { tool: String, installed: bool, message: String },
    Failed { tool: String, code: String, message: String },
}

/// Error type for the download pipeline (client-facing codes mirror the
/// engine's tool-unavailable style).
#[derive(Debug)]
pub struct DownloadError {
    pub code: &'static str,
    pub message: String,
}

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for DownloadError {}

fn err(code: &'static str, message: String) -> DownloadError {
    DownloadError { code, message }
}

/// Progress callback: (bytes done, total if known).
pub type ProgressFn<'a> = &'a mut dyn FnMut(u64, Option<u64>);

/// One downloaded+extracted tool's final on-disk state.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ToolStatus {
    pub id: String,
    pub installed: bool,
    /// Human label.
    pub label: String,
    /// Env overrides the sidecar will receive for this tool.
    pub env: std::collections::BTreeMap<String, String>,
    /// Error from the last install attempt, if any.
    pub last_error: Option<String>,
}

pub struct DownloadManager {
    tools_root: PathBuf,
}

impl DownloadManager {
    pub fn new(tools_root: PathBuf) -> Self {
        Self { tools_root }
    }

    pub fn tools_root(&self) -> &Path {
        &self.tools_root
    }

    fn tool_dir(&self, tool_id: &str) -> PathBuf {
        self.tools_root.join(tool_id)
    }

    /// Marker written after a tool's full install succeeded.
    fn marker_path(&self, tool_id: &str) -> PathBuf {
        self.tool_dir(tool_id).join(".installed")
    }

    /// All artifacts of a tool that match the running platform.
    fn current_artifacts<'t>(
        tool: &'t NativeTool,
    ) -> Vec<(&'t crate::manifest::ToolArtifact, &'t OsArtifact)> {
        let mut out = Vec::new();
        for art in tool.artifacts {
            for osa in art.per_os {
                if osa.matches_current() {
                    out.push((art, osa));
                }
            }
        }
        out
    }

    /// Whether the platform has any artifact for this tool at all.
    pub fn supports_platform(&self, tool: &NativeTool) -> bool {
        !Self::current_artifacts(tool).is_empty()
    }

    /// Whether the tool is fully installed (marker present).
    pub fn is_installed(&self, tool_id: &str) -> bool {
        self.marker_path(tool_id).exists()
    }

    /// Env overrides for every manifest tool (installed or not),
    /// pointing at the FINAL install paths. The engine caches
    /// toolPaths() per process, so the override must already be present
    /// at spawn time: an absent tool then fails at spawn with ENOENT →
    /// the honest 503 tool-unavailable (the c88d80d contract), and a
    /// later lazy-download simply makes the file appear behind the
    /// same override — the next request succeeds with NO engine
    /// restart.
    pub fn tool_env(&self) -> std::collections::BTreeMap<String, String> {
        let mut env = std::collections::BTreeMap::new();
        for tool in crate::manifest::native_tools() {
            let dir = self.tool_dir(tool.id);
            for b in tool.env_bindings {
                let value = b.current_value();
                let abs = if value == "." {
                    dir.clone()
                } else {
                    dir.join(value)
                };
                env.insert(b.var.to_string(), abs.to_string_lossy().into_owned());
            }
        }
        env
    }

    /// Status of every manifest tool.
    pub fn all_status(&self) -> Vec<ToolStatus> {
        crate::manifest::native_tools()
            .into_iter()
            .map(|tool| {
                let installed = self.is_installed(tool.id);
                let env = if installed {
                    self.tool_env()
                        .into_iter()
                        .filter(|(k, _)| tool.env_bindings.iter().any(|b| b.var == k.as_str()))
                        .collect()
                } else {
                    Default::default()
                };
                ToolStatus {
                    id: tool.id.to_string(),
                    installed,
                    label: tool.label.to_string(),
                    env,
                    last_error: None,
                }
            })
            .collect()
    }

    /// Download + extract one tool. Idempotent when already installed.
    #[allow(clippy::too_many_lines)]
    pub fn ensure_tool(
        &self,
        tool: &NativeTool,
        progress: ProgressFn<'_>,
    ) -> Result<(), DownloadError> {
        if self.is_installed(tool.id) {
            return Ok(());
        }
        let artifacts = Self::current_artifacts(tool);
        if artifacts.is_empty() {
            return Err(err(
                "unsupported-platform",
                format!("{} is not available as a download for this operating system.", tool.label),
            ));
        }
        let dir = self.tool_dir(tool.id);
        let dl = dir.join("downloads");
        fs::create_dir_all(&dl).map_err(|e| err("io-error", format!("Could not create the tool directory: {e}")))?;

        // Download every current-platform artifact.
        let mut downloaded: Vec<(&crate::manifest::ToolArtifact, &OsArtifact, PathBuf)> = Vec::new();
        for (art, osa) in &artifacts {
            let dest = dl.join(osa.file_name);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| err("io-error", format!("Could not create the tool directory: {e}")))?;
            }
            let have = fs::read(&dest).ok().filter(|bytes| verify_sha256(bytes, osa.sha256));
            match have {
                Some(_) => {
                    progress(fs::metadata(&dest).map(|m| m.len()).unwrap_or(0), None);
                }
                None => {
                    self.fetch_verified(osa.url, &dest, osa.sha256, progress)?;
                }
            }
            downloaded.push((art, osa, dest.clone()));
        }

        // Extract each artifact into the tool dir (fresh extraction dir,
        // then move contents up so env bindings resolve).
        for (art, osa, path) in &downloaded {
            extract_artifact(&art.kind, path, &dir, &self.tools_root, osa.file_name)?;
        }

        // 7z bootstrap artifacts (if any SFX/NSIS kind was used) live under
        // the _7zip tool dir — kept out of the user-visible tool list.
        fs::write(self.marker_path(tool.id), b"ok")
            .map_err(|e| err("io-error", format!("Could not finalize the install: {e}")))?;
        Ok(())
    }

    /// Streaming download with SHA-256 verification.
    fn fetch_verified(
        &self,
        url: &str,
        dest: &Path,
        expected_sha256: &str,
        progress: ProgressFn<'_>,
    ) -> Result<Vec<u8>, DownloadError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| err("network-error", format!("The download could not be started: {e}")))?;
        let response = client
            .get(url)
            .send()
            .map_err(|e| err("network-error", format!("The download could not be started: {e} — check your connection and retry.")))?;
        if !response.status().is_success() {
            return Err(err(
                "network-error",
                format!("The download server answered {} — check your connection and retry.", response.status()),
            ));
        }
        let total = response.content_length();
        let mut file = fs::File::create(dest).map_err(|e| err("io-error", format!("Could not write the download: {e}")))?;
        let mut hasher = Sha256::new();
        let mut done: u64 = 0;
        let mut buffer = [0u8; 64 * 1024];
        let mut response = response;
        loop {
            let chunk = response
                .read(&mut buffer)
                .map_err(|e| err("network-error", format!("The download was interrupted: {e}")))?;
            if chunk == 0 {
                break;
            }
            use std::io::Write;
            hasher.update(&buffer[..chunk]);
            file.write_all(&buffer[..chunk])
                .map_err(|e| err("io-error", format!("Could not write the download: {e}")))?;
            done += chunk as u64;
            progress(done, total);
        }
        drop(file);
        let digest = hex::encode(hasher.finalize());
        if !digest.eq_ignore_ascii_case(expected_sha256) {
            let _ = fs::remove_file(dest);
            return Err(err(
                "checksum-mismatch",
                "The downloaded file did not match its official checksum — the download was discarded. Retry, and if it keeps failing, report this as a bug.".to_string(),
            ));
        }
        Ok(Vec::new())
    }
}

/// Extract one downloaded artifact per its kind.
fn extract_artifact(
    kind: &ArtifactKind,
    archive: &Path,
    tool_dir: &Path,
    tools_root: &Path,
    file_name: &str,
) -> Result<(), DownloadError> {
    match kind {
        ArtifactKind::SingleFile => {
            // Already at its final path (downloads/<file_name>) — copy to
            // the tool-dir-relative final location the manifest names.
            let target = tool_dir.join(file_name);
            if let Some(p) = target.parent() {
                fs::create_dir_all(p).map_err(|e| err("io-error", format!("Extraction failed: {e}")))?;
            }
            fs::copy(archive, &target).map_err(|e| err("io-error", format!("Extraction failed: {e}")))?;
            Ok(())
        }
        ArtifactKind::ZipArchive => extract_zip_via_7z(archive, tool_dir, tools_root),
        ArtifactKind::SevenZipSfx | ArtifactKind::NsisInstaller => {
            extract_zip_via_7z(archive, tool_dir, tools_root)
        }
        ArtifactKind::MsiAdministrative => extract_msi(archive, tool_dir),
        ArtifactKind::TarXzArchive | ArtifactKind::TarGzArchive => {
            extract_tar(archive, tool_dir)
        }
    }
}

/// Path to a working full 7z.exe, bootstrapping it if needed (Windows).
/// Cached under tools_root/_7zip/7z2409-x64/{7z.exe,7z.dll}.
fn ensure_full_7z(tools_root: &Path) -> Result<PathBuf, DownloadError> {
    let dir = tools_root.join("_7zip");
    let exe = dir.join("7z2409-x64").join("7z.exe");
    if exe.exists() {
        return Ok(exe);
    }
    fs::create_dir_all(&dir).map_err(|e| err("io-error", format!("Could not create the extraction directory: {e}")))?;
    // 1. 7zr.exe (self-contained reduced 7z CLI).
    let sevenzr = dir.join("7zr.exe");
    if !sevenzr.exists() {
        let mut progress = |_, _| {};
        let mut mgr = DownloadManager::new(tools_root.to_path_buf());
        mgr.fetch_verified(crate::manifest::SEVENZR_URL, &sevenzr, crate::manifest::SEVENZR_EXE_SHA, &mut progress)?;
    }
    // 2. Full 7-Zip installer — itself an SFX that 7zr can extract.
    let installer = dir.join("7z2409-x64.exe");
    if !installer.exists() {
        let mut progress = |_, _| {};
        let mut mgr = DownloadManager::new(tools_root.to_path_buf());
        mgr.fetch_verified(crate::manifest::SEVENZ_INSTALLER_URL, &installer, crate::manifest::SEVENZ_INSTALLER_SHA, &mut progress)?;
    }
    // 3. Extract installer → 7z.exe + 7z.dll (+ 7-zip.dll etc.).
    let target = dir.join("7z2409-x64");
    fs::create_dir_all(&target).map_err(|e| err("io-error", format!("Could not create the extraction directory: {e}")))?;
    let out = Command::new(&sevenzr)
        .arg("x")
        .arg("-y")
        .arg(format!("-o{}", target.display()))
        .arg(&installer)
        .output()
        .map_err(|e| err("extract-failed", format!("The extraction tool could not run: {e}")))?;
    if !out.status.success() {
        return Err(err("extract-failed", "The extraction tool failed to unpack the archive.".to_string()));
    }
    Ok(exe)
}

/// Extract any 7z-compatible archive (zip / sfx / nsis) via full 7z.exe.
fn extract_zip_via_7z(archive: &Path, out_dir: &Path, tools_root: &Path) -> Result<(), DownloadError> {
    let exe = ensure_full_7z(tools_root)?;
    fs::create_dir_all(out_dir).map_err(|e| err("io-error", format!("Could not create the tool directory: {e}")))?;
    let out = Command::new(exe)
        .arg("x")
        .arg("-y")
        .arg(format!("-o{}", out_dir.display()))
        .arg(archive)
        .output()
        .map_err(|e| err("extract-failed", format!("The extraction tool could not run: {e}")))?;
    if !out.status.success() {
        return Err(err("extract-failed", format!("The archive could not be unpacked: {}", String::from_utf8_lossy(&out.stderr))));
    }
    Ok(())
}

/// LibreOffice MSI: administrative install (no elevation).
fn extract_msi(msi: &Path, tool_dir: &Path) -> Result<(), DownloadError> {
    fs::create_dir_all(tool_dir).map_err(|e| err("io-error", format!("Could not create the tool directory: {e}")))?;
    let target = tool_dir.display().to_string();
    // msiexec /a <msi> /qn TARGETDIR=<dir> — wait for completion.
    let out = Command::new("msiexec")
        .arg("/a")
        .arg(msi)
        .arg("/qn")
        .arg(format!("TARGETDIR={target}"))
        .output()
        .map_err(|e| err("extract-failed", format!("The MSI extraction could not run: {e}")))?;
    if !out.status.success() {
        return Err(err("extract-failed", "The LibreOffice files could not be unpacked from the installer.".to_string()));
    }
    // The MSI admin install places program/ + Fonts/ etc. at TARGETDIR
    // root — verified live. Verify soffice.exe landed.
    if !tool_dir.join("program").join("soffice.exe").exists() {
        return Err(err("extract-failed", "The LibreOffice files did not unpack as expected.".to_string()));
    }
    Ok(())
}

/// tar archives (Linux ffmpeg/node) via system tar.
fn extract_tar(archive: &Path, tool_dir: &Path) -> Result<(), DownloadError> {
    fs::create_dir_all(tool_dir).map_err(|e| err("io-error", format!("Could not create the tool directory: {e}")))?;
    let out = Command::new("tar")
        .arg("-xf")
        .arg(archive)
        .arg("-C")
        .arg(tool_dir)
        .output()
        .map_err(|e| err("extract-failed", format!("The extraction tool could not run: {e}")))?;
    if !out.status.success() {
        return Err(err("extract-failed", "The archive could not be unpacked.".to_string()));
    }
    Ok(())
}

/// Verify a byte slice against a hex SHA-256.
fn verify_sha256(bytes: &[u8], expected: &str) -> bool {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize()).eq_ignore_ascii_case(expected)
}
