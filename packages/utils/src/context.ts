import type { Context } from '../types/index.js';

const VM_STACK_KEY = Symbol.for('__drift_vm_stack__');

function getVMStack(): any[] {
  const g = globalThis as any;
  if (!g[VM_STACK_KEY]) {
    g[VM_STACK_KEY] = [];
  }
  return g[VM_STACK_KEY];
}

/**
 * Sets or pushes the currently active VM instance executing component logic.
 */
export function pushActiveVM(vm: any): void {
  getVMStack().push(vm);
}

/**
 * Pops the active VM instance after component execution completes.
 */
export function popActiveVM(): void {
  getVMStack().pop();
}

/**
 * Returns the currently active VM instance.
 */
export function getActiveVM(): any | null {
  const stack = getVMStack();
  return stack.length > 0 ? stack[stack.length - 1] : null;
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

/**
 * Registers a callback to be executed when the currently active component VM is unmounted.
 */
export function onUnmount(callback: () => void): void {
  const vm = getActiveVM();
  if (vm) {
    if (!vm.unmountCallbacks) {
      vm.unmountCallbacks = [];
    }
    vm.unmountCallbacks.push(callback);
  }
}
