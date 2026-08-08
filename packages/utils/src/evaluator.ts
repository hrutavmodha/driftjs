import { setScopeValue } from './scope.js';
import { astToJS } from '@driftjs/compiler';

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
  if (!node._executableFn) {
    node._executableFn = new Function('return (' + node.__drift_fn__ + ')')();
  }
  return node._executableFn(scope, declaredVars, setScopeValue);
}

/**
 * Evaluates any JS expression (AST node, pre-compiled wrapper, function, or primitive).
 */
export function evaluateExpression(node: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (node === null || node === undefined) return node;

  if (typeof node === 'function') {
    return node(scope, declaredVars, setScopeValue);
  }

  if (typeof node === 'object' && node !== null && '__drift_fn__' in node) {
    return executePrecompiledFn(node, scope, declaredVars);
  }

  if (typeof node === 'object' && node !== null && '__drift_fn__' in node) {
    return executePrecompiledFn(node, scope, declaredVars);
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const codeStr = astToJS(node);
  let executableFn: any;
  try {
    executableFn = new Function('scope', 'declaredVars', 'setScopeValue', 'return (' + codeStr + ')');
  } catch {
    executableFn = new Function('scope', 'declaredVars', 'setScopeValue', codeStr);
  }

  return executableFn(scope, declaredVars, setScopeValue);
}

/**
 * Resolves constant or variable values against scope.
 */
export function resolveValue(val: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return val in scope ? scope[val] : val;
  if (typeof val === 'object' && (val.type || '__drift_fn__' in val || typeof val._executableFn === 'function')) {
    return evaluateExpression(val, scope, declaredVars);
  }
  return val;
}
