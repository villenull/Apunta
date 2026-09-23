/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_PORT = process.env['APUNTA_PORT'] ?? '7717';

export default defineConfig({
  plugins: [react()],
  // Hard rule: nothing is fetched from the network at runtime, so every asset
  // is inlined or emitted into web/dist and served by our own server.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/web/src/hooks/useDocumentTitle.') || id.includes('/web/src/components/TopBar.')) {
            return 'app-shared';
          }
          if (id.includes('/node_modules/react') || id.includes('/node_modules/@remix-run/router')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: false,
      },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
  },
});
