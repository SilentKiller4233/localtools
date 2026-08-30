import type { SuiteId, ToolDefinition, ToolGroup } from '@localtools/shared-types';
import {
  AlignLeft,
  AppWindow,
  Archive,
  ArrowLeftRight,
  ArrowUpDown,
  AudioWaveform,
  Barcode,
  Binary,
  Bookmark,
  Braces,
  CalendarClock,
  Camera,
  Captions,
  CaseUpper,
  Clapperboard,
  Clock,
  Code,
  Columns2,
  Contrast,
  Copy,
  Crop,
  Download,
  Droplets,
  Eraser,
  Expand,
  EyeOff,
  FileArchive,
  FileCheck,
  FileCode,
  FileDown,
  FileImage,
  FileMinus,
  FileOutput,
  FileText,
  Fingerprint,
  FlaskConical,
  Gauge,
  GitCompare,
  Grid2x2,
  Headphones,
  Hash,
  Highlighter,
  Image as ImageIcon,
  Images,
  Info,
  KeyRound,
  Dices,
  Layers,
  Link2,
  Lock,
  LockOpen,
  MapPin,
  Merge,
  Megaphone,
  Mic,
  Minimize2,
  Music,
  Network,
  Palette,
  PenTool,
  Pipette,
  Presentation,
  QrCode,
  Regex,
  Repeat,
  RotateCw,
  Ruler,
  ScanText,
  Scaling,
  Scissors,
  ShieldCheck,
  Shrink,
  Signature,
  Slice,
  SlidersHorizontal,
  Smile,
  Smartphone,
  Speech,
  Stamp,
  Table,
  TrendingDown,
  Type,
  VenetianMask,
  Volume1,
  WrapText,
  Wand2,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import en from '../i18n/en.json';

/** Compact per-tool metadata; display strings come from i18n/en.json. */
type ToolMeta = readonly [id: string, group: ToolGroup, icon: LucideIcon];

const PDF_GROUP_A: readonly ToolMeta[] = [
  ['merge-pdf', 'a', Copy],
  ['split-pdf', 'a', Scissors],
  ['extract-pages', 'a', FileOutput],
  ['delete-pages', 'a', FileMinus],
  ['organize-pages', 'a', ArrowUpDown],
  ['rotate-pages', 'a', RotateCw],
  ['crop-pages', 'a', Crop],
  ['page-numbers', 'a', Hash],
  ['watermark', 'a', Stamp],
  ['pdf-to-image', 'a', ImageIcon],
  ['image-to-pdf', 'a', FileImage],
  ['scan-to-pdf', 'a', Camera],
  ['sign-pdf', 'a', Signature],
  ['protect-pdf', 'a', Lock],
  ['unlock-pdf', 'a', LockOpen],
  ['optimize-linearize', 'a', Zap],
  ['redact-pdf', 'a', EyeOff],
  ['compare-pdfs', 'a', Columns2],
  ['quick-compress', 'a', Minimize2],
  ['fill-forms', 'a', PenTool],
  ['edit-metadata', 'a', Info],
  ['bookmarks-toc', 'a', Bookmark],
  ['resize-pages', 'a', Expand],
  ['n-up-layout', 'a', Grid2x2],
  ['grayscale-pdf', 'a', Contrast],
  ['pdf-to-text', 'a', FileText],
  ['repair-pdf', 'a', Wrench],
];

const PDF_GROUP_B: readonly ToolMeta[] = [
  ['word-conversion', 'b', Repeat],
  ['excel-conversion', 'b', Table],
  ['powerpoint-conversion', 'b', Presentation],
  ['ocr-pdf', 'b', ScanText],
  ['deep-compress', 'b', Shrink],
  ['pdf-to-pdfa', 'b', Archive],
  ['deep-repair', 'b', FlaskConical],
  ['html-to-pdf', 'b', FileCode],
];

const MEDIA_TOOLS: readonly ToolMeta[] = [
  ['universal-downloader', 'c', Download],
  ['video-converter', 'b', Clapperboard],
  ['video-compressor', 'b', Gauge],
  ['video-trimmer', 'b', Slice],
  ['video-merger', 'b', Merge],
  ['extract-audio', 'b', Music],
  ['video-to-gif', 'b', Images],
  ['gif-to-video', 'b', FileImage],
  ['audio-converter', 'b', AudioWaveform],
  ['audio-compressor', 'b', Volume1],
  ['audio-trimmer', 'b', Scissors],
  ['loudness-normalizer', 'b', SlidersHorizontal],
  ['burn-subtitles', 'b', Layers],
  ['resolution-changer', 'b', Scaling],
  ['transcribe-media', 'a', Mic],
  ['auto-captions', 'a', Captions],
  ['text-to-speech', 'b', Speech],
  ['pdf-to-audiobook', 'b', Headphones],
];

const IMAGE_TOOLS: readonly ToolMeta[] = [
  ['image-converter', 'a', ArrowLeftRight],
  ['image-compressor', 'a', TrendingDown],
  ['image-resizer', 'a', Scaling],
  ['batch-image-processing', 'a', ImageIcon],
  ['background-remover', 'a', Eraser],
  ['heic-converter', 'a', Smartphone],
  ['favicon-generator', 'a', AppWindow],
  ['image-base64', 'a', Binary],
  ['screenshot-annotator', 'a', Highlighter],
  ['meme-generator', 'a', Smile],
  ['exif-inspector', 'a', MapPin],
  ['image-ocr', 'a', ScanText],
  ['svg-optimizer', 'a', Wand2],
  ['palette-extractor', 'a', Palette],
];

const DEVTEXT_TOOLS: readonly ToolMeta[] = [
  ['json-formatter', 'a', Braces],
  ['yaml-json', 'a', ArrowLeftRight],
  ['csv-json', 'a', Table],
  ['xml-formatter', 'a', Code],
  ['base64', 'a', Binary],
  ['url-encoder', 'a', Link2],
  ['jwt-decoder', 'a', KeyRound],
  ['hash-generator', 'a', Fingerprint],
  ['uuid-generator', 'a', Dices],
  ['regex-tester', 'a', Regex],
  ['text-diff', 'a', GitCompare],
  ['minifier-beautifier', 'a', WrapText],
  ['markdown-converter', 'a', FileText],
  ['markdown-to-pdf', 'a', FileDown],
  ['color-converter', 'a', Pipette],
  ['gradient-generator', 'a', Droplets],
  ['cron-parser', 'a', Clock],
  ['timestamp-converter', 'a', CalendarClock],
  ['case-converter', 'a', CaseUpper],
  ['slug-generator', 'a', Type],
  ['lorem-ipsum', 'a', AlignLeft],
  ['qr-code', 'a', QrCode],
  ['barcode-generator', 'a', Barcode],
  ['password-generator', 'a', ShieldCheck],
  ['fake-data-generator', 'a', VenetianMask],
  ['unit-converter', 'a', Ruler],
  ['zip-unzip', 'a', FileArchive],
  ['file-hash-checker', 'a', FileCheck],
  ['sitemap-generator', 'a', Network],
  ['og-preview', 'a', Megaphone],
];

/** Build-phase each tool ships in (PROJECT_SPEC Section 15). */
const PHASE_OVERRIDES: Readonly<Record<string, number>> = {
  // Piper TTS + PDF→audiobook are not assigned an explicit phase by
  // Section 15; they ride with the media speech phase (conservative choice,
  // recorded in DECISIONS.md D-012).
  'text-to-speech': 9,
  'pdf-to-audiobook': 9,
};

function phaseFor(suite: SuiteId, id: string, group: ToolGroup): number {
  const override = PHASE_OVERRIDES[id];
  if (override !== undefined) return override;
  switch (suite) {
    case 'pdf':
      return group === 'a' ? 3 : 4;
    case 'media':
      return group === 'c' ? 8 : group === 'a' ? 9 : 7;
    case 'image':
      return 5;
    case 'devtext':
      return 6;
  }
}

/* ------------------------------------------------------------------ */
/* i18n accessors                                                      */
/* ------------------------------------------------------------------ */

const STRINGS = en as {
  suites: Record<string, { name: string; caption: string }>;
  badge: { instant: string; setup: string };
  ui: Record<string, string>;
  tools: Record<string, { name: string; description: string }>;
};

function toolStrings(id: string): { name: string; description: string } {
  const entry = STRINGS.tools[id];
  if (entry === undefined) {
    throw new Error(`Missing i18n string for tool '${id}' — add it to src/i18n/en.json`);
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export interface RegisteredTool extends ToolDefinition {
  /** Target phase per Section 15; tools render as designed placeholders until then. */
  phase: number;
  icon: LucideIcon;
}

function register(suite: SuiteId, metas: readonly ToolMeta[]): RegisteredTool[] {
  return metas.map(([id, group, icon]) => {
    const s = toolStrings(id);
    return { id, suite, group, icon, phase: phaseFor(suite, id, group), ...s };
  });
}

/** All Section 3 tools, ordered per suite. Single source for grids + routes. */
export const TOOLS_BY_SUITE: Readonly<Record<SuiteId, readonly RegisteredTool[]>> = {
  pdf: [...register('pdf', PDF_GROUP_A), ...register('pdf', PDF_GROUP_B)],
  media: register('media', MEDIA_TOOLS),
  image: register('image', IMAGE_TOOLS),
  devtext: register('devtext', DEVTEXT_TOOLS),
};

export const ALL_TOOLS: readonly RegisteredTool[] = Object.values(TOOLS_BY_SUITE).flat();

export function getTool(id: string): RegisteredTool | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}

export function suiteName(suite: SuiteId): string {
  return STRINGS.suites[suite]?.name ?? suite;
}

export function suiteCaption(suite: SuiteId): string {
  return STRINGS.suites[suite]?.caption ?? '';
}

export function badgeLabel(group: ToolGroup): string {
  return group === 'a' ? STRINGS.badge.instant : STRINGS.badge.setup;
}
