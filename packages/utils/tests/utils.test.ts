import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  setScopeValue,
  inScopeChain,
  populateItemScope,
  resolveIterable,
  resolveComponentModule,
  evaluatePropsSpec,
  normalizeStyle,
  camelToKebab,
  MAX_REGISTERS,
  VOID_ELEMENTS,
  scanBalancedDelimiters,
  findTopLevelChar,
  splitPatternEntries,
  hasMatchingOuterParens,
} from '../src/index.js';

describe('driftjs-shared Module', () => {
  it('exports MAX_REGISTERS constant equal to 256', () => {
    expect(MAX_REGISTERS).toBe(256);
  });

  it('exports canonical VOID_ELEMENTS matching WHATWG HTML standard', () => {
    expect(VOID_ELEMENTS).toBeInstanceOf(Set);
    expect(VOID_ELEMENTS.has('input')).toBe(true);
    expect(VOID_ELEMENTS.has('img')).toBe(true);
    expect(VOID_ELEMENTS.has('br')).toBe(true);
    expect(VOID_ELEMENTS.has('div')).toBe(false);
    expect(VOID_ELEMENTS.size).toBe(14);
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

  describe('normalizeStyle helper', () => {
    it('handles null, undefined, false, and empty string', () => {
      expect(normalizeStyle(null)).toBe('');
      expect(normalizeStyle(undefined)).toBe('');
      expect(normalizeStyle(false)).toBe('');
      expect(normalizeStyle('')).toBe('');
    });

    it('preserves existing CSS string input', () => {
      expect(normalizeStyle('color: red; padding: 10px;')).toBe('color: red; padding: 10px;');
    });

    it('converts camelCase properties to kebab-case', () => {
      expect(camelToKebab('backgroundColor')).toBe('background-color');
      expect(camelToKebab('borderRadius')).toBe('border-radius');
      expect(camelToKebab('borderLeftWidth')).toBe('border-left-width');
      expect(camelToKebab('--customVar')).toBe('--customVar');
    });

    it('normalizes style objects with automatic pixel units', () => {
      const style = {
        backgroundColor: '#3b82f6',
        borderRadius: 12,
        padding: 20,
        color: '#ffffff',
      };
      expect(normalizeStyle(style)).toBe('background-color: #3b82f6; border-radius: 12px; padding: 20px; color: #ffffff');
    });

    it('respects unitless CSS properties', () => {
      const style = {
        opacity: 0.85,
        zIndex: 100,
        flex: 1,
        lineHeight: 1.5,
        fontWeight: 600,
      };
      expect(normalizeStyle(style)).toBe('opacity: 0.85; z-index: 100; flex: 1; line-height: 1.5; font-weight: 600');
    });

    it('ignores null, undefined, empty, and false values in style objects', () => {
      const style = {
        color: 'red',
        display: null,
        margin: undefined,
        border: false,
        padding: '',
      };
      expect(normalizeStyle(style)).toBe('color: red');
    });

    it('normalizes arrays of style objects', () => {
      const styles = [
        { color: 'red', padding: 8 },
        { backgroundColor: 'blue', borderRadius: 4 },
      ];
      expect(normalizeStyle(styles)).toBe('color: red; padding: 8px; background-color: blue; border-radius: 4px');
    });
  });

  describe('Balanced Scanner Utilities (BUG-028)', () => {
    it('findTopLevelChar correctly finds chars at depth 0 ignoring quotes, comments, regex, and brackets', () => {
      const expr = `(a, b = "x,y", c = [1, 2], d = { key: 'a,b' }) => a + b`;
      expect(findTopLevelChar(expr, '>')).toBe(48);
      expect(findTopLevelChar(`a, b /* comment with , */, c`, ',')).toBe(1);
    });

    it('splitPatternEntries splits top-level pattern commas accurately', () => {
      const pattern = `a, { b, c = 10, d: [e, f = 'hello, world'] }, ...rest`;
      const entries = splitPatternEntries(pattern);
      expect(entries).toEqual([
        'a',
        "{ b, c = 10, d: [e, f = 'hello, world'] }",
        '...rest',
      ]);
    });

    it('hasMatchingOuterParens determines if string is enclosed in matching parens', () => {
      expect(hasMatchingOuterParens('(item, index)')).toBe(true);
      expect(hasMatchingOuterParens('(item, index) in list')).toBe(false);
      expect(hasMatchingOuterParens('(a) + (b)')).toBe(false);
      expect(hasMatchingOuterParens('item')).toBe(false);
    });
  });

  describe('populateItemScope (BUG-004)', () => {
    it('resolves literals and scope variables in destructuring default values', () => {
      const scope: Record<string, any> = {
        defaultRole: 'member',
        defaultCount: 10,
      };

      populateItemScope(
        scope,
        '{ id, name = "Anonymous", role = defaultRole, count = defaultCount }',
        { id: 101 },
        null,
        0
      );

      expect(scope.id).toBe(101);
      expect(scope.name).toBe('Anonymous');
      expect(scope.role).toBe('member');
      expect(scope.count).toBe(10);
    });

    it('strictly prevents prototype pollution via __proto__, constructor, and prototype', () => {
      const scope: Record<string, any> = {};

      populateItemScope(scope, '__proto__', { polluted: true }, null, 0);
      populateItemScope(scope, '{ __proto__: p1, constructor: c1, prototype: pr1 }', { __proto__: { evil: true } }, null, 0);
      setScopeValue(scope, '__proto__', { polluted: true });
      setScopeValue(scope, 'constructor', { polluted: true });
      setScopeValue(scope, 'prototype', { polluted: true });
      setScopeValue(scope, '__drift_mark_dirty__', () => {});

      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).evil).toBeUndefined();
      expect(scope.__proto__).toBe(Object.prototype);
    });
  });
});
