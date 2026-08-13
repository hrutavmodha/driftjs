/**
 * Options accepted by the `driftPlugin()` factory.
 */

export interface DriftPluginOptions {
  /**
   * Emit verbose compiler debug output (transformed AST + bytecode) to the
   * Vite dev-server console for every transformed .drift file.
   * @default false
   */
  debug?: boolean;
}

/**
 * Shape of the ESM module emitted by the plugin for every `.drift` file.
 * Consumers can import these types when working with `.drift` imports in TS.
 *
 * @example
 * import type { DriftModule } from 'driftjs-vite-plugin';
 * import * as tpl from './hero.drift';
 * const m: DriftModule = tpl;
 */
export type DriftModule = import('driftjs-compiler').CompiledModule;

/** File extension this plugin owns. */
export const DRIFT_EXT = '.drift' as const;
