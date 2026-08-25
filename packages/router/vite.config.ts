import { defineConfig } from 'vite';
import path from 'path';
import { driftPlugin } from 'driftjs-vite-plugin';

export default defineConfig({
  plugins: [driftPlugin()],
  build: {
    lib: {
      formats: ['es', 'cjs'],
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'DriftRouter',
      fileName: (format) => `index-${format}.js`,
    },
    rolldownOptions: {
      external: ['driftjs-shared', 'driftjs-dom', 'driftjs-compiler'],
    },
  },
});
