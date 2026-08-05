/**
 * lib/git.js — initializes a git repo in a freshly scaffolded project.
 * Best-effort: returns false instead of throwing if git is missing or fails,
 * so `drift create` still succeeds without git installed.
 */

import { run, commandExists } from '../utils/exec.js';

export async function initGitRepo(targetDir) {
  if (!(await commandExists('git'))) return false;

  const init = await run('git init', targetDir);
  if (!init.ok) return false;

  await run('git add -A', targetDir);
  await run('git commit -m "chore: initial commit from driftjs-cli"', targetDir);
  return true;
}
