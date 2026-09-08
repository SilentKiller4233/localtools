/**
 * Media suite Group A logic (ffmpeg.wasm small-clip path, whisper.cpp
 * WASM STT).
 *
 * Phase 9: speech-to-text + auto-captions (speech.ts). The ffmpeg.wasm
 * small-clip browser path is deferred (D-021/D-032).
 */
export { MEDIA_CORE_STUB } from './stub.js';
export {
  WHISPER_MODELS,
  SpeechError,
  decodeWavPcm,
  resampleTo16k,
  transcribeAudio,
  buildCaptions,
  buildSrt,
  buildVtt,
  srtTimecode,
  vttTimecode,
} from './speech.js';
export type {
  WhisperTier,
  DecodedPcm,
  TranscriptSegment,
  TranscriptionResult,
  SpeechProgress,
} from './speech.js';
