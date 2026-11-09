import { defineConfig } from 'vite';

// Yandex Games serves the build from a nested path, so all asset URLs must be relative.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
