import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        server: path.resolve(__dirname, 'src/server.ts'),
        extension: path.resolve(__dirname, 'src/extension.ts'),
      },
      formats: ['cjs'],
    },
    rolldownOptions: {
      external: ['vscode'],
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
