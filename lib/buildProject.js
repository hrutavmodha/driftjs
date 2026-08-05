/**
 * lib/buildProject.js
 * ---------------------------------------------------------------------------
 * Production "build" for the starter runtime: since the starter app runs on
 * native ES modules with no compiler step, building means copying index.html,
 * src/ and public/ into outDir, ready to be served as static files.
 * (Swap this for a real bundler integration once you outgrow the starter.)
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, copyDir, pathExists } from '../utils/fsHelpers.js';

export async function buildProject({ rootDir, srcDir, publicDir, outDir }, onStep = () => {}) {
  const outPath = path.join(rootDir, outDir);
  await fs.rm(outPath, { recursive: true, force: true });
  await ensureDir(outPath);

  onStep('index.html');
  const indexHtml = path.join(rootDir, 'index.html');
  if (await pathExists(indexHtml)) {
    await fs.copyFile(indexHtml, path.join(outPath, 'index.html'));
  }

  onStep(srcDir);
  const srcPath = path.join(rootDir, srcDir);
  if (await pathExists(srcPath)) {
    await copyDir(srcPath, path.join(outPath, srcDir));
  }

  onStep(publicDir);
  const publicPath = path.join(rootDir, publicDir);
  if (await pathExists(publicPath)) {
    await copyDir(publicPath, path.join(outPath, publicDir));
  }

  return outPath;
}
