import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Real subprocess tools (LibreOffice cold-start, Ghostscript, Tesseract)
    // can each take tens of seconds on a dev machine — match the pdf-core
    // suite's raised timeout (CI fix 31c388e).
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Engine tests bind real sockets on ephemeral ports; run sequentially
    // to keep port/temp-dir assertions deterministic.
    pool: 'forks',
    fileParallelism: false,
  },
});
