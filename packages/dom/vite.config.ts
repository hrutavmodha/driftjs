import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright() as any,
      instances: [
        { browser: 'chromium' },
      ],
      headless: true,
    },
  },
  build: {
    lib: {
      formats: ['cjs', 'es'],
      entry: path.resolve(__dirname, 'src', 'index.ts'),
      name: 'DriftRuntime',
      fileName: (format: string) => `index-${format}.js`,
    },
    rolldownOptions: {
      external: ['driftjs-shared'],
    },
  },
});
