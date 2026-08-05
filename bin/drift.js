#!/usr/bin/env node

/**
 * bin/drift.js
 * ---------------------------------------------------------------------------
 * Entry point installed as the `drift` executable (see package.json "bin").
 * Responsible ONLY for wiring: registers commands on a Commander program and
 * parses argv. All real logic lives in commands/*.js and lib/*.js so this
 * file stays tiny and easy to read.
 * ---------------------------------------------------------------------------
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { registerCreateCommand } from '../commands/create.js';
import { registerDevCommand } from '../commands/dev.js';
import { registerBuildCommand } from '../commands/build.js';
import { registerServeCommand } from '../commands/serve.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('drift')
  .description(chalk.cyanBright('DriftJS CLI') + ' — scaffold, develop, build and serve DriftJS apps')
  .version(pkg.version, '-v, --version', 'output the current CLI version');

registerCreateCommand(program);
registerDevCommand(program);
registerBuildCommand(program);
registerServeCommand(program);

// Friendly fallback for unknown commands instead of a raw stack trace.
program.on('command:*', (operands) => {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log(`See ${chalk.cyan('drift --help')} for a list of available commands.`);
  process.exitCode = 1;
});

program.parse(process.argv);

// Show help when the CLI is invoked with no arguments at all.
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
