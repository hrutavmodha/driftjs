/**
 * commands/serve.js — `drift serve`: serves the built dist/ folder statically.
 */

import path from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../lib/loadConfig.js';
import { pathExists } from '../utils/fsHelpers.js';
import { startDevServer } from '../lib/devServer.js';

export function registerServeCommand(program) {
  program
    .command('serve')
    .description('Serve the production build locally')
    .option('-p, --port <number>', 'port to serve on', parseInt)
    .action(async (options) => {
      const config = await loadConfig();
      const outPath = path.join(config.rootDir, config.outDir);

      if (!(await pathExists(outPath))) {
        logger.error(`No build found at ${chalk.cyan(config.outDir)}. Run ${chalk.cyan('drift build')} first.`);
        process.exitCode = 1;
        return;
      }

      const port = options.port ?? config.port;
      logger.title(`Serving production build of ${chalk.green(config.name)}`);

      // Reuse the dev server's static file serving; watching is harmless here
      // since dist/ only changes when the user re-runs `drift build`.
      startDevServer({
        rootDir: outPath,
        srcDir: outPath,
        publicDir: outPath,
        port,
        onReady: (p) => logger.success(`Preview running at ${chalk.underline(`http://localhost:${p}`)}`),
      });
    });
}
