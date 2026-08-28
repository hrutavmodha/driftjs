import type { FrameworkDef } from './types.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const benchmarksRoot = resolve(__dirname, '../..');

export const FRAMEWORKS: FrameworkDef[] = [
  {
    id: 'vanilla',
    name: 'VanillaJS',
    dir: resolve(benchmarksRoot, 'frameworks/vanilla'),
    port: 5201,
  },
  {
    id: 'drift',
    name: 'DriftJS',
    dir: resolve(benchmarksRoot, 'frameworks/drift'),
    port: 5202,
  },
  {
    id: 'react',
    name: 'React 19',
    dir: resolve(benchmarksRoot, 'frameworks/react'),
    port: 5203,
  },
  {
    id: 'vue',
    name: 'Vue 3.5',
    dir: resolve(benchmarksRoot, 'frameworks/vue'),
    port: 5204,
  },
  {
    id: 'solid',
    name: 'SolidJS 1.9',
    dir: resolve(benchmarksRoot, 'frameworks/solid'),
    port: 5205,
  },
  {
    id: 'svelte',
    name: 'Svelte 5',
    dir: resolve(benchmarksRoot, 'frameworks/svelte'),
    port: 5206,
  },
];
