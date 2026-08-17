import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  setScopeValue,
  inScopeChain,
  resolveIterable,
  resolveComponentModule,
  evaluatePropsSpec,
  MAX_REGISTERS,
} from '../src/index.js';

describe('driftjs-shared Module', () => {
  it('exports MAX_REGISTERS constant equal to 256', () => {
    expect(MAX_REGISTERS).toBe(256);
  });

  it('evaluates precompiled functions and closures', () => {
    const scope = { user: { age: 25 }, threshold: 20 };
    const expr = { __drift_fn__: '(scope) => scope.user.age > scope.threshold' };

    expect(evaluateExpression(expr, scope)).toBe(true);

    const fnExpr = (s: any) => s.user.age === 25;
    expect(evaluateExpression(fnExpr, scope)).toBe(true);
  });

  it('sets scope value up the prototype chain and triggers dirty mark', () => {
    let dirtyMarked = '';
    const parentScope: any = { count: 0 };
    Object.defineProperty(parentScope, '__drift_mark_dirty__', {
      value: (name: string) => { dirtyMarked = name; },
    });
    const childScope = Object.create(parentScope);

    setScopeValue(childScope, 'count', 5);
    expect(parentScope.count).toBe(5);
    expect(dirtyMarked).toBe('count');
  });

  it('resolves iterables cleanly (arrays, Sets, null)', () => {
    expect(resolveIterable([1, 2, 3])).toEqual([1, 2, 3]);
    expect(resolveIterable(new Set(['a', 'b']))).toEqual(['a', 'b']);
    expect(resolveIterable(null)).toEqual([]);
  });

  it('executes precompiled script thunks and updates scope', () => {
    const scope = { val: 10 };
    const statements = { __drift_fn__: '(scope) => { scope.val = 42; }' };

    evaluateExpression(statements, scope);
    expect(scope.val).toBe(42);
  });

  it('safely checks properties in scope chain without prototype pollution', () => {
    const scope = { name: 'Alice' };
    expect(inScopeChain(scope, 'name')).toBe(true);
    expect(inScopeChain(scope, 'toString')).toBe(false);
    expect(inScopeChain(scope, 'valueOf')).toBe(false);
    expect(inScopeChain(scope, 'constructor')).toBe(false);

    const customScope = { toString: 'Custom String' };
    expect(inScopeChain(customScope, 'toString')).toBe(true);
  });

  it('unwraps component module exports properly', () => {
    const rawMod = { bytecode: [0], constants: [] };
    expect(resolveComponentModule(rawMod)).toBe(rawMod);
    expect(resolveComponentModule({ default: rawMod })).toBe(rawMod);
    expect(resolveComponentModule({ compiledModule: rawMod })).toBe(rawMod);
    expect(resolveComponentModule({ program: rawMod })).toBe(rawMod);
  });

  it('evaluates props specification objects against scope', () => {
    const scope = { activeId: 101, title: 'Test' };
    const spec = {
      __drift_props__: true,
      id: { __drift_fn__: '(scope) => scope.activeId' },
      staticProp: 'Hello',
    };

    const props = evaluatePropsSpec(spec, scope);
    expect(props).toEqual({
      id: 101,
      staticProp: 'Hello',
    });
  });
});
