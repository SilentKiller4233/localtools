/**
 * Speech-to-text (PROJECT_SPEC Phase 9, Sections 3.2, 15; DECISIONS.md
 * D-028/D-029). Client-side whisper.cpp WASM via @fugood/node-whisper-wasm.
 *
 * Environment contract (both verified live, D-029):
 *
 * - BROWSER (the client's media worker): the package's defaults work —
 *   asset URLs resolve same-origin via import.meta.url, the runtime
 *   auto-selects the single-thread artifact when the page is not
 *   crossOriginIsolated (NO COOP/COEP headers needed), and models cache
 *   via the Cache API ("whisper.node.wasm.models").
 *
 * - NODE (tests): three hooks are REQUIRED or nothing works:
 *   1. configureWasm({ threads: false }) — otherwise the pthreads
 *      artifact is selected (isWasmThreadsSupport() is true outside
 *      browsers) and crashes with "Worker is not defined".
 *   2. moduleOptions.instantiateWasm supplying locally-read
 *      whisper-node.wasm bytes and calling onSuccess(res.instance) —
 *      this Emscripten build never reads Module.wasmBinary, and Node's
 *      fetch rejects file:// URLs.
 *   3. Model bytes pre-seeded into the Emscripten FS via preRun +
 *      initWhisper({ filePath: '/models/<name>' }) — the glue's
 *      ensureModel sees source[0]==='/' + fsPathExists and skips the
 *      network entirely (CI never downloads).
 *
 * The WASM + model load lazily (dynamic import / model manager) — Vite
 * code-splits them out of the initial bundle (250KB JS budget, D-029).
 */

/* ------------------------------------------------------------------ */
/* Model tiers (pinned from ggerganov/whisper.cpp HF, D-029)            */
/* ------------------------------------------------------------------ */

export type WhisperTier = 'tiny.en' | 'base.en' | 'small.en';

interface ModelSpec {
  file: string;
  url: string;
  sha256: string;
  /** Approximate download size (bytes) surfaced in UI copy. */
  bytes: number;
}

/** Pinned ggml model artifacts (SHA-256 from HF LFS metadata, D-029). */
export const WHISPER_MODELS: Readonly<Record<WhisperTier, ModelSpec>> = {
  'tiny.en': {
    file: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
    bytes: 77_700_000,
  },
  'base.en': {
    file: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002',
    bytes: 148_000_000,
  },
  'small.en': {
    file: 'ggml-small.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d',
    bytes: 488_000_000,
  },
};

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Media-core error taxonomy for speech tools (mirrors pdf-core). */
export class SpeechError extends Error {
  readonly code:
    | 'empty-input'
    | 'invalid-file'
    | 'size-limit'
    | 'invalid-option'
    | 'model-download-failed'
    | 'operation-failed';
  constructor(code: SpeechError['code'], message: string) {
    super(message);
    this.name = 'SpeechError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* WAV decode + resample (browser AudioContext OR manual header parse) */
/* ------------------------------------------------------------------ */

export interface DecodedPcm {
  /** Mono mixed channel. */
  pcm: Float32Array;
  /** Source sample rate. */
  sampleRate: number;
}

/**
 * Decode WAV bytes to mono PCM. Handles 16-bit PCM (Piper/ffmpeg
 * fixtures) and 32-bit float WAVs; any channel count mixes to mono.
 * Structural parse — no AudioContext needed (works identically in Node
 * tests and the browser worker).
 */
export function decodeWavPcm(bytes: Uint8Array): DecodedPcm {
  if (bytes.byteLength < 44) {
    throw new SpeechError('invalid-file', 'The audio file is too short to read.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number): string =>
    String.fromCharCode(
      view.getUint8(off),
      view.getUint8(off + 1),
      view.getUint8(off + 2),
      view.getUint8(off + 3),
    );
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new SpeechError('invalid-file', 'The audio file is not a WAV file.');
  }
  // Walk chunks to fmt + data.
  let off = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 1;
  let dataOff = -1;
  let dataSize = 0;
  while (off + 8 <= view.byteLength) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    if (id === 'fmt ') {
      audioFormat = view.getUint16(off + 8, true);
      channels = view.getUint16(off + 10, true);
      sampleRate = view.getUint32(off + 12, true);
      bitsPerSample = view.getUint16(off + 22, true);
    } else if (id === 'data') {
      dataOff = off + 8;
      dataSize = Math.min(size, view.byteLength - dataOff);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (dataOff < 0 || channels === 0 || sampleRate === 0) {
    throw new SpeechError('invalid-file', 'The WAV file has no readable audio data.');
  }
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new SpeechError('invalid-file', 'This WAV encoding is not supported (PCM only).');
  }
  if (bitsPerSample !== 16 && !(audioFormat === 3 && bitsPerSample === 32)) {
    throw new SpeechError(
      'invalid-file',
      'Only 16-bit PCM or 32-bit float WAV audio is supported.',
    );
  }
  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.floor(dataSize / (bytesPerSample * channels));
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      const at = dataOff + (i * channels + c) * bytesPerSample;
      if (audioFormat === 3) sum += view.getFloat32(at, true);
      else sum += view.getInt16(at, true) / 32768;
    }
    pcm[i] = sum / channels;
  }
  return { pcm, sampleRate };
}

/**
 * Linear-interpolation resample to the whisper input rate (16kHz mono).
 * Pure function; unit-tested against a known sine.
 */
export function resampleTo16k(pcm: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16_000) return pcm;
  if (sampleRate <= 0) {
    throw new SpeechError('invalid-file', 'The audio file reports an invalid sample rate.');
  }
  const ratio = sampleRate / 16_000;
  const outLen = Math.max(1, Math.round(pcm.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const left = Math.min(Math.floor(pos), pcm.length - 1);
    const right = Math.min(left + 1, pcm.length - 1);
    const weight = pos - left;
    const l = pcm[left] ?? 0;
    const r = pcm[right] ?? 0;
    out[i] = l * (1 - weight) + r * weight;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Subtitle builders (auto-captions)                                   */
/* ------------------------------------------------------------------ */

export interface TranscriptSegment {
  text: string;
  /** Start centiseconds (whisper.cpp t0/t1 units, 10ms). */
  t0: number;
  t1: number;
}

/** Format cs (centiseconds) → SRT timecode HH:MM:SS,mmm. */
export function srtTimecode(cs: number): string {
  const ms = Math.round(cs * 10);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(rest).padStart(3, '0')}`;
}

/** Format cs → VTT timecode HH:MM:SS.mmm (dot, not comma). */
export function vttTimecode(cs: number): string {
  return srtTimecode(cs).replace(',', '.');
}

/** Build an SRT document from whisper segments. */
export function buildSrt(segments: readonly TranscriptSegment[]): string {
  return (
    segments
      .map((seg, i) => {
        const text = seg.text.trim();
        if (text === '') return '';
        return `${String(i + 1)}\n${srtTimecode(seg.t0)} --> ${srtTimecode(seg.t1)}\n${text}\n`;
      })
      .filter((s) => s !== '')
      .join('\n') + '\n'
  );
}

/** Build a WebVTT document from whisper segments. */
export function buildVtt(segments: readonly TranscriptSegment[]): string {
  return `WEBVTT\n\n${buildSrt(segments)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => (line.includes(' --> ') ? line.replace(/,/g, '.') : line))
    .join('\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* The whisper runtime (lazy, dual-environment)                        */
/* ------------------------------------------------------------------ */

/** Transcription result (the subset we use). */
export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  /** Which tier produced this. */
  tier: WhisperTier;
}

/** Progress callback for model download/init phases. */
export type SpeechProgress = (phase: 'model' | 'init' | 'transcribe', pct: number) => void;

interface FugoodModule {
  configureWasm(opts: Record<string, unknown>): void;
  initWhisper(opts: Record<string, unknown>): Promise<WhisperContextLike>;
}
interface WhisperContextLike {
  transcribeData(
    audio: Float32Array,
    options?: Record<string, unknown>,
  ): { promise: Promise<{ result: string; segments: { text: string; t0: number; t1: number }[] }> };
  release(): Promise<void>;
}

/** Feature-detect Node without tripping the browser eslint rule. */
function isNode(): boolean {
  const procView: { versions?: { node?: string } } | undefined = (
    globalThis as { process?: { versions?: { node?: string } } }
  ).process;
  return procView?.versions?.node !== undefined;
}

/** Node-only: configureWasm is one-shot per process — guard. */
let nodeWasmConfigured = false;

/** Node-only: the bytes the (installed) preRun hook seeds into the FS. */
const nodeModelSlot: { file: string; bytes: Uint8Array | undefined } = {
  file: '',
  bytes: undefined,
};

/**
 * Transcribe PCM audio (16kHz mono Float32) with a whisper tier.
 * The full lazy-load contract lives here (D-029).
 */
async function transcribe16k(
  pcm16k: Float32Array,
  tier: WhisperTier,
  onProgress?: SpeechProgress,
): Promise<{ result: string; segments: { text: string; t0: number; t1: number }[] }> {
  const pkg = (await import('@fugood/node-whisper-wasm')) as unknown as FugoodModule;
  const spec = WHISPER_MODELS[tier];

  if (isNode()) {
    // ── Node contract (D-029) ────────────────────────────────────────
    // 1) threads:false + 2) instantiateWasm with locally-read bytes +
    // 3) FS-preseeded model at /models/<file>.
    //
    // configureWasm is ONE-SHOT per process ("must be called before the
    // WASM runtime is loaded" — it throws on any second call): the
    // module-level nodeWasmConfigured guard configures exactly once,
    // with hooks that read from the nodeModelSlot so every later call
    // can still point the FS pre-seed at its own tier's bytes.
    const { readFile } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');
    const { tmpdir } = await import('node:os');
    const nodePath = await import('node:path');
    const { existsSync } = await import('node:fs');

    // Resolve the model from the local cache (tests pre-seed it — the
    // u2netp Temp-dir precedent, D-016/D-029). Absent → honest
    // model-download-failed degradation, never a hidden network fetch.
    const cacheDir = nodePath.join(nodePath.join(tmpdir(), 'localtools-models'), 'whisper');
    const modelPath = nodePath.join(cacheDir, spec.file);
    if (!existsSync(modelPath)) {
      throw new SpeechError(
        'model-download-failed',
        `The ${tier} speech model is not downloaded yet. Run once with a network connection to cache it, then retry.`,
      );
    }
    const modelBytes = new Uint8Array(await readFile(modelPath));
    const digest = createHash('sha256').update(modelBytes).digest('hex');
    if (digest !== spec.sha256) {
      throw new SpeechError(
        'model-download-failed',
        `The cached ${tier} model failed its integrity check. Delete the cached file and retry.`,
      );
    }
    // Stage the bytes for the (possibly already-installed) preRun hook.
    nodeModelSlot.file = spec.file;
    nodeModelSlot.bytes = modelBytes;

    if (!nodeWasmConfigured) {
      nodeWasmConfigured = true;
      // The wasm artifact ships inside the package — resolve the package's
      // own install directory via createRequire (robust under pnpm's
      // symlinked node_modules and vitest's transform pipeline alike).
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const pkgRoot = req
        .resolve('@fugood/node-whisper-wasm/package.json')
        .replace(/[\\/]package\.json$/, '');
      const wasmBytes = await readFile(`${pkgRoot}/wasm/whisper-node.wasm`);

      pkg.configureWasm({
        threads: false,
        moduleOptions: {
          instantiateWasm: (imports: unknown, onSuccess: (instance: unknown) => void) => {
            void WebAssembly.instantiate(
              wasmBytes,
              imports as Record<string, unknown> as never,
            ).then((res) => {
              onSuccess((res as { instance: unknown }).instance);
            });
          },
          preRun: (Module: {
            FS: { mkdir(path: string): void; writeFile(path: string, data: Uint8Array): void };
          }) => {
            const FS = Module.FS;
            try {
              FS.mkdir('/models');
            } catch {
              // may exist
            }
            // The hook reads the CURRENT slot — later calls with a
            // different tier re-seed before the runtime instantiates.
            if (nodeModelSlot.file !== '' && nodeModelSlot.bytes !== undefined) {
              FS.writeFile(`/models/${nodeModelSlot.file}`, nodeModelSlot.bytes);
            }
          },
        },
      });
    }

    onProgress?.('model', 100);
    const whisper = await pkg.initWhisper({
      filePath: `/models/${spec.file}`,
      useGpu: false,
      cacheModel: false,
      worker: false,
      maxModelBytes: 500 * 1024 * 1024,
    });
    onProgress?.('init', 100);
    try {
      const { promise } = whisper.transcribeData(pcm16k, {
        language: 'en',
        tokenTimestamps: true,
      });
      onProgress?.('transcribe', 100);
      return await promise;
    } finally {
      await whisper.release();
    }
  }

  // ── Browser contract (defaults) ─────────────────────────────────
  const whisper = await pkg.initWhisper({
    // modelUrl: the pinned HF URL; the package's Cache-API model cache
    // dedupes repeat downloads (D-029).
    modelUrl: spec.url,
    filePath: spec.url,
    useGpu: false,
    cacheModel: true,
    worker: true,
    maxModelBytes: 500 * 1024 * 1024,
  });
  try {
    const { promise } = whisper.transcribeData(pcm16k, {
      language: 'en',
      tokenTimestamps: true,
      onProgress: (pct: number) => onProgress?.('transcribe', pct),
    });
    return await promise;
  } finally {
    await whisper.release();
  }
}

/* ------------------------------------------------------------------ */
/* Public tool surface                                                  */
/* ------------------------------------------------------------------ */

/** Cap: 2h of audio at 16kHz mono (~115MB Float32) — size-limit above. */
const MAX_PCM_SAMPLES = 16_000 * 60 * 120;

/**
 * Transcribe a WAV/PCM audio buffer. Returns the text plus per-segment
 * timestamps (centiseconds — whisper.cpp units) for caption building.
 */
export async function transcribeAudio(
  bytes: Uint8Array,
  options: { tier?: WhisperTier; onProgress?: SpeechProgress } = {},
): Promise<TranscriptionResult> {
  if (bytes.byteLength === 0) {
    throw new SpeechError(
      'empty-input',
      'The selected file appears to be empty. Try another file.',
    );
  }
  if (bytes.byteLength > 500 * 1024 * 1024) {
    throw new SpeechError('size-limit', 'The audio file exceeds the 500MB processing cap.');
  }
  const tier = options.tier ?? 'tiny.en';
  const { pcm, sampleRate } = decodeWavPcm(bytes);
  if (pcm.length === 0) {
    throw new SpeechError('invalid-file', 'The WAV file contains no audio frames.');
  }
  const pcm16k = resampleTo16k(pcm, sampleRate);
  if (pcm16k.length > MAX_PCM_SAMPLES) {
    throw new SpeechError('size-limit', 'The audio is longer than the 2-hour transcription cap.');
  }
  const raw = await transcribe16k(pcm16k, tier, options.onProgress);
  const segments: TranscriptSegment[] = raw.segments.map((s) => ({
    text: s.text,
    t0: s.t0,
    t1: s.t1,
  }));
  return { text: raw.result.trim(), segments, tier };
}

/**
 * Auto-captions: transcribe and emit a ready-to-use subtitle document
 * (.srt or .vtt) timed to the audio — feeds burn-subtitles downstream.
 */
export async function buildCaptions(
  bytes: Uint8Array,
  options: { tier?: WhisperTier; format?: 'srt' | 'vtt'; onProgress?: SpeechProgress } = {},
): Promise<{ text: string; format: 'srt' | 'vtt' }> {
  const format = options.format ?? 'srt';
  const result = await transcribeAudio(bytes, options);
  if (result.segments.length === 0 && result.text !== '') {
    // Single-segment output: synthesize one span 0 → audio-length (the
    // PCM length IS the audio length at 16kHz).
    const { pcm, sampleRate } = decodeWavPcm(bytes);
    const totalCs = Math.round((pcm.length / sampleRate) * 100);
    return {
      text:
        format === 'srt'
          ? buildSrt([{ text: result.text, t0: 0, t1: totalCs }])
          : buildVtt([{ text: result.text, t0: 0, t1: totalCs }]),
      format,
    };
  }
  return {
    text: format === 'srt' ? buildSrt(result.segments) : buildVtt(result.segments),
    format,
  };
}
