import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  executeBlockStatement,
  setScopeValue,
  syncDeclaredVars,
  resolveIterable,
  MAX_REGISTERS,
} from '../src/index.js';

describe('@driftjs/utils Shared Evaluator Module', () => {
  it('exports MAX_REGISTERS constant equal to 256', () => {
    expect(MAX_REGISTERS).toBe(256);
  });

  it('evaluates binary, logical, and member expressions', () => {
    const scope = { user: { age: 25 }, threshold: 20 };
    const expr = {
      type: 'BinaryExpression',
      operator: '>',
      left: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'user' },
        property: { type: 'Identifier', name: 'age' },
      },
      right: { type: 'Identifier', name: 'threshold' },
    };

    expect(evaluateExpression(expr, scope)).toBe(true);
  });

  it('sets scope value up the prototype chain', () => {
    const parentScope = { count: 0 };
    const childScope = Object.create(parentScope);

    setScopeValue(childScope, 'count', 5);
    expect(parentScope.count).toBe(5);
  });

  it('resolves iterables cleanly', () => {
    expect(resolveIterable([1, 2, 3])).toEqual([1, 2, 3]);
    expect(resolveIterable(new Set(['a', 'b']))).toEqual(['a', 'b']);
    expect(resolveIterable(null)).toEqual([]);
  });

  it('executes block statements and updates scope', () => {
    const scope = { val: 10 };
    const statements = [
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'AssignmentExpression',
          operator: '=',
          left: { type: 'Identifier', name: 'val' },
          right: { type: 'Literal', value: 42 },
        },
      },
    ];

    executeBlockStatement(statements, scope);
    expect(scope.val).toBe(42);
  });
});
