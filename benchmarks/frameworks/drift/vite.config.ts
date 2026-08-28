import { defineConfig } from 'vite';
import { driftPlugin } from 'driftjs-vite-plugin';

export default defineConfig({
  plugins: [driftPlugin()],
  optimizeDeps: {
    rolldownOptions: {},
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rolldownOptions: {},
  },
});
