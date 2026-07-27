import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  build: {
    lib: {
      formats: ['cjs', 'es'],
      entry: path.resolve(__dirname, 'src', 'index.ts'),
      name: 'DriftRuntime',
      fileName: (format: string) => `index-${format}.js`,
    },
    rollupOptions: {
      external: [],
    },
  },
});
