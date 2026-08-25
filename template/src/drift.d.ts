// Ambient module declaration — lets TypeScript understand *.drift and *.css imports.
// The actual module is synthesised at build/serve time by driftjs-vite-plugin.

declare module '*.drift' {
  const component: import('driftjs-compiler').CompiledModule;
  export default component;
}

declare module '*.css';

/**
 * Declares a reactive computed / derived value in DriftJS Single File Components.
 */
declare function derive<T>(exprOrFn: T | (() => T)): T;

/**
 * Children slot fragment passed to this component from the caller.
 */
declare const children: any;

/**
 * Explicit attributes passed to this component.
 */
declare const props: Record<string, any>;
