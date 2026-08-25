import type { CompiledModule } from 'driftjs-compiler';

declare module '*.drift' {
  const component: CompiledModule;
  export default component;
}

/**
 * Declares a reactive computed / derived value in DriftJS Single File Components.
 */
declare function derive<T>(exprOrFn: T | (() => T)): T;
