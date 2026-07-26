import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename);



export default defineConfig({
    build: {
        outDir: 'dist',
        minify: true,
        emptyOutDir: true,
        lib: {
            formats: ['es', 'cjs'],
            entry: resolve(__dirname, '../src/index.ts'),
            name: 'DriftCompiler',
            fileName: (format: string) => format === 'cjs' ? 'drift.cjs' : `drift.mjs`
        }
    }
})