import type { CompiledModule } from 'driftjs-compiler';

declare module '*.drift' {
  const component: CompiledModule;
  export default component;
}

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
