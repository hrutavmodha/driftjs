import type { Plugin } from 'vite';

/**
 * Options for the DriftJS Vite plugin.
 */
export interface DriftPluginOptions {
  /**
   * Extension for single file components. Defaults to '.drift'.
   */
  extension?: string;
}

/**
 * Vite plugin for compiling .drift single-file component templates into reactive VM bytecode.
 *
 * @param options - Plugin configuration options.
 * @returns Vite Plugin object.
 */
export function driftPlugin(options: DriftPluginOptions = {}): Plugin {
  const extension = options.extension ?? '.drift';

  return {
    name: 'vite-plugin-drift',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.endsWith(extension)) {
        return null;
      }

      const jsCode = `
import { mountApp, parseTemplate, compile } from '@register-vm-reactivity-engine/core';

const source = ${JSON.stringify(code)};

export const ast = parseTemplate(source);
export const program = compile(ast);

export default function mount(target) {
  return mountApp(program, target);
}
`;

      return {
        code: jsCode,
        map: null
      };
    }
  };
}
