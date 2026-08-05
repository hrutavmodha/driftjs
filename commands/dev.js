/**
 * commands/dev.js — `drift dev`: starts the local dev server with live reload.
 */

import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../lib/loadConfig.js';
import { startDevServer } from '../lib/devServer.js';

export function registerDevCommand(program) {
  program
    .command('dev')
    .description('Start the DriftJS development server')
    .option('-p, --port <number>', 'port to run the dev server on', parseInt)
    .action(async (options) => {
      const config = await loadConfig();
      const port = options.port ?? config.port;

      logger.title(`Starting dev server for ${chalk.green(config.name)}`);

      startDevServer({
        rootDir: config.rootDir,
        srcDir: config.srcDir,
        publicDir: config.publicDir,
        port,
        onReady: (p) => {
          logger.success(`Dev server running at ${chalk.underline(`http://localhost:${p}`)}`);
          logger.info('Watching for file changes... (Ctrl+C to stop)');
        },
        onFileChange: (file) => logger.step(`Changed: ${file} — reloading browser`),
      });
    });
}
