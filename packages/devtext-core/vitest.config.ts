import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // AVIF encode can be slow on modest fixtures; match pdf-core's raised
    // timeout discipline.
    testTimeout: 60_000,
    pool: 'forks',
  },
});
