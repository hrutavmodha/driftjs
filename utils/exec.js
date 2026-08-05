/**
 * utils/exec.js
 * ---------------------------------------------------------------------------
 * Promise wrapper around child_process.exec so commands can `await` shell
 * calls (git init, npm install) without callback nesting. Resolves false on
 * failure instead of throwing, so callers can treat optional steps (like git)
 * as "best effort" and keep scaffolding even if git isn't installed.
 * ---------------------------------------------------------------------------
 */

import { exec } from 'node:child_process';

export function run(command, cwd) {
  return new Promise((resolve) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error, stdout, stderr });
      } else {
        resolve({ ok: true, stdout, stderr });
      }
    });
  });
}

/** True if a CLI binary (git, npm, ...) is available on PATH. */
export async function commandExists(bin) {
  const checkCmd = process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`;
  const result = await run(checkCmd);
  return result.ok;
}
