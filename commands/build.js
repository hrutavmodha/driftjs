/**
 * commands/build.js — `drift build`: produces a production-ready dist/ folder.
 */

import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../lib/loadConfig.js';
import { buildProject } from '../lib/buildProject.js';

export function registerBuildCommand(program) {
  program
    .command('build')
    .description('Build the DriftJS app for production')
    .action(async () => {
      const config = await loadConfig();
      logger.title(`Building ${chalk.green(config.name)} for production`);

      const spinner = ora('Bundling project...').start();
      try {
        const outPath = await buildProject(config, (step) => {
          spinner.text = `Copying ${step}...`;
        });
        spinner.succeed('Build complete');
        logger.success(`Output written to ${chalk.cyan(outPath)}`);
        logger.info(`Run ${chalk.cyan('drift serve')} to preview the build.`);
      } catch (err) {
        spinner.fail('Build failed');
        logger.error(err.message);
        process.exitCode = 1;
      }
    });
}
