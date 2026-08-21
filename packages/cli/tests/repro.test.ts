import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installDependencies } from '../src/index.js';

describe('create-drift (CLI) - Reproduction Test Cases', () => {
  const tmpDir = path.join(process.cwd(), 'packages/cli/scratch-repro-test');

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('installDependencies rejects or safely escapes malicious package manager input with shell metacharacters', () => {
    const targetDir = tmpDir;
    const maliciousPm = 'npm; touch /tmp/drift-pwned';

    expect(() => {
      installDependencies(targetDir, maliciousPm);
    }).toThrow();
  });
});
