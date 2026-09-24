import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Separate from vite.config.ts: that file's dev-server proxy/env logic has
// nothing to do with running unit tests, and loadEnv() there would run
// against whatever .env happens to be present on the test runner.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mercon/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
