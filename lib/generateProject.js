/**
 * lib/generateProject.js
 * ---------------------------------------------------------------------------
 * Pure(ish) generation logic used by commands/create.js. Kept separate from
 * the Commander command so it can be unit-tested or reused (e.g. by an IDE
 * extension) without pulling in CLI argument parsing.
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDirs, writeFile, copyDir } from '../utils/fsHelpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../templates');

const PROJECT_FOLDERS = [
  'src',
  'src/components',
  'src/pages',
  'src/assets',
  'public',
];

/** Replace {{PROJECT_NAME}} placeholders in a template string. */
function fill(template, projectName) {
  return template.replaceAll('{{PROJECT_NAME}}', projectName);
}

/**
 * Generates a full DriftJS project on disk.
 * @param {string} targetDir  Absolute path to the new project directory.
 * @param {string} projectName  Name used in package.json / README / titles.
 * @param {(step: string) => void} onStep  Optional progress callback.
 */
export async function generateProject(targetDir, projectName, onStep = () => {}) {
  // 1. Folder structure
  onStep('folders');
  await ensureDirs(targetDir, PROJECT_FOLDERS);

  // 2. Copy the static starter tree (index.html, src/*, public/*)
  onStep('starter-files');
  await copyDir(path.join(TEMPLATES_DIR, 'starter'), targetDir);

  // Fill {{PROJECT_NAME}} inside copied text files that need it.
  const indexHtmlPath = path.join(targetDir, 'index.html');
  const homePagePath = path.join(targetDir, 'src/pages/Home.js');
  await Promise.all([
    fillInPlace(indexHtmlPath, projectName),
    fillInPlace(homePagePath, projectName),
  ]);

  // 3. Generated config files from *.template
  onStep('package.json');
  const pkgTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'package.json.template'), 'utf-8');
  await writeFile(path.join(targetDir, 'package.json'), fill(pkgTemplate, projectName));

  onStep('drift.config.js');
  const configTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'drift.config.js.template'), 'utf-8');
  await writeFile(path.join(targetDir, 'drift.config.js'), fill(configTemplate, projectName));

  onStep('README.md');
  const readmeTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'README.md.template'), 'utf-8');
  await writeFile(path.join(targetDir, 'README.md'), fill(readmeTemplate, projectName));

  onStep('.gitignore');
  const gitignoreTemplate = await fs.readFile(path.join(TEMPLATES_DIR, 'gitignore.template'), 'utf-8');
  await writeFile(path.join(targetDir, '.gitignore'), gitignoreTemplate);
}

async function fillInPlace(filePath, projectName) {
  const content = await fs.readFile(filePath, 'utf-8');
  await fs.writeFile(filePath, fill(content, projectName), 'utf-8');
}
