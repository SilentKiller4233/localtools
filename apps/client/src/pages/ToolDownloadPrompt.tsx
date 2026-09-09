/**
 * Tool download prompt (PROJECT_SPEC Section 10 Tier 1, spec line 362).
 *
 * One-time friendly download prompt shown the FIRST time a Group B/C
 * tool is used and its native helper isn't installed yet: explains the
 * size, promises "works forever after", downloads with the shell's
 * pinned + SHA-256-verified pipeline, and stays dismissible (Section 13:
 * the rest of the app stays usable, retry always available).
 *
 * Browser (non-desktop) behavior: the prompt degrades to the honest
 * engine-unavailable copy — no download offered, exactly as before
 * Phase 10.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, ProgressBar } from '@localtools/ui';
import {
  downloadTool,
  inDesktopShell,
  toolDownloadInfo,
  type DownloadBridgeError,
  type ToolDownloadInfo,
} from '../lib/desktop-bridge';

export interface ToolDownloadPromptProps {
  /** Manifest tool id the failed endpoint maps to (desktop-bridge). */
  toolId: string;
  /** Called after a successful download so the caller can re-run. */
  onInstalled: () => void;
  /** Dismiss without downloading (caller returns to idle state). */
  onDismiss: () => void;
}

export function ToolDownloadPrompt({ toolId, onInstalled, onDismiss }: ToolDownloadPromptProps) {
  const [info, setInfo] = useState<ToolDownloadInfo | undefined>(undefined);
  const [phase, setPhase] = useState<'prompt' | 'downloading' | 'failed'>('prompt');
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const state = { mounted: true };
    void (async () => {
      const i = await toolDownloadInfo(toolId);
      if (state.mounted) setInfo(i);
    })();
    return () => {
      state.mounted = false;
    };
  }, [toolId]);

  const start = useCallback(async () => {
    setPhase('downloading');
    setError(undefined);
    const res = await downloadTool(toolId);
    const err = res as DownloadBridgeError;
    if ('code' in res && 'message' in res && typeof err.code === 'string') {
      setPhase('failed');
      setError(err.message);
      return;
    }
    setPhase('prompt');
    onInstalled();
  }, [toolId, onInstalled]);

  if (!inDesktopShell()) {
    return (
      <p className="lt-tool-error" role="alert">
        This tool needs a component that isn’t installed. On the desktop app it downloads on first
        use; on Docker it ships with the image.
      </p>
    );
  }

  if (info !== undefined && info.installed) {
    // Already present — the caller should not have shown the prompt.
    return null;
  }

  return (
    <div className="lt-download-prompt" role="dialog" aria-label="One-time download">
      {phase === 'downloading' ? (
        <>
          <p>
            Downloading {info?.label ?? 'the required component'}… This happens once; everything
            keeps working offline afterwards.
          </p>
          <ProgressBar label="Downloading" />
          <p className="lt-tool-hint">You can keep using other tools while this downloads.</p>
        </>
      ) : phase === 'failed' ? (
        <>
          <p className="lt-tool-error" role="alert">
            {error ?? 'The download did not complete.'}
          </p>
          <div className="lt-tool-actions">
            <Button onClick={() => void start()}>Retry download</Button>
            <Button variant="outline" onClick={onDismiss}>
              Not now
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>{info?.promptCopy ?? 'This tool needs a one-time download to work.'}</p>
          <div className="lt-tool-actions">
            <Button onClick={() => void start()}>
              Download {info?.label ?? 'now'}
              {info !== undefined ? ` (~${String(info.approxMb)}MB)` : ''}
            </Button>
            <Button variant="outline" onClick={onDismiss}>
              Not now
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
