import { evaluateExpression } from './evaluator.js';

/**
 * Interprets a block of Acorn AST statements (used by <script> AST and functions).
 */
export function executeBlockStatement(statements: any, scope: Record<string, any>, declaredVars?: Set<string>): any {
  let result: any;
  if (Array.isArray(statements)) {
    for (const stmt of statements) {
      result = evaluateExpression(stmt, scope, declaredVars);
    }
  } else if (statements && typeof statements === 'object') {
    result = evaluateExpression(statements, scope, declaredVars);
  }
  return result;
}
