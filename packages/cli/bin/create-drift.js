#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  scaffoldProject,
  detectPackageManager,
  installDependencies,
  startDevServer,
  isDirectoryNotEmpty,
} from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const isYes = args.includes('-y') || args.includes('--yes') || args.includes('--auto');
  const nonFlagArgs = args.filter((a) => !a.startsWith('-'));

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
DriftJS Project Scaffolder CLI

Usage:
  npx create-drift <project-directory> [options]
  npx @driftjs/cli <project-directory> [options]

Options:
  -y, --yes    Automatically use defaults (CSR mode, auto-install, auto-start server)
  -h, --help   Display this help message

Examples:
  npx create-drift my-app
  npx create-drift my-app -y
  npx create-drift ./
`);
    process.exit(0);
  }

  p.intro(`${pc.bgCyan(pc.black(' create-drift '))} ${pc.bold('DriftJS Project Scaffolder ⚡')}`);

  let targetArg = nonFlagArgs[0];

  if (!targetArg && !isYes) {
    const response = await p.text({
      message: 'Where would you like to create your new DriftJS project?',
      placeholder: './my-drift-app',
      defaultValue: 'my-drift-app',
      validate(value) {
        if (value.trim().length === 0) return 'Directory name cannot be empty.';
      },
    });

    if (p.isCancel(response)) {
      p.cancel('Scaffolding cancelled.');
      process.exit(0);
    }
    targetArg = response;
  }

  targetArg = targetArg || 'my-drift-app';
  const targetDir = path.resolve(process.cwd(), targetArg);
  const projectName = path.basename(targetDir) || 'my-drift-app';
  const pm = detectPackageManager();

  let overwriteMode = 'ignore';

  if (isDirectoryNotEmpty(targetDir) && !isYes) {
    const action = await p.select({
      message: `Target directory "${pc.yellow(targetArg)}" is not empty. How would you like to proceed?`,
      options: [
        {
          value: 'empty',
          label: 'Clear directory and scaffold fresh project',
          hint: 'Deletes existing files in directory',
        },
        {
          value: 'ignore',
          label: 'Scaffold in place (merge / overwrite existing files)',
          hint: 'Keeps existing files and adds template files',
        },
        {
          value: 'cancel',
          label: 'Cancel scaffolding',
        },
      ],
    });

    if (p.isCancel(action) || action === 'cancel') {
      p.cancel('Scaffolding cancelled.');
      process.exit(0);
    }
    overwriteMode = action;
  }

  // Prompt rendering mode (CSR vs SSR)
  let renderMode = 'csr';
  if (!isYes) {
    const modeSelect = await p.select({
      message: 'Select rendering target:',
      initialValue: 'csr',
      options: [
        {
          value: 'csr',
          label: 'Client-Side Rendering',
        },
        {
          value: 'ssr',
          label: 'Server-Side Rendering',
        },
      ],
    });

    if (p.isCancel(modeSelect)) {
      p.cancel('Scaffolding cancelled.');
      process.exit(0);
    }
    renderMode = modeSelect;
  }

  // Prompt auto install & auto run
  let autoRun = isYes;
  if (!isYes) {
    const autoConfirm = await p.confirm({
      message: `Would you like us to install dependencies & start the dev server now?`,
      initialValue: true,
    });

    if (p.isCancel(autoConfirm)) {
      p.cancel('Scaffolding cancelled.');
      process.exit(0);
    }
    autoRun = autoConfirm;
  }

  const s = p.spinner();
  s.start(`Scaffolding DriftJS app in ${pc.yellow(targetDir)}...`);

  // Locate template directory (package relative or monorepo root)
  let templateDir = path.resolve(__dirname, '../template');
  if (!fs.existsSync(templateDir)) {
    templateDir = path.resolve(__dirname, '../../../template');
  }

  try {
    scaffoldProject({
      projectName,
      targetDir,
      templateDir,
      renderMode: renderMode,
      overwriteMode: overwriteMode,
    });

    s.stop(`Scaffolded project files in ${pc.yellow(targetDir)}`);

    if (autoRun) {
      p.note(`Running ${pc.cyan(`${pm} install`)} and starting Vite dev server...`);
      installDependencies(targetDir, pm);
      startDevServer(targetDir, pm);
    } else {
      let nextSteps = ``;
      if (targetArg !== '.') {
        nextSteps += `cd ${targetArg}\n`;
      }
      nextSteps += `${pm} install\n${pm} ${pm === 'npm' ? 'run dev' : 'dev'}`;

      p.note(nextSteps, 'Next steps to start your app:');
      p.outro(pc.cyan('Happy coding with DriftJS! ⚡'));
    }
  } catch (err) {
    s.stop('Scaffolding failed.');
    p.cancel(pc.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

main();
