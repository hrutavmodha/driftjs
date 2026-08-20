import { describe, it, expect } from 'vitest';
import { setScopeValue, evaluateExpression, executePrecompiledFn } from '../src/index.js';

describe('DriftJS Shared / Utils - Reproduction Test Cases for Identified Bugs', () => {
  // BUG-04: setScopeValue returns void instead of the assigned value
  it('BUG-04 [Correctness]: setScopeValue returns the assigned value for expression assignment evaluation', () => {
    const scope = { count: 10 };

    const result = setScopeValue(scope, 'count', 25);

    // Expected true behavior: setScopeValue returns 25 (the assigned value)
    // Buggy current behavior: setScopeValue returns undefined (void)
    expect(result).toBe(25);
    expect(scope.count).toBe(25);
  });

  // BUG-17: CSP compliance in executePrecompiledFn
  it('BUG-17 [Security / CSP]: executePrecompiledFn executes pre-compiled function closures without invoking new Function()', () => {
    const fnClosure = (scope: any) => scope.value * 2;
    const node = { __drift_fn__: fnClosure };

    const result = executePrecompiledFn(node, { value: 21 });
    expect(result).toBe(42);
  });
});
