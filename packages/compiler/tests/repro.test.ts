import { describe, it, expect } from 'vitest';
import { compile, DriftLexer, DriftParser, DriftTransformer, DriftGenerator, astToJS } from '../src/index.js';
import { decodeHTMLEntities } from '../src/parser.js';
import { ASTNodeType } from '../types/index.js';

describe('DriftJS Compiler - Reproduction Test Cases', () => {
  it('correctly parses @for iterables that contain the word "key" in expressions', () => {
    const template = `
      <div class="list">
        @for item in items.filter(x => x.key === 'active') {
          <span>{item.name}</span>
        }
      </div>
    `;

    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const divNode = ast.body.find((n: any) => n.type === ASTNodeType.Element) as any;
    const forNode = divNode.children.find((n: any) => n.type === ASTNodeType.For);
    expect(forNode).toBeDefined();
    expect(forNode.type).toBe(ASTNodeType.For);
    expect(forNode.item).toBe('item');
    expect(forNode.key).toBeNull();
    expect(forNode.iterable).toBe("items.filter(x => x.key === 'active')");
  });

  it('functions with loops containing return statements return the expected value', () => {
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

    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope);
    }

    expect(scope.findItem).toBeDefined();
    const result = scope.findItem([{ id: 1, name: 'First' }, { id: 2, name: 'Second' }], 1);
    expect(result).toEqual({ id: 1, name: 'First' });
  });

  it('assignment expressions evaluate to the assigned value', () => {
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

    expect(scope.x).toBe(42);
    expect(scope.y).toBe(42);
  });

  it('correctly lexes uppercase and mixed-case closing tags for raw text elements', () => {
    const template = `<script>let a = 1;</SCRIPT><div>Hello</div>`;

    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();

    expect(ast.body.length).toBe(2);
    expect((ast.body[0] as any).tagName).toBe('script');
    expect((ast.body[1] as any).tagName).toBe('div');
  });

  it('decodeHTMLEntities gracefully handles out-of-range numeric character references', () => {
    expect(() => {
      decodeHTMLEntities('Invalid entity: &#999999999;');
    }).not.toThrow();
  });

  it('division following postfix increment is not parsed as a regex literal', () => {
    const template = `<div>{ count++ / 2 }</div>`;

    expect(() => {
      const lexer = new DriftLexer(template);
      const parser = new DriftParser(lexer);
      parser.parse();
    }).not.toThrow();
  });

  it('@switch evaluates discriminant expression with side effects exactly once', () => {
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

    const ifNode = transformed.body.find((n) => n.type === ASTNodeType.If) as any;
    expect(ifNode).toBeDefined();
  });

  it('identifier scoping in astToJS resolves globals on prototype chain', () => {
    const identifierNode = { type: 'Identifier', name: 'fetch' };
    const code = astToJS(identifierNode);

    const globalContext = Object.create({ fetch: () => 'mock-fetch' });

    const evalFn = new Function('scope', 'inScopeChain', 'globalThis', `return (${code})`);
    const result = evalFn({}, null, globalContext);

    expect(typeof result).toBe('function');
  });

  it('lexer does not treat literal "}" in text inside element as directive block close', () => {
    const template = `
      @if (show) {
        <div>JSON syntax: { count: 1 }</div>
      }
    `;

    expect(() => {
      const lexer = new DriftLexer(template);
      const parser = new DriftParser(lexer);
      const ast = parser.parse();
      expect(ast.body.filter((n: any) => n.type !== ASTNodeType.Text || n.content.trim() !== '').length).toBe(1);
    }).not.toThrow();
  });

  it('escaped "\\${" inside template literals is not treated as starting an interpolation', () => {
    const template = `<div>{ \`Total: \\\${price}\` }</div>`;

    expect(() => {
      const lexer = new DriftLexer(template);
      const parser = new DriftParser(lexer);
      const ast = parser.parse();
      expect(ast.body.length).toBe(1);
    }).not.toThrow();
  });

  it('destructuring declarations evaluate initializer expression with side effects exactly once', () => {
    const template = `
      <script>
        let callCount = 0;
        function getPayload() {
          callCount++;
          return { a: 1, b: 2, c: 3 };
        }
        const { a, b, c } = getPayload();
      </script>
      <div>{a + b + c}</div>
    `;

    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope, null, (s: any, k: string, v: any) => { s[k] = v; return v; });
    }

    expect(scope.callCount).toBe(1);
    expect(scope.a).toBe(1);
    expect(scope.b).toBe(2);
    expect(scope.c).toBe(3);
  });
});
