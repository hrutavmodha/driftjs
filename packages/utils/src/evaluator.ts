import { setScopeValue, inScopeChain, getScopeValue } from './scope.js';

/**
 * Safely resolves an iterable object or array.
 */
export function resolveIterable(rawIter: any): any[] {
  if (Array.isArray(rawIter)) return rawIter;
  if (rawIter && typeof rawIter[Symbol.iterator] === 'function') {
    return Array.from(rawIter);
  }
  return [];
}

/**
 * Executes a pre-compiled function stored on constant pool entries.
 */
export function executePrecompiledFn(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (typeof node === 'function') {
    return node(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, getScopeValue);
  }
  if (typeof node.__drift_fn__ === 'function') {
    return node.__drift_fn__(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, getScopeValue);
  }
  if (!node._executableFn) {
    node._executableFn = typeof node.__drift_fn__ === 'string'
      ? new Function('return (' + node.__drift_fn__ + ')')()
      : node.__drift_fn__;
  }
  return node._executableFn(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, getScopeValue);
}

/**
 * Evaluates any pre-compiled JS expression, function, or primitive value against the scope.
 */
export function evaluateExpression(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (node === null || node === undefined) return node;

  if (typeof node === 'function') {
    return node(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable, getScopeValue);
  }

  if (typeof node === 'object' && node !== null) {
    if ('__drift_fn__' in node || typeof node._executableFn === 'function') {
      return executePrecompiledFn(node, scope, declaredVars);
    }
    if (Array.isArray(node)) {
      let lastRes: any;
      for (const item of node) {
        lastRes = evaluateExpression(item, scope, declaredVars);
      }
      return lastRes;
    }
  }

  return node;
}



/**
 * Safely unwraps an imported component module (handling ESM default exports,
 * CompiledModule wrappers, and program objects).
 */
export function resolveComponentModule(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.bytecode) || ArrayBuffer.isView(raw.bytecode)) return raw;
  if (raw.program && (Array.isArray(raw.program.bytecode) || ArrayBuffer.isView(raw.program.bytecode))) return raw.program;
  if (raw.default) return resolveComponentModule(raw.default);
  if (raw.compiledModule) return resolveComponentModule(raw.compiledModule);
  return null;
}

/**
 * Evaluates a props specification object (mapping prop keys to static values or expression ASTs)
 * against a VM scope, returning a plain JavaScript props object.
 */
export function evaluatePropsSpec(
  propsSpec: Record<string, any> | null | undefined,
  scope: Record<string, any>,
  declaredVars?: Set<string>
): Record<string, any> {
  if (!propsSpec || typeof propsSpec !== 'object') return {};
  const res: Record<string, any> = {};
  for (const key of Object.keys(propsSpec)) {
    if (key === '__drift_props__') continue;
    const rawVal = propsSpec[key];
    res[key] = evaluateExpression(rawVal, scope, declaredVars);
  }
  return res;
}
