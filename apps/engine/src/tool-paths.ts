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
  return {
    gs,
    soffice,
    tesseract,
    tessdata,
    ocrmypdf,
    weasyprint,
    playwrightEnabled: process.env['LOCALTOOLS_PLAYWRIGHT_ENABLED'] === 'true',
  };
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
    return { exe: python, args: [launcher] };
  }
  const python = envPath('LOCALTOOLS_PYTHON_PATH') ?? (IS_WIN ? 'python' : 'python3');
  return { exe: python, args: ['-m', 'weasyprint'] };
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
