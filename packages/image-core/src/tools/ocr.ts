/**
 * Image OCR (PROJECT_SPEC Section 3.3 — client-side tesseract.js,
 * separate from the engine's native Tesseract).
 *
 * Node + browser dual path: tesseract.js works in both (it loads its
 * wasm + traineddata from its bundled assets; in Node via local files).
 */

import { imageError } from '../types.js';

export interface OcrResult {
  text: string;
  confidence: number;
}

export async function ocrImage(
  bytes: Uint8Array,
  opts: { language?: string } = {},
): Promise<OcrResult> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const language = opts.language ?? 'eng';
  const mod = (await import('tesseract.js')) as unknown as {
    createWorker: (
      lang: string,
      oem?: number,
      options?: Record<string, unknown>,
    ) => Promise<{
      recognize: (image: Uint8Array) => Promise<{ data: { text: string; confidence: number } }>;
      terminate: () => Promise<void>;
    }>;
  };
  const worker = await mod.createWorker(language);
  try {
    const { data } = await worker.recognize(bytes);
    return { text: data.text, confidence: data.confidence };
  } catch {
    throw imageError(
      'operation-failed',
      'OCR failed on this image — try a sharper or larger crop.',
    );
  } finally {
    await worker.terminate().catch(() => {});
  }
}
