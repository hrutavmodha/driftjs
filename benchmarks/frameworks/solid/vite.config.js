import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  optimizeDeps: {
    rolldownOptions: {},
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rolldownOptions: {},
  },
});
