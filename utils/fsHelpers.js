/**
 * utils/fsHelpers.js
 * ---------------------------------------------------------------------------
 * Small, dependency-free wrappers around fs/promises used across commands.
 * Centralising these keeps commands/*.js readable and makes error handling
 * consistent (every helper throws a clear Error instead of a raw Node code).
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Does a path already exist on disk? */
export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** Recursively create a directory (no-op if it already exists). */
export async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

/** Create many directories in one call, e.g. ['src', 'src/components']. */
export async function ensureDirs(baseDir, subDirs) {
  await Promise.all(subDirs.map((dir) => ensureDir(path.join(baseDir, dir))));
}

/** Write a UTF-8 text file, creating parent directories if needed. */
export async function writeFile(targetPath, contents) {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, contents, 'utf-8');
}

/** Recursively copy a directory tree (used to copy templates/ into a new project). */
export async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/** Is a directory empty (or does it not exist yet)? Used to protect existing folders. */
export async function isDirEmpty(targetPath) {
  if (!(await pathExists(targetPath))) return true;
  const files = await fs.readdir(targetPath);
  return files.length === 0;
}
