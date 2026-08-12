import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'node:fs',
        'node:path',
        'node:url',
        'node:child_process',
        'node:readline',
        'node:process',
        'fs',
        'path',
        'url',
        'child_process',
        'readline',
        'process',
        'picocolors',
        '@clack/prompts',
      ],
    },
  },
});
