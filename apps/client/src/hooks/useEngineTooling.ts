/**
 * useEngineTooling (Phase 11) — the shared engine-page toolkit.
 *
 * Every Group B/C page (EngineRunnerPage, DownloaderPage, TTS,
 * audiobook) needs the same integration polish:
 *  - health gating (spec line 495): probe /healthz on mount + on the
 *    shell's engine://ready event, expose a banner state;
 *  - the tool-unavailable → ToolDownloadPrompt flow (spec line 362):
 *    map the endpoint to its helper and offer the one-time download;
 *  - a friendly installed-confirmation after a helper lands.
 *
 * One hook instead of four inline copies; pages keep their own error
 * state and copy nuances.
 */

import { useCallback, useEffect, useState } from 'react';
import { checkEngineHealth, type EngineHealth } from '../lib/engine-health';
import { onEngineReady, toolForEndpoint } from '../lib/desktop-bridge';
import { isToolUnavailable } from '../lib/tool-errors';

/** Shared copy when the health gate fails (identical on every page). */
export const ENGINE_DOWN_COPY =
  'The local processing engine isn’t running yet — give it a few seconds, then try again. (Start it with the desktop app or `docker compose up`.)';

export interface EngineTooling {
  /** Current engine health ('checking' until the first probe resolves). */
  health: EngineHealth;
  /** Re-probe now (banner "Check again" button). */
  probe: () => Promise<void>;
  /** Manifest tool id whose download prompt is open, if any. */
  downloadFor: string | undefined;
  setDownloadFor: (id: string | undefined) => void;
  /** Friendly confirmation shown after a helper installs. */
  installedNote: string | undefined;
  /** Set the installed confirmation; pass the retry button label
   * ("Run", "Preview") the note should tell the user to press. */
  setInstalledNote: (retryLabel: string | undefined) => void;
  /** Clear the installed confirmation (pages call it when a new run starts). */
  clearInstalledNote: () => void;
  /** Render the stored installed-confirmation as full copy. */
  installedNoteFor: (stored: string) => string;
  /**
   * Health gate for run/preview: probes and returns true when ready.
   * When not ready, returns false — render ENGINE_DOWN_COPY.
   */
  gate: () => Promise<boolean>;
  /**
   * Route a caught engine error: when it's tool-unavailable AND the
   * shell can supply the helper, opens the download prompt and returns
   * true (page clears its error). Otherwise returns false.
   */
  handleUnavailable: (err: unknown, endpoint: string) => Promise<boolean>;
}

export function useEngineTooling(): EngineTooling {
  const [health, setHealth] = useState<EngineHealth>('checking');
  const [downloadFor, setDownloadFor] = useState<string | undefined>(undefined);
  const [installedNote, setInstalledNote] = useState<string | undefined>(undefined);

  const probe = useCallback(async () => {
    const result = await checkEngineHealth();
    setHealth(result.state);
  }, []);

  useEffect(() => {
    void probe();
    const off = onEngineReady(() => {
      void probe();
    });
    return off;
  }, [probe]);

  const gate = useCallback(async () => {
    const result = await checkEngineHealth();
    setHealth(result.state);
    return result.state === 'ready';
  }, []);

  const handleUnavailable = useCallback(async (err: unknown, endpoint: string) => {
    if (!isToolUnavailable(err)) return false;
    const toolId = await toolForEndpoint(endpoint);
    if (toolId === undefined) return false;
    setDownloadFor(toolId);
    return true;
  }, []);

  const clearInstalledNote = useCallback(() => {
    setInstalledNote(undefined);
  }, []);

  const setNote = useCallback((retryLabel: string | undefined) => {
    setInstalledNote(retryLabel);
  }, []);

  const installedNoteFor = useCallback((stored: string) => {
    return `Component installed — press ${stored} again, it will work now.`;
  }, []);

  return {
    health,
    probe,
    downloadFor,
    setDownloadFor,
    installedNote,
    setInstalledNote: setNote,
    clearInstalledNote,
    installedNoteFor,
    gate,
    handleUnavailable,
  };
}
