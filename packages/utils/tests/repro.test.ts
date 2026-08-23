import { describe, it, expect } from 'vitest';
import { setScopeValue, getScopeValue, populateItemScope } from '../src/index.js';

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

  it('getScopeValue returns undefined for Object.prototype properties when not defined on scope or own globalThis', () => {
    const scope = {};
    const constructorVal = getScopeValue(scope, 'constructor');
    const toStringVal = getScopeValue(scope, 'toString');
    const valueOfVal = getScopeValue(scope, 'valueOf');

    expect(constructorVal).toBeUndefined();
    expect(toStringVal).toBeUndefined();
    expect(valueOfVal).toBeUndefined();
  });

  it('getScopeValue resolves prototype-inherited browser globals on globalThis', () => {
    const scope = {};
    const mockProto = { customBrowserGlobal: () => 'from-window-prototype' };
    const currentGlobalProto = Object.getPrototypeOf(globalThis);
    try {
      Object.setPrototypeOf(globalThis, mockProto);
      const val = getScopeValue(scope, 'customBrowserGlobal');
      expect(typeof val).toBe('function');
      expect(val()).toBe('from-window-prototype');
    } finally {
      Object.setPrototypeOf(globalThis, currentGlobalProto);
    }
  });

  it('populateItemScope extracts destructuring aliases and defaults correctly', () => {
    const scope: Record<string, any> = {};
    const item = { id: 101, title: 'Item 1' };
    populateItemScope(scope, '{ id: userId, title, role = "guest" }', item, null, 0);

    expect(scope.userId).toBe(101);
    expect(scope.title).toBe('Item 1');
    expect(scope.role).toBe('guest');
  });

  it('evaluatePropsSpec ignores dangerous prototype pollution keys (BUG-011)', async () => {
    const { evaluatePropsSpec } = await import('../src/index.js');
    const propsSpec = {
      __proto__: { polluted: true },
      constructor: { hacked: true },
      prototype: { evil: true },
      title: 'Valid Title',
    };

    const res = evaluatePropsSpec(propsSpec as any, {});
    expect(res.title).toBe('Valid Title');
    expect(res.polluted).toBeUndefined();
    expect((Object.prototype as any).polluted).toBeUndefined();
  });
});

