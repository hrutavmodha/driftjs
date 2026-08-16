import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scaffoldProject, detectPackageManager } from '../src/index.js';

describe('DriftJS CLI Scaffolder', () => {
  const testDir = path.resolve(process.cwd(), 'scratch/cli-test-temp');
  const templateDir = path.resolve(testDir, 'fake-template');
  const targetDir = path.resolve(testDir, 'my-test-app');

  beforeEach(() => {
    // Clean and set up test fixture
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(templateDir, { recursive: true });

    // Create dummy template files
    fs.writeFileSync(path.join(templateDir, 'index.html'), '<h1>Test Template</h1>');
    fs.writeFileSync(
      path.join(templateDir, 'package.json'),
      JSON.stringify(
        {
          name: 'starter-template',
          version: '0.0.0',
          dependencies: {
            'driftjs-dom': 'workspace:*',
            'driftjs-ssr': 'workspace:*',
          },
        },
        null,
        2
      )
    );

    const srcDir = path.join(templateDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'App.drift'), '<script>\n  let count = 0;\n</script>');

    // Create ignored folders
    const nodeModulesDir = path.join(templateDir, 'node_modules');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.writeFileSync(path.join(nodeModulesDir, 'dummy.txt'), 'ignored');

    const distDir = path.join(templateDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'build.js'), 'ignored');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should scaffold project files correctly from template directory', () => {
    scaffoldProject({
      projectName: 'my-custom-app',
      targetDir,
      templateDir,
    });

    expect(fs.existsSync(path.join(targetDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/App.drift'))).toBe(true);
    expect(fs.readFileSync(path.join(targetDir, 'index.html'), 'utf8')).toContain('<h1>Test Template</h1>');
  });

  it('should update target package.json with custom project name', () => {
    scaffoldProject({
      projectName: 'my-custom-app',
      targetDir,
      templateDir,
    });

    const targetPkgPath = path.join(targetDir, 'package.json');
    expect(fs.existsSync(targetPkgPath)).toBe(true);

    const pkgData = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
    expect(pkgData.name).toBe('my-custom-app');
    expect(pkgData.version).toBe('0.0.0');
  });

  it('should sanitize workspace:* dependency specifiers for standard package managers', () => {
    scaffoldProject({
      projectName: 'clean-deps-app',
      targetDir,
      templateDir,
    });

    const pkgData = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkgData.dependencies['driftjs-dom']).not.toContain('workspace:');
  });

  it('should remove driftjs-ssr dependency, server.js, and scripts.serve when CSR mode is selected', () => {
    fs.writeFileSync(path.join(templateDir, 'server.js'), '// SSR server');

    scaffoldProject({
      projectName: 'csr-app',
      targetDir,
      templateDir,
      renderMode: 'csr',
    });

    const pkgData = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkgData.dependencies['driftjs-dom']).toBeDefined();
    expect(pkgData.dependencies['driftjs-ssr']).toBeUndefined();
    expect(fs.existsSync(path.join(targetDir, 'server.js'))).toBe(false);
  });

  it('should remove driftjs-dom dependency when SSR mode is selected', () => {
    scaffoldProject({
      projectName: 'ssr-app',
      targetDir,
      templateDir,
      renderMode: 'ssr',
    });

    const pkgData = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    expect(pkgData.dependencies['driftjs-ssr']).toBeDefined();
    expect(pkgData.dependencies['driftjs-dom']).toBeUndefined();
  });

  it('should skip node_modules and dist directories during copy', () => {
    scaffoldProject({
      projectName: 'my-custom-app',
      targetDir,
      templateDir,
    });

    expect(fs.existsSync(path.join(targetDir, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'dist'))).toBe(false);
  });

  it('should throw error if template directory does not exist', () => {
    expect(() => {
      scaffoldProject({
        projectName: 'my-app',
        targetDir: path.join(testDir, 'fail-target'),
        templateDir: path.join(testDir, 'non-existent-template'),
      });
    }).toThrow('Template directory not found');
  });

  it('should detect package manager correctly from user agent', () => {
    const origUserAgent = process.env.npm_config_user_agent;

    process.env.npm_config_user_agent = 'pnpm/11.17.0 npm/? node/v20.0.0 linux x64';
    expect(detectPackageManager()).toBe('pnpm');

    process.env.npm_config_user_agent = 'yarn/1.22.19 npm/? node/v20.0.0';
    expect(detectPackageManager()).toBe('yarn');

    process.env.npm_config_user_agent = 'bun/1.0.0';
    expect(detectPackageManager()).toBe('bun');

    process.env.npm_config_user_agent = 'npm/10.0.0 node/v20.0.0';
    expect(detectPackageManager()).toBe('npm');

    process.env.npm_config_user_agent = origUserAgent;
  });

  it('should clear existing directory when overwriteMode is empty', () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'old-file.txt'), 'old content');

    scaffoldProject({
      projectName: 'cleared-app',
      targetDir,
      templateDir,
      overwriteMode: 'empty',
    });

    expect(fs.existsSync(path.join(targetDir, 'old-file.txt'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'index.html'))).toBe(true);
  });

  it('should preserve existing files when overwriteMode is ignore', () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'custom-config.json'), '{}');

    scaffoldProject({
      projectName: 'merged-app',
      targetDir,
      templateDir,
      overwriteMode: 'ignore',
    });

    expect(fs.existsSync(path.join(targetDir, 'custom-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'index.html'))).toBe(true);
  });
});
