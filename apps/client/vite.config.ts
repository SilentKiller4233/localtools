import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port matches PROJECT_SPEC Section 10 (Docker/client convention).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
