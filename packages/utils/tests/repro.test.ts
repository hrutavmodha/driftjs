import { describe, it, expect, vi } from 'vitest';
import { setScopeValue, evaluateExpression, executePrecompiledFn, onUnmount } from '../src/index.js';

describe('DriftJS Shared / Utils - Reproduction Test Cases', () => {
  it('setScopeValue returns the assigned value for expression assignment evaluation', () => {
    const scope = { count: 10 };

    const result = setScopeValue(scope, 'count', 25);

    expect(result).toBe(25);
    expect(scope.count).toBe(25);
  });

  it('executePrecompiledFn executes pre-compiled function closures without invoking new Function()', () => {
    const fnClosure = (scope: any) => scope.value * 2;
    const node = { __drift_fn__: fnClosure };

    const result = executePrecompiledFn(node, { value: 21 });
    expect(result).toBe(42);
  });

  it('setScopeValue rejects dangerous prototype keys like "__proto__", "constructor", "prototype"', () => {
    const scope = {};
    const maliciousPayload = { polluted: true };

    setScopeValue(scope, '__proto__', maliciousPayload);

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });
});
