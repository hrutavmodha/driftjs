import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scaffoldProject } from '../src/index.js';

describe('create-drift (CLI) - Reproduction Test Cases for Identified Bugs', () => {
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

  // BUG-10: Scaffolding in SSR mode removes driftjs-dom, causing client hydration to fail on startup
  it('BUG-10 [Correctness]: scaffoldProject in SSR mode retains driftjs-dom dependency for client hydration', () => {
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

    // In template/src/main.ts, `import { mount, hydrate } from 'driftjs-dom'` is present for client hydration
    // Expected true behavior: driftjs-dom is retained in dependencies so client hydration works
    // Buggy current behavior: scaffoldProject deletes pkgData.dependencies['driftjs-dom'], breaking hydration
    expect(pkgData.dependencies).toBeDefined();
    expect(pkgData.dependencies['driftjs-dom']).toBeDefined();
    expect(pkgData.dependencies['driftjs-ssr']).toBeDefined();
  });
});
