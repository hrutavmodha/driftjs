import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scaffoldProject, installDependencies } from '../src/index.js';

describe('create-drift (CLI) - Reproduction Test Cases', () => {
  const tmpDir = path.join(process.cwd(), 'packages/cli/scratch-repro-test');
  const templateDir = path.resolve(process.cwd(), 'packages/cli/template');

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

  it('scaffoldProject in SSR mode retains driftjs-dom dependency for client hydration', () => {
    const targetDir = path.join(tmpDir, 'ssr-app');

    scaffoldProject({
      projectName: 'ssr-app',
      targetDir,
      templateDir,
      renderMode: 'ssr',
      overwriteMode: 'empty',
    });

    const pkgJsonPath = path.join(targetDir, 'package.json');
    expect(fs.existsSync(pkgJsonPath)).toBe(true);

    const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    expect(pkgData.dependencies).toBeDefined();
    expect(pkgData.dependencies['driftjs-dom']).toBeDefined();
    expect(pkgData.dependencies['driftjs-ssr']).toBeDefined();
  });

  it('installDependencies rejects or safely escapes malicious package manager input with shell metacharacters', () => {
    const targetDir = tmpDir;
    const maliciousPm = 'npm; touch /tmp/drift-pwned';

    expect(() => {
      installDependencies(targetDir, maliciousPm);
    }).toThrow();
  });
});
