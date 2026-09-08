/**
 * LocalTools shared types & contracts (Layer 1 <-> Layer 2 API contract).
 *
 * Phase 0 stub: establishes the module shape only. Real schemas arrive with
 * their phases; every addition must keep this file the single source of truth
 * shared by apps/client and apps/engine.
 */

/** Which suite a tool belongs to — drives nav sections and tool grids. */
export type SuiteId = 'pdf' | 'media' | 'image' | 'devtext';

/** Processing group per PROJECT_SPEC Section 3 definitions. */
export type ToolGroup = 'a' | 'b' | 'c';

export interface ToolDefinition {
  id: string;
  suite: SuiteId;
  name: string;
  /** One-line description shown on the tool card. */
  description: string;
  group: ToolGroup;
}

/** Generic envelope every engine endpoint answers with. */
export type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineError };

export interface EngineError {
  code: string;
  /** Human-readable, safe-to-show message (never raw filesystem paths). */
  message: string;
}

export type { EngineFile, OfficeConversionDirectionValue } from './pdf-engine.js';
export {
  EngineFileSchema,
  OfficeConversionDirection,
  OfficeConversionRequestSchema,
  OcrPdfRequestSchema,
  DeepCompressRequestSchema,
  PdfToPdfARequestSchema,
  DeepRepairRequestSchema,
  HtmlToPdfRequestSchema,
} from './pdf-engine.js';
export type {
  OfficeConversionRequest,
  OcrPdfRequest,
  DeepCompressRequest,
  PdfToPdfARequest,
  DeepRepairRequest,
  HtmlToPdfRequest,
} from './pdf-engine.js';

export {
  VideoContainer,
  AudioFormat,
  Timecode,
  timecodeToSeconds,
  VideoConvertRequestSchema,
  VideoCompressRequestSchema,
  VideoTrimRequestSchema,
  MediaMergeRequestSchema,
  ExtractAudioRequestSchema,
  VideoToGifRequestSchema,
  GifToVideoRequestSchema,
  AudioConvertRequestSchema,
  AudioCompressRequestSchema,
  AudioTrimRequestSchema,
  LoudnessNormalizeRequestSchema,
  BurnSubtitlesRequestSchema,
  ResolutionChangeRequestSchema,
  PiperVoiceId,
  PIPER_VOICE_LABELS,
  TextToSpeechRequestSchema,
  PdfToAudiobookRequestSchema,
} from './media-engine.js';
export type {
  VideoContainerValue,
  AudioFormatValue,
  VideoConvertRequest,
  VideoCompressRequest,
  VideoTrimRequest,
  MediaMergeRequest,
  ExtractAudioRequest,
  VideoToGifRequestSchemaType,
  GifToVideoRequest,
  AudioConvertRequest,
  AudioCompressRequest,
  AudioTrimRequest,
  LoudnessNormalizeRequest,
  BurnSubtitlesRequest,
  ResolutionChangeRequest,
  PiperVoiceIdValue,
  TextToSpeechRequest,
  PdfToAudiobookRequest,
} from './media-engine.js';

export {
  DownloadFormatSchema,
  DownloadItemSchema,
  DownloadMetadataRequestSchema,
  DownloadMetadataResponseSchema,
  DownloadModeSchema,
  DownloadRequestSchema,
  DownloadResponseSchema,
  DOWNLOADER_ERROR_CODES,
} from './downloader-engine.js';
export type {
  DownloadFormat,
  DownloadItem,
  DownloadMetadataRequest,
  DownloadMetadataResponse,
  DownloadMode,
  DownloadRequest,
  DownloadResponse,
  DownloaderErrorCode,
  DownloaderLegalNotice,
} from './downloader-engine.js';
