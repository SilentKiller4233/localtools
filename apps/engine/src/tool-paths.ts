/**
 * Native tool binary resolution.
 *
 * Environments: dev machines (tools on PATH or in default install dirs),
 * the Docker image (Debian packages at fixed paths), and the future Tauri
 * sidecar (env overrides). Resolution order per tool:
 *   1. LOCALTOOLS_<TOOL>_PATH env override (exact executable)
 *   2. Docker/dev default locations (when they exist)
 *   3. PATH lookup via spawn (surfaced as tool-unavailable on ENOENT)
 */

import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const IS_WIN = platform() === 'win32';

/**
 * Monorepo root (repo/), derived from this module's own location so it is
 * independent of process.cwd() (vitest/turbo run from workspace dirs).
 * Outside the repo checkout (Docker image), parent-of-apps doesn't exist
 * and the portable-install candidates simply fail the exists() probe.
 */
const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

/** Candidate dir for dev-machine portable installs (Ghostscript/GTK). */
function portableDir(): string {
  return join(REPO_ROOT, 'gs10.07.1', 'bin');
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function envPath(name: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : undefined;
}

/** Windows LibreOffice installer default. */
const WIN_SOFFICE = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';

export interface ToolPaths {
  /** Ghostscript executable (gswin64c on Windows, gs elsewhere). */
  gs: string;
  /** LibreOffice headless entrypoint. */
  soffice: string;
  /** Tesseract core OCR executable. */
  tesseract: string;
  /** Tesseract language data dir (tessdata). */
  tessdata: string;
  /** OCRmyPDF executable, when installed (optional primary OCR path). */
  ocrmypdf: string | undefined;
  /** WeasyPrint executable + fixed leading args, when installed. */
  weasyprint: { exe: string; args: string[] } | undefined;
  /** Whether Playwright rendering is enabled on this host (opt-in). */
  playwrightEnabled: boolean;
  /** ffmpeg + ffprobe executables (Media suite Group B engine). */
  ffmpeg: FfmpegPaths;
  /** yt-dlp executable (Media suite Group C downloader, Phase 8). */
  ytdlp: string;
  /** Piper TTS executable (Media speech, Phase 9). */
  piper: string;
}

/** ffmpeg/ffprobe pair (Phase 7 media Group B). */
export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
}

/**
 * Resolve all native tool paths. `extra` lets callers (tests) inject
 * candidate locations.
 */
export async function resolveToolPaths(): Promise<ToolPaths> {
  const gs = await resolveGs();
  const soffice = await resolveSoffice();
  const { tesseract, tessdata } = await resolveTesseract();
  const ocrmypdf = await resolveOcrmypdf();
  const weasyprint = await resolveWeasyprint();
  const ffmpeg = await resolveFfmpeg();
  const ytdlp = await resolveYtDlp();
  const piper = await resolvePiper();
  return {
    gs,
    soffice,
    tesseract,
    tessdata,
    ocrmypdf,
    weasyprint,
    playwrightEnabled: process.env['LOCALTOOLS_PLAYWRIGHT_ENABLED'] === 'true',
    ffmpeg,
    ytdlp,
    piper,
  };
}

/**
 * Piper TTS resolution (Phase 9, D-030), same order as yt-dlp:
 *  1. LOCALTOOLS_PIPER_PATH env override
 *  2. repo-local portable build (piper-<tag>/piper[.exe], gitignored)
 *  3. Docker image install (/opt/piper/piper — SHA-pinned tarball)
 *  4. PATH lookup (surfaced as tool-unavailable on ENOENT at call time)
 */
async function resolvePiper(): Promise<string> {
  const override = envPath('LOCALTOOLS_PIPER_PATH');
  if (override !== undefined) return override;
  // Repo-local portable install: piper-<tag>/piper.exe (win) or piper.
  const { readdir } = await import('node:fs/promises');
  try {
    const entries = await readdir(REPO_ROOT);
    const dir = entries
      .filter((e) => /^piper-\d/.test(e))
      .sort()
      .at(-1);
    if (dir !== undefined) {
      const exe = IS_WIN ? 'piper.exe' : 'piper';
      const candidate = join(REPO_ROOT, dir, exe);
      if (await exists(candidate)) return candidate;
    }
  } catch {
    // fall through to fixed defaults + PATH
  }
  if (await exists('/opt/piper/piper')) return '/opt/piper/piper';
  return 'piper';
}

/**
 * yt-dlp resolution (Phase 8), same order as ffmpeg (Section 5.3):
 *  1. LOCALTOOLS_YTDLP_PATH env override
 *  2. repo-local portable build (yt-dlp-<tag>/yt-dlp[.exe], gitignored)
 *  3. Docker/apt default (/usr/bin/yt-dlp, /usr/local/bin/yt-dlp)
 *  4. PATH lookup (surfaced as tool-unavailable on ENOENT at call time)
 */
async function resolveYtDlp(): Promise<string> {
  const override = envPath('LOCALTOOLS_YTDLP_PATH');
  if (override !== undefined) return override;
  // Repo-local portable install: yt-dlp-<tag>/yt-dlp.exe (win) or yt-dlp.
  const { readdir } = await import('node:fs/promises');
  try {
    const entries = await readdir(REPO_ROOT);
    const dir = entries
      .filter((e) => /^yt-dlp-\d/.test(e))
      .sort()
      .at(-1);
    if (dir !== undefined) {
      const exe = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
      const candidate = join(REPO_ROOT, dir, exe);
      if (await exists(candidate)) return candidate;
    }
  } catch {
    // fall through to fixed defaults + PATH
  }
  if (await exists('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';
  if (await exists('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
  return 'yt-dlp';
}

/**
 * ffmpeg/ffprobe resolution (Phase 7):
 *  1. LOCALTOOLS_FFMPEG_PATH / LOCALTOOLS_FFPROBE_PATH env overrides
 *  2. repo-local portable build (ffmpeg-<ver> dir, gitignored like Ghostscript)
 *  3. Docker/dev defaults (/usr/bin/ffmpeg, /usr/local/bin/ffmpeg)
 *  4. PATH lookup (surfaced as tool-unavailable on ENOENT at call time)
 */
async function resolveFfmpeg(): Promise<FfmpegPaths> {
  const ffmpegOverride = envPath('LOCALTOOLS_FFMPEG_PATH');
  const ffprobeOverride = envPath('LOCALTOOLS_FFPROBE_PATH');
  if (ffmpegOverride !== undefined) {
    return {
      ffmpeg: ffmpegOverride,
      ffprobe: ffprobeOverride ?? join(ffmpegOverride, '..', 'ffprobe'),
    };
  }
  if (ffprobeOverride !== undefined) {
    return { ffmpeg: 'ffmpeg', ffprobe: ffprobeOverride };
  }
  // Repo-local portable build: ffmpeg-n<ver>-latest-win64-gpl-<ver>/bin.
  const { readdir } = await import('node:fs/promises');
  try {
    const entries = await readdir(REPO_ROOT);
    const dir = entries
      .filter((e) => e.startsWith('ffmpeg-'))
      .sort()
      .at(-1);
    if (dir !== undefined) {
      const bin = join(REPO_ROOT, dir, 'bin');
      const exe = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg';
      const probe = IS_WIN ? 'ffprobe.exe' : 'ffprobe';
      if ((await exists(join(bin, exe))) && (await exists(join(bin, probe)))) {
        return { ffmpeg: join(bin, exe), ffprobe: join(bin, probe) };
      }
    }
  } catch {
    // fall through to fixed defaults + PATH
  }
  if (await exists('/usr/bin/ffmpeg'))
    return { ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe' };
  if (await exists('/usr/local/bin/ffmpeg'))
    return { ffmpeg: '/usr/local/bin/ffmpeg', ffprobe: '/usr/local/bin/ffprobe' };
  return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
}

async function resolveGs(): Promise<string> {
  const override = envPath('LOCALTOOLS_GS_PATH');
  if (override !== undefined) return override;
  if (IS_WIN) {
    const portable = join(portableDir(), 'gswin64c.exe');
    if (await exists(portable)) return portable;
    // Newest installed version under Program Files (gs10.xx[.yy]).
    const dir = 'C:\\Program Files\\gs';
    try {
      const { readdir } = await import('node:fs/promises');
      const versions = (await readdir(dir))
        .filter((v) => v.startsWith('gs10'))
        .sort()
        .reverse();
      for (const v of versions) {
        const candidate = join(dir, v, 'bin', 'gswin64c.exe');
        if (await exists(candidate)) return candidate;
      }
    } catch {
      // no gs dir — fall through to PATH
    }
  } else if (await exists('/usr/bin/gs')) return '/usr/bin/gs';
  return IS_WIN ? 'gswin64c' : 'gs';
}

async function resolveSoffice(): Promise<string> {
  const override = envPath('LOCALTOOLS_SOFFICE_PATH');
  if (override !== undefined) return override;
  if (IS_WIN) {
    if (await exists(WIN_SOFFICE)) return WIN_SOFFICE;
  } else {
    if (await exists('/usr/bin/soffice')) return '/usr/bin/soffice';
    if (await exists('/opt/libreoffice/program/soffice')) return '/opt/libreoffice/program/soffice';
  }
  return 'soffice';
}

async function resolveTesseract(): Promise<{ tesseract: string; tessdata: string }> {
  const exeOverride = envPath('LOCALTOOLS_TESSERACT_PATH');
  const dataOverride = envPath('LOCALTOOLS_TESSDATA_PATH');
  const winDefault = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  const linuxDefault = '/usr/bin/tesseract';
  let tesseract = IS_WIN ? 'tesseract' : 'tesseract';
  if (exeOverride !== undefined) tesseract = exeOverride;
  else if (IS_WIN && (await exists(winDefault))) tesseract = winDefault;
  else if (!IS_WIN && (await exists(linuxDefault))) tesseract = linuxDefault;
  const tessdata =
    dataOverride ??
    (IS_WIN
      ? tesseract.endsWith('tesseract.exe')
        ? join(tesseract, '..', 'tessdata')
        : 'C:\\Program Files\\Tesseract-OCR\\tessdata'
      : '/usr/share/tesseract-ocr/5/tessdata');
  return { tesseract, tessdata };
}

async function resolveOcrmypdf(): Promise<string | undefined> {
  const override = envPath('LOCALTOOLS_OCRMYPDF_PATH');
  if (override !== undefined) return override;
  if (await exists('/usr/bin/ocrmypdf')) return '/usr/bin/ocrmypdf';
  return undefined;
}

async function resolveWeasyprint(): Promise<{ exe: string; args: string[] } | undefined> {
  const override = envPath('LOCALTOOLS_WEASYPRINT_PATH');
  if (override !== undefined) return { exe: override, args: [] };
  // Linux/Docker: system weasyprint CLI.
  if (await exists('/usr/local/bin/weasyprint'))
    return { exe: '/usr/local/bin/weasyprint', args: [] };
  if (await exists('/usr/bin/weasyprint')) return { exe: '/usr/bin/weasyprint', args: [] };
  // Windows dev machine: the launcher script adds the portable GTK runtime
  // to the DLL search path (os.add_dll_directory — PATH alone fails with
  // loader error 0x7e on libgobject's transitive deps) before running
  // WeasyPrint's CLI main. Bare 'python' may resolve to an interpreter
  // without weasyprint (uv-managed pythons); the Windows 'py' launcher
  // picks an installation that has it.
  const launcher = join(REPO_ROOT, 'apps', 'engine', 'scripts', 'weasyprint-launcher.py');
  if (IS_WIN && (await exists(launcher))) {
    const python = envPath('LOCALTOOLS_PYTHON_PATH') ?? 'py';
    if (await probeCommand(python, [launcher, '--version'])) {
      return { exe: python, args: [launcher] };
    }
    return undefined; // launcher exists but no interpreter can run weasyprint
  }
  // Fallback probe: python -m weasyprint must actually work (hosts without
  // it must surface tool-unavailable, not tool-failed).
  const python = envPath('LOCALTOOLS_PYTHON_PATH') ?? (IS_WIN ? 'python' : 'python3');
  if (await probeCommand(python, ['-m', 'weasyprint', '--version'])) {
    return { exe: python, args: ['-m', 'weasyprint'] };
  }
  return undefined;
}

/**
 * True when `exe args...` exits 0 within a short probe. Used to turn
 * "missing native dependency" into tool-unavailable instead of a confusing
 * runtime failure mid-request. Arg arrays only (Section 5.3).
 */
async function probeCommand(exe: string, args: string[]): Promise<boolean> {
  const { runSubprocess } = await import('./subprocess.js');
  const result = await runSubprocess(exe, args, { timeoutMs: 10_000 });
  return !result.spawnFailed && !result.timedOut && result.code === 0;
}

let cached: Promise<ToolPaths> | undefined;

/** Resolved tool paths (cached per process). */
export function toolPaths(): Promise<ToolPaths> {
  cached ??= resolveToolPaths();
  return cached;
}

/** Test seam: drop the cache. */
export function resetToolPaths(): void {
  cached = undefined;
}
