import { evaluateExpression, executePrecompiledFn } from './evaluator.js';
import { setScopeValue } from './scope.js';

/**
 * Interprets a block of Acorn AST statements (used by <script> AST and functions).
 */
export function executeBlockStatement(statements: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  let result: any;
  if (!statements) return result;

  if (typeof statements === 'function') {
    return statements(scope, declaredVars, setScopeValue);
  }

  if (typeof statements === 'object' && statements !== null && '__drift_fn__' in statements) {
    return executePrecompiledFn(statements, scope, declaredVars);
  }

  if (Array.isArray(statements)) {
    for (const stmt of statements) {
      result = evaluateExpression(stmt, scope, declaredVars);
    }
  } else if (statements && typeof statements === 'object') {
    result = evaluateExpression(statements, scope, declaredVars);
  }
  return result;
}
