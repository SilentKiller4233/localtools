/**
 * Unified error copy (Phase 11, spec Section 15 "integration polish").
 *
 * One home for the human-readable rendering of every error taxonomy in
 * the app (pdf/image/devtext worker codes, engine codes, bridge codes),
 * so no runner has to roll its own mapping and the "no raw/unstyled
 * error anywhere" acceptance is enforceable by a single test file.
 *
 * The per-suite runners previously each carried a local ERROR_TEXT map;
 * those maps move here unchanged (copy is frozen — the tests assert it).
 * Unknown codes ALWAYS fall back to a friendly sentence, never to
 * err.message (which may be technical) — the raw-error guarantee.
 */

/** pdf-core ToolError codes (packages/pdf-core/src/errors.ts). */
const PDF_ERROR_TEXT: Record<string, string> = {
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-pdf': 'This file could not be read as a PDF. It may be damaged or not a PDF at all.',
  'encrypted-pdf':
    'This PDF is password-protected. Use the Unlock tool first, then come back and retry.',
  'page-range': 'The page selection is empty or outside this document — check the page numbers.',
  'no-inputs': 'Select at least one file first.',
  'single-file-only': 'This tool processes one file at a time.',
  'size-limit': 'This file is larger than the 500MB processing cap.',
  'zero-page-pdf': 'This PDF contains no pages.',
  'invalid-option': 'One of the settings above is not valid — check the highlighted fields.',
  'qpdf-failed': 'The operation failed — the file or password may be invalid.',
  'worker-crash': 'The processing worker stopped unexpectedly. Try again in a moment.',
};

/** image-core imageError codes (packages/image-core/src/types.ts). */
const IMAGE_ERROR_TEXT: Record<string, string> = {
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-image':
    'This file could not be read as an image. It may be damaged or not an image at all.',
  'unsupported-format': 'This image format is not supported here.',
  'invalid-option': 'One of the settings above is not valid — check the highlighted fields.',
  'no-inputs': 'Select at least one image first.',
  'size-limit': 'This image is larger than the processing cap.',
  'operation-failed': 'The operation failed. Please try again.',
  'worker-crash': 'The image worker stopped unexpectedly. Try again in a moment.',
};

/** devtext-core DevTextToolError codes (packages/devtext-core/src/types.ts). */
const DEVTEXT_ERROR_TEXT: Record<string, string> = {
  'empty-input': 'The input is empty — paste or select something first.',
  'invalid-input': 'This content could not be parsed. Check the syntax and try again.',
  'invalid-option': 'One of the options above is not valid — check the highlighted fields.',
  'no-inputs': 'Provide the required inputs first.',
  'size-limit': 'This input exceeds the processing size cap.',
  'too-many-files': 'Too many files were supplied.',
  'operation-failed': 'The operation failed. Please try again.',
  'worker-crash': 'The dev-text worker stopped unexpectedly. Try again in a moment.',
};

/** media-core speech codes (packages/media-core/src/speech.ts taxonomy). */
const SPEECH_ERROR_TEXT: Record<string, string> = {
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-file': 'This WAV file could not be read. Re-export it as 16-bit or float PCM and retry.',
  'size-limit': 'The audio is longer than the 2-hour transcription cap.',
  'invalid-option': 'One of the settings above is not valid — check the highlighted fields.',
  'model-download-failed':
    'The speech model could not be downloaded. Check your connection and press Run again to retry — everything else keeps working.',
  'operation-failed': 'The transcription failed. Please try again.',
  'worker-crash': 'The speech worker stopped unexpectedly. Try again in a moment.',
};

/** Engine codes (apps/engine/src/errors.ts) + client-side bridge codes
 * (engine-unreachable). Shared by every Group B/C runner. */
const ENGINE_ERROR_TEXT: Record<string, string> = {
  'no-inputs': 'Select at least one file first.',
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-file': 'This file is not a type this tool can process.',
  'size-limit': 'This file is larger than the processing cap.',
  'invalid-option': 'One of the settings above is not valid — check the highlighted fields.',
  'tool-timeout': 'The operation took too long and was stopped.',
  'tool-failed': 'The file could not be processed — it may be damaged or unsupported.',
  'tool-unavailable':
    'This tool needs a component that isn’t installed. On the desktop app it downloads on first use; on Docker it ships with the image.',
  'engine-busy': 'The processing engine is busy — try again in a moment.',
  'engine-unreachable':
    'The local processing engine isn’t running. Start it with the desktop app or `docker compose up`.',
  'unsupported-site':
    'This site isn’t supported by the downloader — try a link from a supported video or audio platform.',
  'blocked-host': 'This link points at a private or local network address, which is not allowed.',
  'rate-limited': 'Too many downloads in a short time — wait a moment and try again.',
  'too-long': 'This item is longer than the downloader’s duration cap.',
  'download-too-large': 'The download exceeded the size cap and was stopped — nothing was kept.',
  unauthorized: 'This request is not authorized.',
  internal: 'The operation failed unexpectedly. Please try again.',
};

/** Friendly sentences for desktop-bridge download errors (lib.rs codes). */
const BRIDGE_ERROR_TEXT: Record<string, string> = {
  'unknown-tool': 'That component isn’t available on this device.',
  'network-error':
    'The download couldn’t reach the internet. Check your connection and press retry — nothing else is affected.',
  'checksum-mismatch':
    'The downloaded file didn’t match its pinned fingerprint and was discarded. Press retry to try again.',
  'extract-failed':
    'The downloaded component couldn’t be unpacked. Press retry — if it keeps failing, restart the app.',
  'unsupported-platform': 'This component isn’t available for your operating system.',
  'not-desktop': 'Downloads are handled by the desktop app.',
  internal: 'The download did not complete. Press retry to try again.',
};

/** Render any thrown value into a styled-error-safe sentence.
 * Never returns a technical message unless it comes from one of the
 * known taxonomies above (their messages are human-audited). */
export function friendlyError(
  err: unknown,
  scope: 'pdf' | 'image' | 'devtext' | 'speech' | 'engine',
  fallback = 'The operation failed. Please try again.',
): string {
  const maps: Record<typeof scope, Record<string, string>> = {
    pdf: PDF_ERROR_TEXT,
    image: IMAGE_ERROR_TEXT,
    devtext: DEVTEXT_ERROR_TEXT,
    speech: SPEECH_ERROR_TEXT,
    engine: ENGINE_ERROR_TEXT,
  };
  const code = errorCodeOf(err);
  if (code === undefined) return fallback;
  return maps[scope][code] ?? fallback;
}

/** Extract the taxonomy code from any of the app's error shapes. */
export function errorCodeOf(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err;
    if (typeof code === 'string' && code !== '') return code;
  }
  return undefined;
}

/** True when the engine said tool-unavailable (drives the download prompt). */
export function isToolUnavailable(err: unknown): boolean {
  return errorCodeOf(err) === 'tool-unavailable';
}

/** Friendly copy for a bridge error value (code+message object or anything). */
export function friendlyBridgeError(err: unknown): string {
  const code = errorCodeOf(err);
  if (code !== undefined) {
    return BRIDGE_ERROR_TEXT[code] ?? internalBridgeCopy();
  }
  return internalBridgeCopy();
}

function internalBridgeCopy(): string {
  return (
    BRIDGE_ERROR_TEXT['internal'] ?? 'The download did not complete. Press retry to try again.'
  );
}

/** The individual maps stay exported for the copy-completeness test. */
export const ERROR_COPY: Record<string, Record<string, string>> = {
  pdf: PDF_ERROR_TEXT,
  image: IMAGE_ERROR_TEXT,
  devtext: DEVTEXT_ERROR_TEXT,
  speech: SPEECH_ERROR_TEXT,
  engine: ENGINE_ERROR_TEXT,
  bridge: BRIDGE_ERROR_TEXT,
};
