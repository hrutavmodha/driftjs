import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    rolldownOptions: {},
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rolldownOptions: {},
  },
});
