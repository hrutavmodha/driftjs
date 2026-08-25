import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    environment: 'node',
  },
  build: {
    outDir: 'dist',
    minify: true,
    emptyOutDir: true,
    lib: {
      formats: ['es', 'cjs'],
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DriftVitePlugin',
      fileName: (format: string) => `index-${format}.js`,
    },
    rolldownOptions: {
      external: [
        'vite',
        /^node:/,
        /^@driftjs\//,
      ],
    },
  },
});
