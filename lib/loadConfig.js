/**
 * lib/loadConfig.js — loads drift.config.js from cwd, merged over defaults.
 * Commands (dev/build/serve) call this so they all agree on srcDir/outDir/port.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pathExists } from '../utils/fsHelpers.js';

const DEFAULTS = {
  name: 'drift-app',
  port: 3000,
  srcDir: 'src',
  outDir: 'dist',
  publicDir: 'public',
};

export async function loadConfig(rootDir = process.cwd()) {
  const configPath = path.join(rootDir, 'drift.config.js');

  if (!(await pathExists(configPath))) {
    return { ...DEFAULTS, rootDir };
  }

  const mod = await import(pathToFileURL(configPath).href);
  return { ...DEFAULTS, ...(mod.default ?? {}), rootDir };
}
