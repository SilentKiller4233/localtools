/**
 * @localtools/devtext-core — Text & Dev suite logic (PROJECT_SPEC 3.4 + 3.5).
 * Entirely Group A: in-process, no native helpers, no network calls.
 */

export { DevTextToolError, devError, DEFAULT_MESSAGES, MAX_DEVTEXT_BYTES } from './types.js';
export type { DevTextToolErrorCode } from './types.js';

export { jsonFormat } from './tools/formatters.js';
export type { JsonFormat, JsonToolResult } from './tools/formatters.js';
export { yamlConvert } from './tools/formatters.js';
export type { YamlDirection, YamlToolResult } from './tools/formatters.js';
export { csvConvert } from './tools/formatters.js';
export type { CsvDirection, CsvToolResult } from './tools/formatters.js';
export { xmlFormat } from './tools/formatters.js';
export type { XmlToolResult } from './tools/formatters.js';

export {
  base64Text,
  base64EncodeFile,
  base64DecodeFile,
  urlCode,
  decodeJwt,
} from './tools/encoders.js';
export type { B64Direction, UrlMode, JwtResult, Base64Result } from './tools/encoders.js';

export {
  generateIds,
  convertCase,
  slugify,
  lorem,
  generatePassword,
  convertUnit,
  UNIT_CATEGORIES,
} from './tools/generators.js';
export type {
  IdKind,
  IdResult,
  CaseKind,
  PasswordKind,
  PasswordResult,
  PasswordOptions,
  UnitCategory,
  UnitDef,
  UnitResult,
} from './tools/generators.js';

export { hashText, hashBytes, fileSha256 } from './tools/hashing.js';
export type { HashAlgorithm, HashResult } from './tools/hashing.js';

export { testRegex } from './tools/regex.js';
export type { RegexResult, RegexMatch } from './tools/regex.js';

export { minifyCode, beautifyCode } from './tools/minify.js';
export type { CodeLanguage, CodeToolResult } from './tools/minify.js';

export { diffTexts } from './tools/diffcheck.js';
export type { DiffResult, DiffChange } from './tools/diffcheck.js';

export { markdownToHtml, htmlToMarkdown, markdownToPdf } from './tools/markdown.js';
export type { MarkdownPdfOptions } from './tools/markdown.js';

export {
  convertColor,
  generatePalette,
  generateGradient,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToOklch,
  oklchToRgb,
  parseColor,
} from './tools/colors.js';
export type {
  ColorSpace,
  ColorResult,
  Rgb,
  Hsl,
  Oklch,
  PaletteSwatch,
  GradientOptions,
  GradientStop,
  GradientResult,
} from './tools/colors.js';

export { explainCron, convertTimestamp } from './tools/timecron.js';
export type { CronResult, TimestampResult } from './tools/timecron.js';

export { generateQr, scanQr, generateBarcode, BARCODE_FORMATS } from './tools/qrbarcode.js';
export type {
  QrGenerateResult,
  QrScanResult,
  BarcodeFormat,
  BarcodeResult,
  QrEcc,
  BarcodeOptions,
} from './tools/qrbarcode.js';

export { generateFakeData, rowsToCsv } from './tools/fake.js';
export type { FakeCategory, FakeDataResult, FakeRow } from './tools/fake.js';

export { createZip, extractZip, previewTextFile } from './tools/zip.js';
export type { ZipInput, ZipEntryInfo, ZipToolResult } from './tools/zip.js';

export { generateSitemap, parseOgTags, buildOgCard } from './tools/webdev.js';
export type { SitemapOptions, OgCard, OgResult } from './tools/webdev.js';
