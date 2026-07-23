import type { Plugin } from 'vite';
import { parseTemplate, generate } from '@driftjs/compiler';
import type { DriftPluginOptions } from '../types/index.js';

/**
 * Vite plugin for compiling .drift single-file component templates into reactive VM bytecode AOT at build time.
 *
 * @param options - Plugin configuration options.
 * @returns Vite Plugin object.
 */
export function driftPlugin(options: DriftPluginOptions = {}): Plugin {
  return {
    name: 'vite-plugin-drift',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.endsWith('.drift')) {
        return null;
      }

      // 1. Parse template AST and compile bytecode program AOT at build time
      const ast = parseTemplate(code);
      const program = generate(ast);

      // 2. Serialize bytecode Uint32Array
      const bytecodeArray = Array.from(program.bytecode);

      // 3. Serialize constants (thunks emitted as top-level named functions)
      const thunkFunctions: string[] = [];
      const serializedConstants: string[] = [];

      program.constants.forEach((c) => {
        if (typeof c === 'function' || (typeof c === 'string' && (c.includes('regs') || c.startsWith('function')))) {
          const fnName = `_thunk${thunkFunctions.length}`;
          const str = (typeof c === 'function' ? c.toString() : String(c)).trim();
          let body = str;
          if (body.includes('=>')) {
            body = body.slice(body.indexOf('=>') + 2).trim();
            if (body.startsWith('{') && body.endsWith('}')) {
              body = body.slice(1, -1).trim();
            } else {
              body = `return ${body};`;
            }
          } else if (body.startsWith('function')) {
            const firstBrace = body.indexOf('{');
            const lastBrace = body.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              body = body.slice(firstBrace + 1, lastBrace).trim();
            }
          }
          thunkFunctions.push(
            `function ${fnName}(regs, vm, nodes, rootElement) {\n  ${body}\n}`
          );
          serializedConstants.push(fnName);
        } else {
          serializedConstants.push(JSON.stringify(c));
        }
      });

      const jsCode = `
import { interpret } from '@driftjs/runtime';

${thunkFunctions.join('\n\n')}

export const program = {
  bytecode: new Uint32Array([${bytecodeArray.join(', ')}]),
  constants: [${serializedConstants.join(', ')}],
  updateBlockOffset: ${program.updateBlockOffset ?? 0}
};

export const render = function render(target) {
  return interpret(program, target);
};

const component = {
  program,
  render
};

export default component;
`;

      return {
        code: jsCode,
        map: null
      };
    }
  };
}
