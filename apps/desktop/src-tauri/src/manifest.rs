//! Native-tool download manifest (PROJECT_SPEC Section 10 Tier 1 + Phase 10;
//! DECISIONS.md D-034: pinned URLs + SHA-256 per the D-030 doctrine).
//!
//! Every artifact the desktop app can lazy-download is declared here with
//! its exact source URL and pinned SHA-256. Digests verified live at pin
//! time (2026-09-09) — never memory:
//!  - yt-dlp:         official SHA2-256SUMS, tag 2026.08.19 (same pin the
//!                    repo-local dev install uses, D-025)
//!  - ffmpeg (BtbN):  official checksums.sha256, n9.0 gpl builds (same
//!                    pin as the repo-local dev install, D-020)
//!  - eng.traineddata: downloaded + sha256sum'd live (tessdata_fast)
//!  - Piper:          rhasspy/piper 2023.11.14-2 (releases carry no
//!                    upstream checksums — OUR pin is the verification,
//!                    same as the Docker install, D-030)
//!  - Ghostscript / Tesseract / LibreOffice / 7-Zip / qpdf: downloaded
//!                    live this session and hashed (these formats ship
//!                    no usable upstream checksum file; our pin is the
//!                    verification).
//!
//! Extraction strategies (all probed live on this host, 2026-09-09):
//!  - Ghostscript gs10080w64.exe: 7z SFX — extracted by full 7z.exe
//!  - Tesseract 5.5.3 setup .exe: NSIS container — extracted by full
//!    7z.exe; yields tesseract.exe + dlls + tessdata/configs (NO
//!    traineddata — eng.traineddata is a separate artifact)
//!  - 7z bootstrap: 7zr.exe (7-zip.org) extracts 7z2409-x64.exe, whose
//!    7z.exe + 7z.dll handle the SFX/NSIS containers above
//!  - LibreOffice MSI: `msiexec /a` administrative install to a target
//!    dir — extracts the full app tree with NO elevation; yields
//!    program/soffice.exe at the install root
//!  - ffmpeg / piper / qpdf zips: plain zip archives
//!  - Linux: yt-dlp single binary; ffmpeg tar.xz; piper tar.gz (root
//!    dir piper/); qpdf bin zip. Ghostscript/Tesseract/LibreOffice have
//!    no official portable Linux artifact — not offered for lazy
//!    download on Linux desktop (DECISIONS.md D-036); the engine still
//!    honors LOCALTOOLS_*_PATH if the user installed via their distro.
//!
//! Layout: each tool installs under
//!   <app_data_dir>/localtools-tools/<tool-id>/
//! (original archives kept under downloads/ for provenance) and the
//! shell pre-points the engine's LOCALTOOLS_*_PATH overrides at the
//! final absolute paths when spawning the sidecar. A missing tool
//! therefore surfaces as the engine's honest 503 tool-unavailable
//! (spawn ENOENT at call time), and once downloaded the very next
//! request succeeds — the engine's per-process path cache never needs
//! invalidating because the override string was already correct; only
//! the file behind it appears.

use serde::{Deserialize, Serialize};
use std::env::consts::{ARCH, OS};

/// How a downloaded artifact becomes an on-disk tree the engine can use.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ArtifactKind {
    /// Single file used as-is at its final relative path.
    SingleFile,
    /// Zip archive extracted into the tool dir (7z.exe on Windows).
    ZipArchive,
    /// Windows 7z self-extracting installer (Ghostscript) — a 7z archive
    /// behind a PE stub; scoop's ghostscript.json extracts it the same
    /// way. Extracted with the full 7z.exe after the 7zr bootstrap.
    SevenZipSfx,
    /// NSIS installer container (Tesseract UB-Mannheim lineage) —
    /// extracted with the full 7z.exe, no setup run, no elevation.
    NsisInstaller,
    /// Windows MSI (LibreOffice) — administrative install
    /// (`msiexec /a <msi> /qn TARGETDIR=…`) extracts the file tree
    /// without elevation (the documented portable-MSI technique,
    /// verified live).
    MsiAdministrative,
    /// tar.xz archive (Linux ffmpeg) — system tar + xz.
    TarXzArchive,
    /// tar.gz archive (Linux Piper) — system tar.
    TarGzArchive,
}

/// One pinned downloadable file, for one OS/arch.
#[derive(Debug, Clone, Serialize)]
pub struct OsArtifact {
    /// "windows" | "linux" | "macos" — must match std::env::consts::OS.
    pub os: &'static str,
    /// "x86_64" | "aarch64" — std::env::consts::ARCH.
    pub arch: &'static str,
    /// Pinned download URL.
    pub url: &'static str,
    /// Pinned SHA-256 (hex, lowercase) — verification, not advisory.
    pub sha256: &'static str,
    /// Final file name (relative path allowed) inside the tool dir.
    pub file_name: &'static str,
}

impl OsArtifact {
    /// True when this artifact targets the running platform.
    pub fn matches_current(&self) -> bool {
        self.os == OS && self.arch == ARCH
    }
}

/// The engine env var a downloaded tool feeds (tool-paths.ts, order #1).
#[derive(Debug, Clone, Serialize)]
pub struct EnvBinding {
    /// e.g. LOCALTOOLS_GS_PATH.
    pub var: &'static str,
    /// Relative path inside the tool dir, Windows layout.
    pub windows: &'static str,
    /// Relative path inside the tool dir, Linux layout.
    pub linux: &'static str,
}

impl EnvBinding {
    /// The value for the running OS.
    pub fn current_value(&self) -> &'static str {
        if OS == "windows" {
            self.windows
        } else {
            self.linux
        }
    }
}

/// One downloadable component of a tool.
#[derive(Debug, Clone, Serialize)]
pub struct ToolArtifact {
    pub id: &'static str,
    pub label: &'static str,
    /// Approximate download size in MB (prompt copy: "~30MB").
    pub approx_mb: u32,
    pub kind: ArtifactKind,
    pub per_os: &'static [OsArtifact],
}

/// A native tool the desktop app manages end-to-end: one friendly prompt,
/// one or more pinned artifacts, zero or more engine env overrides.
#[derive(Debug, Clone, Serialize)]
pub struct NativeTool {
    /// Stable id (client download prompts + install-dir name).
    pub id: &'static str,
    /// Human label.
    pub label: &'static str,
    /// Spec line 362-style one-time prompt copy shown by the client.
    pub prompt_copy: &'static str,
    /// Every artifact of the tool — downloading the tool fetches every
    /// artifact matching the current OS (in listed order).
    pub artifacts: &'static [ToolArtifact],
    /// LOCALTOOLS_*_PATH overrides for the engine sidecar.
    pub env_bindings: &'static [EnvBinding],
}

// ---------------------------------------------------------------------------
// Pinned digests — every value verified live 2026-09-09 (see module doc).
// ---------------------------------------------------------------------------

pub const YTDLP_EXE_SHA: &str = "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a";
pub const YTDLP_LINUX_SHA: &str = "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a";
pub const FFMPEG_WIN_ZIP_SHA: &str = "a892d31285fe71430e3f7bceccf8793054333710d86956b074c3dfabd3d00b6f";
pub const FFMPEG_LINUX_SHA: &str = "6640ae9c16ebd6e6428a38a131a694b49840963aeb352eea617e671bd186729e";
pub const ENG_TRAINEDDATA_SHA: &str = "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2";
pub const PIPER_WIN_ZIP_SHA: &str = "f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea";
pub const PIPER_LINUX_SHA: &str = "a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992";
// Installer-format artifacts hashed live this session (2026-09-09; no
// usable upstream checksum files for these — our pin is the verification).
pub const GHOSTSCRIPT_SFX_SHA: &str = "52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50";
pub const TESSERACT_SETUP_SHA: &str = "bee9e3434bd94fd65387d9be28cd467a41f61b1275383b55b0f59a1331270ae4";
// 7-Zip extraction bootstrap chain (7-zip.org publishes no signed
// manifest — digests below were taken by live download + sha256sum).
pub const SEVENZR_EXE_SHA: &str = "ad4c82fadcbdf93c03b4fc440f300509c7d60c5c2f4d183e35d9d70d6957037d";
pub const SEVENZ_INSTALLER_SHA: &str = "bdd1a33de78618d16ee4ce148b849932c05d0015491c34887846d431d29f308e";
pub const LIBREOFFICE_MSI_SHA: &str = "ecdb65e76f5e91dc198b8c8dce5b5d6e1eb12fea6023553e52b591afd10b619d";
pub const QPDF_WIN_ZIP_SHA: &str = "6a47eeddc8ff712a6e003314daae25569402c6e904ba82b7b9181d7b0301b689";
pub const QPDF_LINUX_ZIP_SHA: &str = "db9122e88ec00c76ac6a14e09ffb92406db1773d47b968911ff6e69f28c09bf9";

// ---------------------------------------------------------------------------
// The manifest. Static slices of consts (all 'static by construction —
// the E0716 temporaries are avoided by referencing named consts only).
// ---------------------------------------------------------------------------

/// Windows + Linux yt-dlp artifacts.
static YTDLP_ARTIFACTS: [OsArtifact; 2] = [
    OsArtifact {
        os: "windows",
        arch: "x86_64",
        url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe",
        sha256: YTDLP_EXE_SHA,
        file_name: "yt-dlp.exe",
    },
    OsArtifact {
        os: "linux",
        arch: "x86_64",
        url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux",
        sha256: YTDLP_LINUX_SHA,
        file_name: "yt-dlp",
    },
];

static YTDLP_TOOL_ARTIFACTS: [ToolArtifact; 1] = [ToolArtifact {
    id: "yt-dlp",
    label: "yt-dlp 2026.08.19",
    approx_mb: 30,
    kind: ArtifactKind::SingleFile,
    per_os: &YTDLP_ARTIFACTS,
}];

static YTDLP_ENV: [EnvBinding; 1] = [EnvBinding {
    var: "LOCALTOOLS_YTDLP_PATH",
    windows: "yt-dlp.exe",
    linux: "yt-dlp",
}];

static FFMPEG_ARTIFACTS: [OsArtifact; 2] = [
    OsArtifact {
        os: "windows",
        arch: "x86_64",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-gpl-9.0.zip",
        sha256: FFMPEG_WIN_ZIP_SHA,
        file_name: "ffmpeg-win64.zip",
    },
    OsArtifact {
        os: "linux",
        arch: "x86_64",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-linux64-gpl-9.0.tar.xz",
        sha256: FFMPEG_LINUX_SHA,
        file_name: "ffmpeg-linux64.tar.xz",
    },
];

static FFMPEG_TOOL_ARTIFACTS: [ToolArtifact; 1] = [ToolArtifact {
    id: "ffmpeg",
    label: "ffmpeg n9.0 (BtbN GPL static)",
    approx_mb: 90,
    kind: ArtifactKind::ZipArchive,
    per_os: &FFMPEG_ARTIFACTS,
}];

static FFMPEG_ENV: [EnvBinding; 2] = [
    EnvBinding {
        var: "LOCALTOOLS_FFMPEG_PATH",
        windows: "ffmpeg-n9.0-latest-win64-gpl-9.0/bin/ffmpeg.exe",
        linux: "ffmpeg-n9.0-latest-linux64-gpl-9.0/bin/ffmpeg",
    },
    EnvBinding {
        var: "LOCALTOOLS_FFPROBE_PATH",
        windows: "ffmpeg-n9.0-latest-win64-gpl-9.0/bin/ffprobe.exe",
        linux: "ffmpeg-n9.0-latest-linux64-gpl-9.0/bin/ffprobe",
    },
];

static PIPER_ARTIFACTS: [OsArtifact; 2] = [
    OsArtifact {
        os: "windows",
        arch: "x86_64",
        url: "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
        sha256: PIPER_WIN_ZIP_SHA,
        file_name: "piper-win.zip",
    },
    OsArtifact {
        os: "linux",
        arch: "x86_64",
        url: "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz",
        sha256: PIPER_LINUX_SHA,
        file_name: "piper-linux.tar.gz",
    },
];

static PIPER_TOOL_ARTIFACTS: [ToolArtifact; 1] = [ToolArtifact {
    id: "piper",
    label: "Piper 2023.11.14-2",
    approx_mb: 26,
    kind: ArtifactKind::ZipArchive,
    per_os: &PIPER_ARTIFACTS,
}];

static PIPER_ENV: [EnvBinding; 1] = [EnvBinding {
    var: "LOCALTOOLS_PIPER_PATH",
    windows: "piper/piper.exe",
    linux: "piper/piper",
}];

static GS_ARTIFACTS: [OsArtifact; 1] = [OsArtifact {
    os: "windows",
    arch: "x86_64",
    url: "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10080/gs10080w64.exe",
    sha256: GHOSTSCRIPT_SFX_SHA,
    file_name: "gs10080w64.exe",
}];

static GS_TOOL_ARTIFACTS: [ToolArtifact; 1] = [ToolArtifact {
    id: "ghostscript-win",
    label: "Ghostscript 10.08.0",
    approx_mb: 28,
    kind: ArtifactKind::SevenZipSfx,
    per_os: &GS_ARTIFACTS,
}];

static GS_ENV: [EnvBinding; 1] = [EnvBinding {
    var: "LOCALTOOLS_GS_PATH",
    windows: "bin/gswin64c.exe",
    linux: "gs",
}];

static TESSERACT_ARTIFACTS: [ToolArtifact; 2] = [
    ToolArtifact {
        id: "tesseract-win",
        label: "Tesseract 5.5.3",
        approx_mb: 26,
        kind: ArtifactKind::NsisInstaller,
        per_os: &[OsArtifact {
            os: "windows",
            arch: "x86_64",
            url: "https://github.com/tesseract-ocr/tesseract/releases/download/5.5.3/tesseract-ocr-w64-setup-5.5.3.20260724.exe",
            sha256: TESSERACT_SETUP_SHA,
            file_name: "tesseract-setup.exe",
        }],
    },
    ToolArtifact {
        id: "eng-traineddata",
        label: "English OCR language data",
        approx_mb: 4,
        kind: ArtifactKind::SingleFile,
        per_os: &[OsArtifact {
            os: "windows",
            arch: "x86_64",
            url: "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata",
            sha256: ENG_TRAINEDDATA_SHA,
            file_name: "tessdata/eng.traineddata",
        }],
    },
];

static TESSERACT_ENV: [EnvBinding; 2] = [
    EnvBinding {
        var: "LOCALTOOLS_TESSERACT_PATH",
        windows: "tesseract.exe",
        linux: "tesseract",
    },
    EnvBinding {
        var: "LOCALTOOLS_TESSDATA_PATH",
        windows: "tessdata",
        linux: "tessdata",
    },
];

static LO_ARTIFACTS: [OsArtifact; 1] = [OsArtifact {
    os: "windows",
    arch: "x86_64",
    url: "https://download.documentfoundation.org/libreoffice/stable/25.8.7/win/x86_64/LibreOffice_25.8.7_Win_x86-64.msi",
    sha256: LIBREOFFICE_MSI_SHA,
    file_name: "LibreOffice_25.8.7_Win_x86-64.msi",
}];

static LO_TOOL_ARTIFACTS: [ToolArtifact; 1] = [ToolArtifact {
    id: "libreoffice-win",
    label: "LibreOffice 25.8.7",
    approx_mb: 350,
    kind: ArtifactKind::MsiAdministrative,
    per_os: &LO_ARTIFACTS,
}];

static LO_ENV: [EnvBinding; 1] = [EnvBinding {
    var: "LOCALTOOLS_SOFFICE_PATH",
    windows: "program/soffice.exe",
    linux: "soffice",
}];

static QPDF_ARTIFACTS: [OsArtifact; 2] = [
    OsArtifact {
        os: "windows",
        arch: "x86_64",
        url: "https://github.com/qpdf/qpdf/releases/download/v12.4.1/qpdf-12.4.1-mingw64.zip",
        sha256: QPDF_WIN_ZIP_SHA,
        file_name: "qpdf-mingw64.zip",
    },
    OsArtifact {
        os: "linux",
        arch: "x86_64",
        url: "https://github.com/qpdf/qpdf/releases/download/v12.4.1/qpdf-12.4.1-bin-linux-x86_64.zip",
        sha256: QPDF_LINUX_ZIP_SHA,
        file_name: "qpdf-linux.zip",
    },
];

static QPDF_TOOL_ARTIFACTS: [ToolArtifact; 1] = [ToolArtifact {
    id: "qpdf",
    label: "qpdf 12.4.1",
    approx_mb: 5,
    kind: ArtifactKind::ZipArchive,
    per_os: &QPDF_ARTIFACTS,
}];

// RESERVED, NOT WIRED (D-035 / external review N1): the engine's qpdf
// fallback resolution does not yet consume LOCALTOOLS_QPDF_PATH
// (tool-paths.ts has no qpdf entry). The binding ships so the artifact
// is downloaded + cached for when the fallback lands; setting it today
// has no effect. See DECISIONS.md D-035.
static QPDF_ENV: [EnvBinding; 1] = [EnvBinding {
    var: "LOCALTOOLS_QPDF_PATH",
    windows: "qpdf-12.4.1-mingw64/bin/qpdf.exe",
    linux: "qpdf-12.4.1/bin/qpdf",
}];

/// The full lazy-download manifest (one entry per managed tool).
pub fn native_tools() -> Vec<NativeTool> {
    vec![
        NativeTool {
            id: "ghostscript",
            label: "Ghostscript",
            prompt_copy: "Deep compression, PDF/A conversion and deep repair need Ghostscript — a small one-time download (~28MB) that keeps working offline afterwards.",
            artifacts: &GS_TOOL_ARTIFACTS,
            env_bindings: &GS_ENV,
        },
        NativeTool {
            id: "tesseract",
            label: "Tesseract OCR",
            prompt_copy: "Making scanned PDFs searchable needs Tesseract OCR — a one-time download (~30MB) that keeps working offline afterwards.",
            artifacts: &TESSERACT_ARTIFACTS,
            env_bindings: &TESSERACT_ENV,
        },
        NativeTool {
            id: "libreoffice",
            label: "LibreOffice",
            prompt_copy: "Converting between PDF and Word/Excel/PowerPoint needs LibreOffice — a one-time download (~350MB) that keeps working offline afterwards.",
            artifacts: &LO_TOOL_ARTIFACTS,
            env_bindings: &LO_ENV,
        },
        NativeTool {
            id: "yt-dlp",
            label: "yt-dlp",
            prompt_copy: "Downloading videos needs yt-dlp — a small one-time download (~30MB) that keeps working offline afterwards.",
            artifacts: &YTDLP_TOOL_ARTIFACTS,
            env_bindings: &YTDLP_ENV,
        },
        NativeTool {
            id: "ffmpeg",
            label: "ffmpeg",
            prompt_copy: "Media conversion and compression need ffmpeg — a one-time download (~90MB) that keeps working offline afterwards.",
            artifacts: &FFMPEG_TOOL_ARTIFACTS,
            env_bindings: &FFMPEG_ENV,
        },
        NativeTool {
            id: "piper",
            label: "Piper TTS",
            prompt_copy: "Turning text into speech needs Piper — a small one-time download (~26MB) that keeps working offline afterwards.",
            artifacts: &PIPER_TOOL_ARTIFACTS,
            env_bindings: &PIPER_ENV,
        },
        NativeTool {
            id: "qpdf",
            label: "qpdf",
            // v1 consumers: none yet — the engine's qpdf-wasm path covers
            // every shipped qpdf-backed tool (DECISIONS.md D-035 records
            // the "qpdf fallback" interpretation). Plumbing ships so a
            // future engine fallback endpoint adopts it with zero new
            // download mechanism.
            prompt_copy: "Advanced PDF security operations need qpdf — a small one-time download (~5MB) that keeps working offline afterwards.",
            artifacts: &QPDF_TOOL_ARTIFACTS,
            env_bindings: &QPDF_ENV,
        },
    ]
}

/// Look up one tool by id.
pub fn tool_by_id(id: &str) -> Option<NativeTool> {
    native_tools().into_iter().find(|t| t.id == id)
}

/// The 7-Zip bootstrap chain (Windows only) used by SevenZipSfx and
/// NsisInstaller extraction. Fetched automatically on first need and
/// cached under the tools root — never part of a user-facing prompt.
pub const SEVENZR_URL: &str = "https://www.7-zip.org/a/7zr.exe";
pub const SEVENZ_INSTALLER_URL: &str = "https://www.7-zip.org/a/7z2409-x64.exe";
