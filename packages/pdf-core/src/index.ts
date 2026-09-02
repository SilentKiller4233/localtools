export { ToolError, MAX_PDF_BYTES, ERROR_MESSAGES, toolError } from './errors';
export { isPdfLibEncryptionError } from './errors';
export { loadPdf, parsePageRanges, assertSize, hasPdfSignature } from './load';
export { mergePdfs } from './tools/merge';
export { splitPdf } from './tools/split';
export type {
  SplitMode,
  SplitOptions,
  SplitEveryNOptions,
  SplitBySizeOptions,
  SplitOutput,
} from './tools/split';
export { extractPages } from './tools/extract';
export { deletePages } from './tools/delete';
export { rotatePages } from './tools/rotate';
export type { RotateOptions } from './tools/rotate';
export { addPageNumbers } from './tools/page-numbers';
export type { PageNumbersOptions, PageNumberPosition } from './tools/page-numbers';
export { addTextWatermark } from './tools/watermark';
export type { WatermarkOptions, WatermarkPosition } from './tools/watermark';
export { editMetadata, readMetadata } from './tools/metadata';
export type { MetadataInput } from './tools/metadata';
export { resizePages, PAGE_SIZES } from './tools/resize';
export type { ResizePagesOptions, PageSizeName } from './tools/resize';
export { nUpPages } from './tools/nup';
export type { NUpOptions, NUpLayout } from './tools/nup';
export { protectPdf, unlockPdf, optimizePdf } from './tools/secure';
export type { ProtectOptions, AesLevel } from './tools/secure';
export { extractText } from './tools/text';
export type { TextFormat } from './tools/text';
export { imagesToPdf, sniffImage } from './tools/image-to-pdf';
export type { ImageToPdfOptions, ImageFormat } from './tools/image-to-pdf';
export { fillForm, readFormFields } from './tools/forms';
export type { FormFieldValues } from './tools/forms';
export { comparePdfs } from './tools/compare';
export type { CompareResult, CompareVisual, ComparePageStat } from './tools/compare';
export { pdfToImage } from './tools/pdf-to-image';
export type { PdfToImageOptions, RenderedPage, RenderFormat } from './tools/pdf-to-image';
export { grayscalePdf } from './tools/grayscale';
export type { GrayscaleOptions } from './tools/grayscale';
export { cropPages } from './tools/crop';
export type { CropOptions, CropUnit } from './tools/crop';
export { signPdf } from './tools/sign';
export type { SignaturePlacement, SignatureKind, SignResult } from './tools/sign';
export { OffscreenCanvasFactory, MAX_RENDER_PIXELS } from './render';
export type { ImageDataLike, Canvas2D, CanvasFactoryLike, RenderedSurface } from './render';
export { organizePages } from './tools/organize';
export { repairPdf } from './tools/repair';
export { quickCompress } from './tools/compress';
export { redactPdf } from './tools/redact';
export type { RedactionRect, RedactResult } from './tools/redact';
export { redactPdfByText } from './tools/redact-text';
export { setBookmarks, readBookmarks } from './tools/bookmarks';
export type { BookmarkEntry } from './tools/bookmarks';
