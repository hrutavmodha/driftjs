import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import type { ScaffoldOptions } from '../types/index.js';

export * from '../types/index.js';

const ALLOWED_PACKAGE_MANAGERS = new Set<string>(['npm', 'pnpm', 'yarn', 'bun']);

/**
 * Scaffolds a new DriftJS project by copying the starter template.
 */
export function scaffoldProject(options: ScaffoldOptions): void {
  const { projectName, targetDir, templateDir, renderMode, overwriteMode } = options;

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found at: ${templateDir}`);
  }

  if (overwriteMode === 'empty' && fs.existsSync(targetDir)) {
    emptyDirectory(targetDir);
  }

  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy template files recursively
  fs.cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== 'node_modules' && base !== 'dist';
    },
  });

  // Update target package.json with custom project name and rendering dependencies
  const targetPkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(targetPkgPath)) {
    const pkgData = JSON.parse(fs.readFileSync(targetPkgPath, 'utf8'));
    pkgData.name = projectName;
    pkgData.version = '0.0.0';

    if (renderMode === 'csr') {
      if (pkgData.dependencies) {
        delete pkgData.dependencies['driftjs-ssr'];
      }
      if (pkgData.scripts) {
        delete pkgData.scripts['serve'];
      }
      const serverJsPath = path.join(targetDir, 'server.js');
      if (fs.existsSync(serverJsPath)) {
        fs.rmSync(serverJsPath, { force: true });
      }
    }

    // Sanitize workspace:* protocols so npm/yarn/bun/pnpm work seamlessly
    sanitizeDependencies(pkgData.dependencies);
    sanitizeDependencies(pkgData.devDependencies);

    fs.writeFileSync(targetPkgPath, JSON.stringify(pkgData, null, 2), 'utf8');
  }

  const pm = options.packageManager || detectPackageManager();
  if (!ALLOWED_PACKAGE_MANAGERS.has(pm)) {
    throw new Error(`Unsupported or invalid package manager: "${pm}". Allowed package managers: npm, pnpm, yarn, bun`);
  }

  if (options.autoInstall) {
    installDependencies(targetDir, pm);
  }

  if (options.autoRun) {
    startDevServer(targetDir, pm);
  }
}

export function sanitizeDependencies(deps?: Record<string, string>, targetVersion: string = '^0.0.11'): void {
  if (!deps) return;
  const bareVersion = targetVersion.replace(/^[\^~]/, '');
  const defaultCaret = targetVersion.startsWith('^') ? targetVersion : `^${bareVersion}`;
  for (const [key, value] of Object.entries(deps)) {
    if (typeof value === 'string' && value.startsWith('workspace:')) {
      const cleanVersion = value.replace('workspace:', '').trim();
      if (cleanVersion === '*' || cleanVersion === '^' || cleanVersion === '') {
        deps[key] = defaultCaret;
      } else if (cleanVersion === '~') {
        deps[key] = `~${bareVersion}`;
      } else {
        deps[key] = cleanVersion;
      }
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
  if (!ALLOWED_PACKAGE_MANAGERS.has(pm)) {
    throw new Error(`Unsupported or invalid package manager: "${pm}". Allowed package managers: npm, pnpm, yarn, bun`);
  }
  console.log(`\n📦 \x1b[36mInstalling dependencies with ${pm}...\x1b[0m\n`);
  execFileSync(pm, ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

export function startDevServer(targetDir: string, pm: string): void {
  if (!ALLOWED_PACKAGE_MANAGERS.has(pm)) {
    throw new Error(`Unsupported or invalid package manager: "${pm}". Allowed package managers: npm, pnpm, yarn, bun`);
  }
  console.log(`\n⚡ \x1b[32mStarting DriftJS Vite dev server with ${pm} dev...\x1b[0m\n`);
  const args = pm === 'npm' ? ['run', 'dev'] : ['dev'];

  spawn(pm, args, {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

export function emptyDirectory(dirPath: string): void {
  const resolved = path.resolve(dirPath);
  const root = path.parse(resolved).root;
  const home = os.homedir();
  if (resolved === root || (home && resolved === home)) {
    throw new Error(`Cannot empty root or home directory: ${dirPath}`);
  }
  if (!fs.existsSync(resolved)) return;
  for (const file of fs.readdirSync(resolved)) {
    if (file === '.git') continue;
    const fullPath = path.join(resolved, file);
    try {
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(fullPath);
      } else {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}


export function isDirectoryNotEmpty(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;
  const files = fs.readdirSync(dirPath);
  return files.length > 0 && !(files.length === 1 && files[0] === '.git');
}
