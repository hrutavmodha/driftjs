import { describe, it, expect } from 'vitest';
import { setScopeValue } from '../src/index.js';

describe('DriftJS Shared / Utils - Reproduction Test Cases', () => {
  it('setScopeValue returns the assigned value for expression assignment evaluation', () => {
    const scope = { count: 10 };

    const result = setScopeValue(scope, 'count', 25);

    expect(result).toBe(25);
    expect(scope.count).toBe(25);
  });

  it('setScopeValue rejects dangerous prototype keys like "__proto__", "constructor", "prototype"', () => {
    const scope = {};
    const maliciousPayload = { polluted: true };

    setScopeValue(scope, '__proto__', maliciousPayload);

    expect((Object.prototype as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });
});
