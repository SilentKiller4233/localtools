import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { cpSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Server } from 'node:http';

// pdfjs-dist + qpdf-wasm runtime assets, copied verbatim into the build
// (and served in dev) at the URLs pdf-core expects (D-014): /pdfjs/* and
// /wasm/*. Inline plugin — no extra dependency, node:fs only.
const require = createRequire(import.meta.url);

const ASSET_MAPPINGS: [source: string, target: string][] = (() => {
  const pdfjsDir = dirname(require.resolve('pdfjs-dist/package.json'));
  const qpdfWasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
  return [
    [join(pdfjsDir, 'standard_fonts'), 'pdfjs/standard_fonts'],
    [join(pdfjsDir, 'cmaps'), 'pdfjs/cmaps'],
    [join(pdfjsDir, 'wasm'), 'pdfjs/wasm'],
    [qpdfWasm, 'wasm/qpdf.wasm'],
  ];
})();

function copyPdfAssets(dest: string): void {
  for (const [source, target] of ASSET_MAPPINGS) {
    const to = join(dest, target);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(source, to, { recursive: true });
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'localtools-pdf-assets',
      configureServer(server: { middlewares: Server }) {
        // Dev: stream straight from node_modules (no dist yet).
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '';
          for (const [source, target] of ASSET_MAPPINGS) {
            if (url === `/${target}` || url.startsWith(`/${target}/`)) {
              const rel = url.slice(`/${target}/`.length).split('?')[0] ?? '';
              const file = join(source, rel);
              if (rel !== '' && existsSync(file)) {
                res.setHeader(
                  'content-type',
                  file.endsWith('.wasm')
                    ? 'application/wasm'
                    : file.endsWith('.bcmap')
                      ? 'application/octet-stream'
                      : file.endsWith('.pfb')
                        ? 'font/pfb'
                        : 'application/octet-stream',
                );
                createReadStream(file).pipe(res);
                return;
              }
            }
          }
          next();
        });
      },
      closeBundle() {
        copyPdfAssets('dist');
      },
    },
  ],
  server: {
    port: 5173,
  },
  build: {
    // Emit .vite/manifest.json — the Section 14.5 bundle-size gate
    // (scripts/bundle-size-check.mjs) walks the entry's static import
    // graph from it to compute the INITIAL gzipped JS budget (250KB).
    manifest: true,
  },
  worker: {
    // ES-module workers: the pdf tool worker lazy-imports pdfjs/qpdf
    // (code-splitting), which IIFE workers cannot support. All targets
    // that run LocalTools (Chromium via Tauri, modern browsers for Docker)
    // support module workers.
    format: 'es',
  },
});
