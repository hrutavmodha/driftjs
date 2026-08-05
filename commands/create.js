/**
 * commands/create.js
 * ---------------------------------------------------------------------------
 * `drift create <project-name>` — scaffolds a brand-new DriftJS app.
 * Flow: validate target dir -> generate files -> optional git init ->
 * optional npm install -> print next steps. Every step is wrapped in an
 * ora spinner so the user always sees progress.
 * ---------------------------------------------------------------------------
 */

import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';

import { logger } from '../utils/logger.js';
import { pathExists, isDirEmpty } from '../utils/fsHelpers.js';
import { generateProject } from '../lib/generateProject.js';
import { initGitRepo } from '../lib/git.js';
import { installDependencies } from '../lib/installDeps.js';

export function registerCreateCommand(program) {
  program
    .command('create <project-name>')
    .description('Scaffold a new DriftJS application')
    .option('--no-git', 'skip git repository initialization')
    .option('--install', 'install npm dependencies automatically')
    .option('--yes', 'skip confirmation prompts (non-interactive)')
    .action(async (projectName, options) => {
      await createProject(projectName, options);
    });
}

async function createProject(projectName, options) {
  const targetDir = path.resolve(process.cwd(), projectName);
  logger.title(`Creating a new DriftJS app in ${chalk.green(targetDir)}`);

  // Guard: don't silently overwrite an existing non-empty folder.
  if (await pathExists(targetDir)) {
    if (!(await isDirEmpty(targetDir))) {
      if (!options.yes) {
        const { proceed } = await prompts({
          type: 'confirm',
          name: 'proceed',
          message: `Directory "${projectName}" already exists and is not empty. Continue anyway?`,
          initial: false,
        });
        if (!proceed) {
          logger.warn('Aborted.');
          return;
        }
      }
    }
  }

  // 1. Generate the project on disk.
  const genSpinner = ora('Scaffolding project files...').start();
  try {
    await generateProject(targetDir, projectName, (step) => {
      genSpinner.text = `Creating ${step}...`;
    });
    genSpinner.succeed('Project files created');
  } catch (err) {
    genSpinner.fail('Failed to scaffold project');
    logger.error(err.message);
    process.exitCode = 1;
    return;
  }

  // 2. Git init (optional, best-effort).
  if (options.git !== false) {
    const gitSpinner = ora('Initializing git repository...').start();
    const ok = await initGitRepo(targetDir);
    ok ? gitSpinner.succeed('Git repository initialized') : gitSpinner.warn('Skipped git init (git not found)');
  }

  // 3. npm install (optional — off by default, keeps `create` fast).
  let installed = false;
  if (options.install) {
    const installSpinner = ora('Installing dependencies (npm install)...').start();
    const { ok, stderr } = await installDependencies(targetDir);
    if (ok) {
      installed = true;
      installSpinner.succeed('Dependencies installed');
    } else {
      installSpinner.fail('npm install failed — you can retry manually');
      logger.warn(stderr?.split('\n')[0] ?? 'unknown error');
    }
  }

  printNextSteps(projectName, installed);
}

function printNextSteps(projectName, installed) {
  logger.blank();
  logger.success(`Done! Created ${chalk.bold(projectName)}.`);
  logger.blank();
  console.log(chalk.bold('Next steps:'));
  console.log(`  ${chalk.cyan('cd')} ${projectName}`);
  if (!installed) console.log(`  ${chalk.cyan('npm install')}`);
  console.log(`  ${chalk.cyan('npm run dev')}`);
  logger.blank();
  console.log(`Then open ${chalk.underline('http://localhost:3000')} in your browser.`);
  logger.blank();
}
