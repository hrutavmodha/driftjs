import { setScopeValue, inScopeChain } from './scope.js';
import { astToJS } from 'driftjs-compiler';

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
 * Executes a pre-compiled function string stored on AST constant nodes.
 */
export function executePrecompiledFn(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (typeof node.__drift_fn__ === 'function') {
    return node.__drift_fn__(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable);
  }
  if (!node._executableFn) {
    node._executableFn = typeof node.__drift_fn__ === 'string'
      ? new Function('return (' + node.__drift_fn__ + ')')()
      : node.__drift_fn__;
  }
  return node._executableFn(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable);
}

/**
 * Evaluates any JS expression (AST node, pre-compiled wrapper, function, or primitive).
 */
export function evaluateExpression(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (node === null || node === undefined) return node;

  if (typeof node === 'function') {
    return node(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable);
  }

  if (typeof node === 'object' && node !== null && '__drift_fn__' in node) {
    return executePrecompiledFn(node, scope, declaredVars);
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const codeStr = astToJS(node);
  if (!codeStr || codeStr.trim().length === 0) {
    return undefined;
  }

  let executableFn: any;
  try {
    executableFn = new Function('scope', 'declaredVars', 'setScopeValue', 'inScopeChain', 'resolveIterable', 'return (' + codeStr + ')');
  } catch {
    executableFn = new Function('scope', 'declaredVars', 'setScopeValue', 'inScopeChain', 'resolveIterable', codeStr);
  }

  return executableFn(scope, declaredVars, setScopeValue, inScopeChain, resolveIterable);
}

/**
 * Resolves constant or variable values against scope.
 */
export function resolveValue(val: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return inScopeChain(scope, val) ? scope[val] : val;
  if (typeof val === 'object' && (val.type || '__drift_fn__' in val || typeof val._executableFn === 'function')) {
    return evaluateExpression(val, scope, declaredVars);
  }
  return val;
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
export function evaluatePropsSpec(propsSpec: Record<string, any> | null | undefined, scope: Record<string, any>, declaredVars?: Set<string>): Record<string, any> {
  if (!propsSpec || typeof propsSpec !== 'object') return {};
  const res: Record<string, any> = {};
  for (const key of Object.keys(propsSpec)) {
    if (key === '__drift_props__') continue;
    const rawVal = propsSpec[key];
    res[key] = evaluateExpression(rawVal, scope, declaredVars);
  }
  return res;
}
