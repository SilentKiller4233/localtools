/**
 * Shared structural types. `ImageDataLike` is the ImageData subset every
 * codec returns/accepts — real ImageData in the browser, a plain
 * {data,width,height} object in Node (the codecs build it themselves).
 */

export interface ImageDataLike {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp' | 'gif' | 'tiff';

/** Recognized input sniff (magic bytes) for upload validation. */
export type SniffedFormat = ImageFormat | 'heic' | 'unknown';

/**
 * Errors mirror pdf-core's ToolError taxonomy so the client renders the
 * same human-readable pattern (code → copy).
 */
export type ImageToolErrorCode =
  | 'empty-input'
  | 'invalid-image'
  | 'unsupported-format'
  | 'invalid-option'
  | 'no-inputs'
  | 'size-limit'
  | 'operation-failed';

export class ImageToolError extends Error {
  readonly code: ImageToolErrorCode;
  constructor(code: ImageToolErrorCode, message: string) {
    super(message);
    this.name = 'ImageToolError';
    this.code = code;
  }
}

export function imageError(code: ImageToolErrorCode, message?: string): ImageToolError {
  return new ImageToolError(code, message ?? DEFAULT_MESSAGES[code]);
}

export const DEFAULT_MESSAGES: Readonly<Record<ImageToolErrorCode, string>> = {
  'empty-input': 'No image content was supplied.',
  'invalid-image':
    'This file could not be read as an image. It may be damaged or not an image at all.',
  'unsupported-format': 'This image format is not supported here.',
  'invalid-option': 'One of the options is not valid.',
  'no-inputs': 'Select at least one image file.',
  'size-limit': 'The image exceeds the processing size cap.',
  'operation-failed': 'The image operation failed.',
};
