import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    // Render-pipeline tests (pdfjs render + pixelmatch + re-encode) take
    // multiple seconds each — the 5s default flakes under turbo's parallel
    // workspace load. 60s is generous and still bounded.
    testTimeout: 60_000,
  },
});
