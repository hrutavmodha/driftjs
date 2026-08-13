import type { Plugin } from 'vite';
import {
  compile,
  type CompiledModule,
} from 'driftjs-compiler';
import { DRIFT_EXT, type DriftPluginOptions } from '../types/index.js';

export type { DriftPluginOptions, DriftModule } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// ESM code generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serializes constant values to JavaScript code literals.
 */
function serializeValueToJS(val: unknown): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val === 'function') return val.toString();
  if (typeof val === 'object') {
    if ('__drift_fn__' in (val as any)) {
      const fnStr = (val as any).__drift_fn__;
      return `{ __drift_fn__: ${typeof fnStr === 'function' ? fnStr.toString() : fnStr} }`;
    }
    if (Array.isArray(val)) {
      return `[${val.map(serializeValueToJS).join(', ')}]`;
    }
    const entries = Object.entries(val as Record<string, any>)
      .filter(([k]) => k !== 'start' && k !== 'end' && k !== 'loc')
      .map(([k, v]) => `${JSON.stringify(k)}: ${serializeValueToJS(v)}`);
    return `{ ${entries.join(', ')} }`;
  }
  return JSON.stringify(val);
}

function serializeConstants(constants: readonly unknown[]): string {
  return `[\n    ${constants.map(serializeValueToJS).join(',\n    ')}\n  ]`;
}

function generateESM(mod: CompiledModule, filePath: string): string {
  const bytecodeJSON = JSON.stringify(Array.from(mod.bytecode));
  const constantsJSON = serializeConstants(mod.constants);
  const bindingsJSON = JSON.stringify(mod.reactiveBindings ?? []);
  const declaredVarsJSON = JSON.stringify(mod.declaredVars ?? []);

  const importStatements: string[] = [];
  const scopeEntries: string[] = [];

  if (mod.imports && mod.imports.length > 0) {
    for (const imp of mod.imports) {
      if (imp.isDefault) {
        importStatements.push(`import ${imp.localName} from ${JSON.stringify(imp.source)};`);
      } else if (imp.importedName) {
        importStatements.push(`import { ${imp.importedName} as ${imp.localName} } from ${JSON.stringify(imp.source)};`);
      }
      scopeEntries.push(imp.localName);
    }
  }

  const importsHeader = importStatements.length > 0 ? importStatements.join('\n') + '\n\n' : '';
  const scopeObj = scopeEntries.length > 0 ? `{\n    ${scopeEntries.join(',\n    ')}\n  }` : '{}';

  return `\
// [DriftJS] Auto-generated from: ${filePath}
// Do not edit — regenerated on every save / build.
${importsHeader}/** @type {import('driftjs-compiler').CompiledModule} */
const compiledModule = {
  bytecode: new Uint32Array(${bytecodeJSON}),
  constants: ${constantsJSON},
  reactiveBindings: ${bindingsJSON},
  declaredVars: ${declaredVarsJSON},
  scope: ${scopeObj},
};

export default compiledModule;
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vite plugin that transforms `.drift` template files into ESM modules.
 *
 * Each `.drift` file is compiled at build / serve time through the DriftJS
 * pipeline and emitted as an ESM module exposing `render()`, `mount()`, and
 * the raw `compiledModule`.
 *
 * @example
 * // vite.config.ts
 * import { driftPlugin } from '@driftjs/vite-plugin';
 * export default defineConfig({ plugins: [driftPlugin()] });
 *
 * @example
 * // app.ts
 * import { mount } from './hero.drift';
 * mount(document.getElementById('app')!, { title: 'Hello' });
 */
export function driftPlugin(options: DriftPluginOptions = {}): Plugin {
  const { debug = false } = options;

  return {
    name: 'vite-plugin-drift',

    // Run before Vite's own asset / JSON transforms.
    enforce: 'pre',

    /**
     * Transform hook: invoked for every file Vite processes.
     * Compiles `.drift` source and returns synthetic ESM.
     */
    transform(src, id) {
      const cleanId = id.split('?')[0] ?? id;
      if (!cleanId.endsWith(DRIFT_EXT)) return null;

      let mod: CompiledModule;
      try {
        mod = compile(src, debug);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error(`[DriftJS] Compilation failed in "${id}":\n${msg}`);
      }

      return {
        code: generateESM(mod!, id),
        // No meaningful source-map for generated code.
        map: null,
      };
    },

    /**
     * HMR hook: invalidates and triggers a full-reload whenever a `.drift`
     * source file is saved during `vite dev`.
     */
    handleHotUpdate({ file, server }) {
      const cleanFile = file.split('?')[0] ?? file;
      if (!cleanFile.endsWith(DRIFT_EXT)) return;

      const mod = server.moduleGraph.getModuleById(file) || server.moduleGraph.getModuleById(cleanFile);
      if (mod) server.moduleGraph.invalidateModule(mod);

      server.ws.send({ type: 'full-reload', path: '*' });
    },
  };
}

export default driftPlugin;
