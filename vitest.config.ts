import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { driftPlugin } from './packages/vite-plugin/src/index.js';

export default defineConfig({
  test: {
    
    projects: [
      {
        test: {
          name: 'compiler',
          include: ['packages/compiler/tests/**/*.test.ts'],
          exclude: ['packages/compiler/dist'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'utils',
          include: ['packages/utils/tests/**/*.test.ts'],
          exclude: ['packages/utils/dist'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'ssr',
          include: ['packages/ssr/tests/**/*.test.ts'],
          exclude: ['packages/ssr/dist'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'vite-plugin',
          include: ['packages/vite-plugin/tests/**/*.test.ts'],
          exclude: ['packages/vite-plugin/dist'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'cli',
          include: ['packages/cli/tests/**/*.test.ts'],
          exclude: ['packages/cli/dist'],
          environment: 'node',
        },
      },
      {
        plugins: [driftPlugin()],
        test: {
          name: 'dom',
          include: ['packages/dom/tests/**/*.test.ts'],
          exclude: ['packages/dom/dist'],
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
          exclude: ['packages/router/dist'],
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