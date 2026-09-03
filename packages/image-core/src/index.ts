/**
 * @localtools/image-core — Image suite Group A logic (PROJECT_SPEC 3.3).
 * Tools: format conversion, compression, resizing, batch ops, HEIC,
 * background removal (D-016 path), favicon, base64, screenshot
 * annotation, meme, EXIF view/strip, OCR, SVG optimization, palette.
 */

export { ImageToolError, imageError, DEFAULT_MESSAGES } from './types.js';
export type { ImageDataLike, ImageToolErrorCode, ImageFormat, SniffedFormat } from './types.js';
export { sniffImageFormat, assertDecodable, ENCODABLE_FORMATS, decodableFrom } from './sniff.js';
export type { DecodableFormat } from './sniff.js';
export { convertImage, decodeAuto } from './tools/convert.js';
export type { ConvertOptions, TargetFormat } from './tools/convert.js';
export { readExif, stripExif } from './tools/exif.js';
export type { ExifReport } from './tools/exif.js';
export { compressImage, resizeImage, runBatch, BATCH_FILE_LIMIT } from './tools/compress.js';
export type {
  CompressOptions,
  CompressResult,
  ResizeFileOptions,
  BatchJob,
  BatchOutput,
  QualityPreset,
} from './tools/compress.js';
export { resizePixels, computeTarget } from './tools/resize.js';
export type { ResizeOptions, ResizeMode } from './tools/resize.js';
export { convertHeic } from './tools/heic.js';
export type { HeicOptions } from './tools/heic.js';
export {
  imageToDataUri,
  dataUriToImage,
  extractPalette,
  paletteFromImage,
  generateFavicon,
} from './tools/utility.js';
export type {
  PaletteSwatch,
  FaviconOutput,
  FaviconOptions,
  FaviconResult,
} from './tools/utility.js';
export { optimizeSvg } from './tools/svg.js';
export type { SvgOptimizeOptions, SvgOptimizeResult } from './tools/svg.js';
export { makeMeme, annotateScreenshot } from './tools/annotate.js';
export type { MemeOptions, AnnotateOptions, AnnotateShape } from './tools/annotate.js';
export { ocrImage } from './tools/ocr.js';
export type { OcrResult } from './tools/ocr.js';
export { removeBackground, MODEL_URL, MODEL_CACHE_KEY } from './tools/background.js';
export type { RemoveBackgroundOptions, RemoveBackgroundResult } from './tools/background.js';
