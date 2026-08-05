/**
 * utils/logger.js
 * ---------------------------------------------------------------------------
 * Centralised, chalk-colored console output so every command prints in a
 * consistent voice. Keeping this in one place means changing the CLI's
 * "brand" colors later only requires editing this file.
 * ---------------------------------------------------------------------------
 */

import chalk from 'chalk';

const prefix = chalk.bgHex('#38bdf8').black.bold(' DRIFT ');

export const logger = {
  title: (msg) => console.log(`\n${prefix} ${chalk.bold(msg)}\n`),
  info: (msg) => console.log(`${chalk.cyan('info')}  ${msg}`),
  success: (msg) => console.log(`${chalk.green('✔')} ${msg}`),
  warn: (msg) => console.log(`${chalk.yellow('⚠')}  ${msg}`),
  error: (msg) => console.error(`${chalk.red('✖')} ${msg}`),
  step: (msg) => console.log(`${chalk.magenta('→')} ${msg}`),
  blank: () => console.log(''),
};
