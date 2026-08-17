import type { Context } from '../types/index.js';

let activeVM: any = null;
const vmStack: any[] = [];

/**
 * Sets or pushes the currently active VM instance executing component logic.
 */
export function pushActiveVM(vm: any): void {
  vmStack.push(activeVM);
  activeVM = vm;
}

/**
 * Pops the active VM instance after component execution completes.
 */
export function popActiveVM(): void {
  activeVM = vmStack.pop() ?? null;
}

/**
 * Returns the currently active VM instance.
 */
export function getActiveVM(): any | null {
  return activeVM;
}

/**
 * Explicitly sets the active VM instance (convenience for runners).
 */
export function setActiveVM(vm: any | null): void {
  activeVM = vm;
}

/**
 * Creates a unique, type-safe Context token.
 *
 * @param defaultValue - Optional default value returned when no ancestor provides this context.
 * @param name - Optional descriptive name for debugging.
 */
export function createContext<T>(defaultValue?: T, name?: string): Context<T> {
  const id = Symbol(name || 'DriftContext');

  const context: Context<T> = {
    id,
    name,
    defaultValue,
    provide(value: T | (() => T)): void {
      provideContext(context, value);
    },
    inject(fallback?: T): T {
      return injectContext(context, fallback);
    },
  };

  return context;
}

/**
 * Provides a context value on the currently active VM instance.
 */
export function provideContext<T>(context: Context<T>, value: T | (() => T)): void {
  const vm = getActiveVM();
  if (!vm || !vm.contextMap) {
    throw new Error(
      `provide() can only be called inside the <script> block of a DriftJS component during instantiation.`
    );
  }
  vm.contextMap.set(context.id, value);
}

/**
 * Injects a context value from the nearest ancestor VM in the component hierarchy.
 */
export function injectContext<T>(context: Context<T>, fallback?: T): T {
  const vm = getActiveVM();
  if (!vm) {
    return fallback !== undefined ? fallback : (context.defaultValue as T);
  }

  let curr: any = vm;
  while (curr) {
    if (curr.contextMap && curr.contextMap.has(context.id)) {
      const stored = curr.contextMap.get(context.id);
      return stored;
    }
    curr = curr.parentVM;
  }

  return fallback !== undefined ? fallback : (context.defaultValue as T);
}

// Functional aliases matching provide / inject syntax
export const provide = provideContext;
export const inject = injectContext;
