/**
 * Image tool worker: dispatches every image-core tool in the worker
 * thread. @jsquash wasm + onnxruntime load lazily via dynamic imports
 * (Vite code-splits them out of the main bundle).
 */

import * as core from '@localtools/image-core';
import type { ImageToolRequest, ImageToolResponse } from '../lib/image-worker-client';

const decoder = new TextDecoder();

function fail(id: number, code: string, message: string): void {
  const msg: ImageToolResponse = { id, ok: false, code, message };
  self.postMessage(msg);
}

function done(id: number, result: unknown): void {
  const msg: ImageToolResponse = { id, ok: true, result };
  self.postMessage(msg);
}

interface FileInput {
  name: string;
  bytes: Uint8Array;
}

self.addEventListener('message', (event: MessageEvent<ImageToolRequest>) => {
  const { id, tool, options, files } = event.data;
  const file0: FileInput | undefined = files[0];
  const bytes = file0?.bytes ?? new Uint8Array(0);
  void (async () => {
    try {
      switch (tool) {
        case 'image-converter':
          done(
            id,
            await core.convertImage(
              bytes,
              options as { target: core.TargetFormat; quality?: number },
            ),
          );
          return;
        case 'image-compressor': {
          const r = await core.compressImage(
            bytes,
            options as {
              preset: core.QualityPreset;
              quality?: number;
              target?: 'png' | 'jpeg' | 'webp' | 'avif';
            },
          );
          done(id, { output: r.bytes, originalSize: r.originalSize, newSize: r.newSize });
          return;
        }
        case 'image-resizer': {
          const r = await core.resizeImage(
            bytes,
            options as {
              mode: core.ResizeMode;
              target?: 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp';
              width?: number;
              height?: number;
              percent?: number;
              maxDimension?: number;
            },
          );
          done(id, { output: r.bytes, width: r.width, height: r.height });
          return;
        }
        case 'batch-image-processing': {
          const outs = await core.runBatch({
            op: (options as { op: 'convert' | 'compress' | 'resize' }).op,
            files: files.map((f) => f.bytes),
            options: (options as { options: Record<string, unknown> }).options,
          });
          done(id, outs);
          return;
        }
        case 'heic-converter':
          done(
            id,
            await core.convertHeic(bytes, options as { target: 'jpeg' | 'png'; quality?: number }),
          );
          return;
        case 'image-base64': {
          const direction = (options as { direction: 'encode' | 'decode' }).direction;
          if (direction === 'encode') {
            done(id, core.imageToDataUri(bytes, extOf(file0)));
          } else {
            const r = core.dataUriToImage((options as { uri: string }).uri);
            done(id, { text: decoder.decode(r.bytes), ext: r.ext, bytes: r.bytes });
          }
          return;
        }
        case 'favicon-generator': {
          const r = await core.generateFavicon(bytes, options);
          done(id, r);
          return;
        }
        case 'palette-extractor': {
          const palette = await core.paletteFromImage(bytes, (options as { k?: number }).k);
          done(id, palette);
          return;
        }
        case 'exif-inspector': {
          const report = await core.readExif(bytes);
          done(id, report);
          return;
        }
        case 'exif-strip':
          done(id, core.stripExif(bytes));
          return;
        case 'svg-optimizer': {
          const svgText = decoder.decode(bytes);
          const r = core.optimizeSvg(svgText, options);
          done(id, { svg: r.svg, originalSize: r.originalSize, newSize: r.newSize });
          return;
        }
        case 'meme-generator':
          done(id, await core.makeMeme(bytes, options));
          return;
        case 'screenshot-annotator':
          done(
            id,
            await core.annotateScreenshot(bytes, options as unknown as core.AnnotateOptions),
          );
          return;
        case 'image-ocr': {
          const r = await core.ocrImage(bytes, options);
          done(id, r);
          return;
        }
        case 'background-remover': {
          const r = await core.removeBackground(bytes, options);
          done(id, { output: r.bytes, foregroundRatio: r.foregroundRatio });
          return;
        }
        case 'image-formats-check': {
          // worker-warmup probe used by pages
          done(id, { ok: true });
          return;
        }
        default:
          fail(id, 'invalid-option', `Unknown image tool: ${tool}`);
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      fail(id, e.code ?? 'operation-failed', e.message ?? 'The operation failed.');
    }
  })();
});

function extOf(f: FileInput | undefined): string {
  if (f === undefined) return 'png';
  const m = /\.([a-z0-9]+)$/i.exec(f.name);
  return (m?.[1] ?? 'png').toLowerCase();
}
