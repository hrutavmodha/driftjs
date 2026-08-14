import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'template');
const destDir = path.join(rootDir, 'packages', 'cli', 'template');

fs.rmSync(destDir, { recursive: true, force: true });
fs.cpSync(srcDir, destDir, {
  recursive: true,
  filter: (src) => !src.includes('node_modules') && !src.includes('dist'),
});

console.log('⚡ Successfully copied template to packages/cli/template');
