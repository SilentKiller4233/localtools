/**
 * Desktop bridge (PROJECT_SPEC Phase 10, Tier 1).
 *
 * In the Tauri shell, `window.__LOCALTOOLS__` exists (created by the
 * shell's injected bootstrap from Tauri's own `withGlobalTauri` runtime
 * — see apps/desktop/src-tauri/bridge.js) and this module talks to it:
 * engine port/origin, tool-download prompts (spec line 362), progress,
 * status. In a plain browser (Docker/dev), the bridge is absent and
 * every function returns its honest "not in desktop" result — the app
 * degrades exactly as it did before Phase 10 (Section 13: the rest of
 * the app stays usable).
 *
 * The bridge surface mirrors @tauri-apps/api invoke/event names, but this
 * module never imports @tauri-apps/api — it wraps the injected object so
 * the client bundle stays environment-agnostic (no new dependency, no
 * bundle-size impact, works unchanged in browsers).
 */

export interface DesktopToolStatus {
  id: string;
  installed: boolean;
  label: string;
  env: Record<string, string>;
}

export interface DesktopStatus {
  enginePort: number;
  engineReady: boolean;
  engineLogTail: string;
  version: string;
  tools: DesktopToolStatus[];
}

export interface ToolDownloadInfo {
  id: string;
  label: string;
  promptCopy: string;
  approxMb: number;
  installed: boolean;
  supported: boolean;
}

export interface DownloadProgress {
  tool: string;
  done: number;
  total: number | null;
}

export interface DownloadOutcome {
  installed: boolean;
  message: string;
}

export interface DownloadBridgeError {
  code: string;
  message: string;
}

interface DesktopBridge {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>;
  listen(event: string, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    __LOCALTOOLS__?: DesktopBridge;
  }
}

/** True when running inside the Tauri desktop shell. */
export function inDesktopShell(): boolean {
  return typeof window !== 'undefined' && window.__LOCALTOOLS__ !== undefined;
}

function bridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__LOCALTOOLS__;
}

/** Full shell status; undefined outside the desktop shell. */
export async function desktopStatus(): Promise<DesktopStatus | undefined> {
  const b = bridge();
  if (b === undefined) return undefined;
  try {
    return (await b.invoke('desktop_status')) as DesktopStatus;
  } catch {
    return undefined;
  }
}

/** Prompt data for one lazy-downloadable tool; undefined outside shell. */
export async function toolDownloadInfo(toolId: string): Promise<ToolDownloadInfo | undefined> {
  const b = bridge();
  if (b === undefined) return undefined;
  try {
    return (await b.invoke('tool_download_info', { tool: toolId })) as ToolDownloadInfo;
  } catch {
    return undefined;
  }
}

/** Map an engine endpoint to the tool id whose download enables it. */
export async function toolForEndpoint(endpoint: string): Promise<string | undefined> {
  const b = bridge();
  if (b === undefined) return undefined;
  try {
    return (await b.invoke('tool_for_endpoint', { endpoint })) as string | undefined;
  } catch {
    return undefined;
  }
}

/** Start a tool download (one-time, pinned + SHA-256-verified). */
export async function downloadTool(toolId: string): Promise<DownloadOutcome | DownloadBridgeError> {
  const b = bridge();
  if (b === undefined) {
    return {
      code: 'not-desktop',
      message: 'Downloads are handled by the desktop app.',
    };
  }
  try {
    return (await b.invoke('download_tool', { tool: toolId })) as DownloadOutcome;
  } catch (err) {
    return err as DownloadBridgeError;
  }
}

/** Subscribe to download-progress events; returns an unsubscribe. */
export function onDownloadProgress(cb: (p: DownloadProgress) => void): () => void {
  const b = bridge();
  if (b === undefined) return () => {};
  return b.listen('download://progress', (payload) => {
    cb(payload as DownloadProgress);
  });
}

/** Subscribe to the engine-ready event. */
export function onEngineReady(cb: () => void): () => void {
  const b = bridge();
  if (b === undefined) return () => {};
  return b.listen('engine://ready', () => {
    cb();
  });
}
