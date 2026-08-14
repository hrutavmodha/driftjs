import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'packages', 'cli', 'template');

fs.rmSync(targetDir, { recursive: true, force: true });
console.log('🧹 Cleaned up packages/cli/template');
