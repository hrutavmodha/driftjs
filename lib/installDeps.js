/**
 * lib/installDeps.js — runs `npm install` inside the new project.
 * Returns { ok, stderr } so the caller can decide how to report failure
 * without the whole `drift create` command crashing.
 */

import { run } from '../utils/exec.js';

export async function installDependencies(targetDir) {
  const result = await run('npm install', targetDir);
  return { ok: result.ok, stderr: result.stderr };
}
