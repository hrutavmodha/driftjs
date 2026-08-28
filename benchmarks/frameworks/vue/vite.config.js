import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    rolldownOptions: {},
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rolldownOptions: {},
  },
});
