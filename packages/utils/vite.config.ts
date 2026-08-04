import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'DriftUtils',
      fileName: (format) => `index-${format}.js`,
    },
    rollupOptions: {
      external: [],
    },
  },
});
