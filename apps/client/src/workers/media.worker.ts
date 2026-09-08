/**
 * Media speech worker (Phase 9): hosts whisper.cpp WASM transcription
 * (transcribe-media, auto-captions). The fugood package + the 77KB–488MB
 * model weights load lazily via dynamic import inside this worker —
 * the main bundle gains only the registry entries (250KB JS budget,
 * DECISIONS.md D-029). The 4.1MB WASM itself is a runtime fetch.
 *
 * Transcription output shape (media-core):
 *   transcribe-media → { text, segments, tier }
 *   auto-captions    → { text: <srt/vtt doc>, format }
 */

import type { MediaToolRequest, MediaToolResponse } from '../lib/media-worker-client';

function fail(id: number, code: string, message: string): void {
  const msg: MediaToolResponse = { id, ok: false, code, message };
  self.postMessage(msg);
}

function done(id: number, result: unknown): void {
  const msg: MediaToolResponse = { id, ok: true, result };
  self.postMessage(msg);
}

interface FileInput {
  name: string;
  bytes: Uint8Array;
}

self.addEventListener('message', (event: MessageEvent<MediaToolRequest>) => {
  const { id, tool, options, files } = event.data;
  const file0: FileInput | undefined = files[0];
  const bytes = file0?.bytes ?? new Uint8Array(0);
  void (async () => {
    try {
      // Lazy: media-core (and transitively the whisper WASM package)
      // loads only when a speech tool actually runs.
      const core = await import('@localtools/media-core');
      const tierOf = (raw: unknown): 'tiny.en' | 'base.en' | 'small.en' =>
        raw === 'base.en' || raw === 'small.en' ? raw : 'tiny.en';
      switch (tool) {
        case 'transcribe-media': {
          const result = await core.transcribeAudio(bytes, {
            tier: tierOf(options['tier']),
          });
          done(id, result);
          return;
        }
        case 'auto-captions': {
          const format = options['format'] === 'vtt' ? 'vtt' : 'srt';
          const result = await core.buildCaptions(bytes, {
            tier: tierOf(options['tier']),
            format,
          });
          done(id, result);
          return;
        }
        default:
          fail(id, 'invalid-option', `Unknown media tool: ${tool}`);
      }
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String(err.code)
          : 'operation-failed';
      const message = err instanceof Error ? err.message : 'The transcription failed.';
      fail(id, code, message);
    }
  })();
});
