import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { driftPlugin } from './packages/vite-plugin/src/index.js';

export default defineConfig({
  plugins: [driftPlugin()],
  test: {
    projects: [
      {
        test: {
          name: 'compiler',
          include: ['packages/compiler/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'utils',
          include: ['packages/utils/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'ssr',
          include: ['packages/ssr/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'vite-plugin',
          include: ['packages/vite-plugin/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'cli',
          include: ['packages/cli/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [driftPlugin()],
        test: {
          name: 'dom',
          include: ['packages/dom/tests/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
            ],
            headless: true,
          },
        },
      },
      {
        plugins: [driftPlugin()],
        test: {
          name: 'router',
          include: ['packages/router/tests/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
            ],
            headless: true,
          },
        },
      },
    ],
  },
});