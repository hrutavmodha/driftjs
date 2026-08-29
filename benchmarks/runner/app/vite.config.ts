import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    fs: {
      allow: ['..'],
    },
  },
  optimizeDeps: {
    rolldownOptions: {},
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rolldownOptions: {},
  },
});
