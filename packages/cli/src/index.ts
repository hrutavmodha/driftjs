import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import type { ScaffoldOptions } from '../types/index.js';

export * from '../types/index.js';

/**
 * Scaffolds a new DriftJS project by copying the starter template.
 */
export function scaffoldProject(options: ScaffoldOptions): void {
  const { projectName, targetDir, templateDir, renderMode } = options;

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found at: ${templateDir}`);
  }

  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy template files recursively
  copyDirectory(templateDir, targetDir);

  // Update target package.json with custom project name and rendering dependencies
  const targetPkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(targetPkgPath)) {
    const pkgData = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
    pkgData.name = projectName;

    if (pkgData.dependencies) {
      if (renderMode === 'csr') {
        delete pkgData.dependencies['driftjs-ssr'];
      } else if (renderMode === 'ssr') {
        delete pkgData.dependencies['driftjs-dom'];
      }
    }

    // Sanitize workspace:* protocols so npm/yarn/bun/pnpm work seamlessly
    sanitizeDependencies(pkgData.dependencies);
    sanitizeDependencies(pkgData.devDependencies);

    fs.writeFileSync(targetPkgPath, JSON.stringify(pkgData, null, 2), 'utf8');
  }

  const pm = options.packageManager || detectPackageManager();

  if (options.autoInstall) {
    installDependencies(targetDir, pm);
  }

  if (options.autoRun) {
    startDevServer(targetDir, pm);
  }
}

function sanitizeDependencies(deps?: Record<string, string>): void {
  if (!deps) return;
  for (const [key, value] of Object.entries(deps)) {
    if (typeof value === 'string' && value.startsWith('workspace:')) {
      const cleanVersion = value.replace('workspace:', '').trim();
      deps[key] = cleanVersion === '*' ? '^0.0.1' : cleanVersion;
    }
  }
}

export function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' | 'bun' {
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (userAgent.startsWith('bun')) return 'bun';
  return 'npm';
}

export function installDependencies(targetDir: string, pm: string): void {
  console.log(`\n📦 \x1b[36mInstalling dependencies with ${pm}...\x1b[0m\n`);
  execSync(`${pm} install`, {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

export function startDevServer(targetDir: string, pm: string): void {
  console.log(`\n⚡ \x1b[32mStarting DriftJS Vite dev server with ${pm} dev...\x1b[0m\n`);
  const args = pm === 'npm' ? ['run', 'dev'] : ['dev'];

  spawn(pm, args, {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

function copyDirectory(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
