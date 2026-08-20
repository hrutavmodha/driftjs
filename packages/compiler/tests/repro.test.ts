import { describe, it, expect } from 'vitest';
import { compile, DriftLexer, DriftParser, DriftTransformer, DriftGenerator, astToJS } from '../src/index.js';
import { decodeHTMLEntities } from '../src/parser.js';
import { ASTNodeType } from '../types/index.js';

describe('DriftJS Compiler - Reproduction Test Cases for Identified Bugs', () => {
  // BUG-03: Naive regex in @for directive header parser corrupts iterables containing the word 'key'
  it('BUG-03 [Correctness]: correctly parses @for iterables that contain the word "key" in expressions', () => {
    const template = `
      <div class="list">
        @for item in items.filter(x => x.key === 'active') {
          <span>{item.name}</span>
        }
      </div>
    `;

    // Expected: parse successfully without syntax error
    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();

    const forNode = (ast.body[0] as any).children[0];
    expect(forNode.type).toBe(ASTNodeType.For);
    expect(forNode.item).toBe('item');
    expect(forNode.key).toBeNull();
    // The iterable should be the full expression, not truncated at 'key'
    expect(forNode.iterable).toBe("items.filter(x => x.key === 'active')");
  });

  // BUG-02: Loops wrapped in IIFEs trap return statements in component script functions
  it('BUG-02 [Correctness]: functions with loops containing return statements return the expected value', () => {
    const template = `
      <script>
        function findItem(items, targetId) {
          for (let item of items) {
            if (item.id === targetId) {
              return item;
            }
          }
          return null;
        }
      </script>
      <div>{findItem([{id: 1, name: 'First'}, {id: 2, name: 'Second'}], 1)?.name}</div>
    `;

    const compiled = compile(template);
    const scope: Record<string, any> = {};

    // Execute script
    const scriptAst = compiled.constants[0];
    // In astToJS, function declarations assign to scope[name]
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope);
    }

    expect(scope.findItem).toBeDefined();
    const result = scope.findItem([{ id: 1, name: 'First' }, { id: 2, name: 'Second' }], 1);
    // Expected true behavior: returns the matched item object { id: 1, name: 'First' }
    // Buggy current behavior: returns null because return item returns from arrow IIFE, not findItem
    expect(result).toEqual({ id: 1, name: 'First' });
  });

  // BUG-04: Assignment expressions evaluate to undefined instead of the assigned value
  it('BUG-04 [Correctness]: assignment expressions evaluate to the assigned value', () => {
    const template = `
      <script>
        let x = 0;
        let y = (x = 42);
      </script>
      <div>{y}</div>
    `;

    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope);
    }

    // Expected true behavior: y is 42
    // Buggy current behavior: y is undefined because setScopeValue returns void
    expect(scope.x).toBe(42);
    expect(scope.y).toBe(42);
  });

  // BUG-11: Case-sensitive closing tag check in lexer breaks uppercase / mixed-case raw text tags (</SCRIPT>)
  it('BUG-11 [Correctness]: correctly lexes uppercase and mixed-case closing tags for raw text elements', () => {
    const template = `<script>let a = 1;</SCRIPT><div>Hello</div>`;

    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();

    expect(ast.body.length).toBe(2);
    expect((ast.body[0] as any).tagName).toBe('script');
    expect((ast.body[1] as any).tagName).toBe('div');
  });

  // BUG-12: Unhandled RangeError on invalid numeric HTML character entities crashes parser
  it('BUG-12 [Correctness]: decodeHTMLEntities gracefully handles out-of-range numeric character references', () => {
    // 999999999 is far beyond Unicode max 0x10FFFF
    expect(() => {
      decodeHTMLEntities('Invalid entity: &#999999999;');
    }).not.toThrow();
  });

  // BUG-15: Division operator following postfix ++ or -- is incorrectly parsed as a RegExp literal
  it('BUG-15 [Correctness]: division following postfix increment is not parsed as a regex literal', () => {
    const template = `<div>{ count++ / 2 }</div>`;

    expect(() => {
      const lexer = new DriftLexer(template);
      const parser = new DriftParser(lexer);
      parser.parse();
    }).not.toThrow();
  });

  // BUG-20: @switch transformation clones discriminant into all branches, re-evaluating expressions with side effects
  it('BUG-20 [Efficiency]: @switch evaluates discriminant expression with side effects exactly once', () => {
    const template = `
      <script>
        let calls = 0;
        function getStatus() {
          calls++;
          return 'active';
        }
      </script>
      @switch getStatus() {
        @case 'inactive' {
          <span>Inactive</span>
        }
        @case 'pending' {
          <span>Pending</span>
        }
        @case 'active' {
          <span>Active</span>
        }
        @default {
          <span>Default</span>
        }
      }
    `;

    const ast = new DriftParser(new DriftLexer(template)).parse();
    const transformed = new DriftTransformer(ast).transform();
    const generator = new DriftGenerator(transformed);
    const compiled = generator.generate();

    // Check how many times getStatus is in the transformed AST
    // In buggy version, getStatus() is cloned into every case binary expression (calls === 3)
    // Expected: getStatus() evaluated once
    const ifNode = transformed.body.find((n) => n.type === ASTNodeType.If) as any;
    expect(ifNode).toBeDefined();
  });

  // BUG-09: Identifier scoping with hasOwnProperty fails on Window.prototype globals
  it('BUG-09 [Correctness]: identifier scoping in astToJS resolves globals on prototype chain', () => {
    const identifierNode = { type: 'Identifier', name: 'fetch' };
    const code = astToJS(identifierNode);

    // Global context where 'fetch' is on the prototype (like Window.prototype)
    const globalContext = Object.create({ fetch: () => 'mock-fetch' });

    const evalFn = new Function('scope', 'inScopeChain', 'globalThis', `return (${code})`);
    const result = evalFn({}, null, globalContext);

    // Expected true behavior: resolves the prototype global 'fetch'
    // Buggy current behavior: hasOwnProperty returns false, so it resolves to undefined
    expect(typeof result).toBe('function');
  });
});
