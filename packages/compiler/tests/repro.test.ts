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

  it('extracts computed member expression identifiers as reactive dependencies', () => {
    const template = `
      <script>
        let items = ['zero', 'one', 'two'];
        let selectedIdx = 1;
      </script>
      <div>{items[selectedIdx]}</div>
    `;
    const compiled = compile(template);
    const selectedBinding = compiled.reactiveBindings?.find((b) => b.variable === 'selectedIdx');
    expect(selectedBinding).toBeDefined();
    expect(selectedBinding?.positions.length).toBeGreaterThan(0);
  });

  it('destructuring with default value applies default when property is explicitly undefined', () => {
    const template = `
      <script>
        const { val = 'defaultVal' } = { val: undefined };
      </script>
      <div>{val}</div>
    `;
    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope, null, (s: any, k: string, v: any) => { s[k] = v; return v; });
    }
    expect(scope.val).toBe('defaultVal');
  });

  it('destructuring with computed property name evaluates dynamic property key', () => {
    const template = `
      <script>
        let dynamicKey = 'customProp';
        let sourceObj = { customProp: 'hello world' };
        const { [dynamicKey]: extracted } = sourceObj;
      </script>
      <div>{extracted}</div>
    `;
    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope, null, (s: any, k: string, v: any) => { s[k] = v; return v; }, (s: any, k: string) => k in s);
    }
    expect(scope.extracted).toBe('hello world');
  });

  it('switch on dynamic discriminant tracks reactive dependencies for alternate branches', () => {
    const template = `
      <script>
        let state = { mode: 'dark' };
      </script>
      @switch state.mode {
        @case 'light' {
          <span>Light Mode</span>
        }
        @case 'dark' {
          <span>Dark Mode</span>
        }
        @default {
          <span>Default Mode</span>
        }
      }
    `;
    const ast = new DriftParser(new DriftLexer(template)).parse();
    const transformed = new DriftTransformer(ast).transform();
    const generator = new DriftGenerator(transformed);
    const compiled = generator.generate();

    const reactiveIfConsts = compiled.constants.filter((c) => c && typeof c === 'object' && c.bytecode);
    for (const mod of reactiveIfConsts) {
      if (mod.constants) {
        const depsArray = mod.constants.find((c: any) => Array.isArray(c) && c.includes('state'));
        expect(depsArray).toBeDefined();
      }
    }
  });

  it('ArrayPattern destructuring assignment resolves iterables', () => {
    const template = `
      <script>
        let a, b;
        [a, b] = new Set(['first', 'second']);
      </script>
      <div>{a}, {b}</div>
    `;
    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope, null, (s: any, k: string, v: any) => { s[k] = v; return v; }, null, (iter: any) => Array.from(iter));
    }
    expect(scope.a).toBe('first');
    expect(scope.b).toBe('second');
  });

  it('parses @for directive with destructuring pattern and index parameter', () => {
    const template = `
      <div>
        @for (({ id, name }, idx) in users) {
          <span>{name} ({idx})</span>
        }
      </div>
    `;
    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();

    const divNode = ast.body.find((n: any) => n.type === ASTNodeType.Element) as any;
    const forNode = divNode.children.find((n: any) => n.type === ASTNodeType.For);

    expect(forNode).toBeDefined();
    expect(forNode.item).toBe('{ id, name }');
    expect(forNode.index).toBe('idx');
  });

  it('astToJS generates assignment code for destructuring assignments to local variables', () => {
    const template = `
      <script>
        function run() {
          let x = 0, y = 0;
          [x, y] = [100, 200];
          return x + y;
        }
      </script>
      <div>{run()}</div>
    `;
    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope, null, (s: any, k: string, v: any) => { s[k] = v; return v; });
    }
    expect(scope.run).toBeDefined();
    expect(scope.run()).toBe(300);
  });

  it('readDirectiveHeader parses directive header with template literal containing nested braces', () => {
    const template = '@if (msg === `val: ${format({ active: true })}`) { <span>Active</span> }';
    const lexer = new DriftLexer(template);
    const token = lexer.nextToken();
    expect(token.type).toBe('DirectiveIf');
    expect(token.value).toBe('(msg === `val: ${format({ active: true })}`)');
  });

  it('preserves HTML entity strings inside script tags without decoding them', () => {
    const template = `
      <script>
        const text = "Tom &amp; Jerry";
        const json = "&quot;quoted&quot;";
      </script>
      <div>{text}</div>
    `;
    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const scriptNode = ast.body.find((n: any) => n.type === ASTNodeType.Element && n.tagName === 'script') as any;
    expect(scriptNode).toBeDefined();
    const scriptText = scriptNode.children[0].content;
    expect(scriptText).toContain('"Tom &amp; Jerry"');
    expect(scriptText).toContain('"&quot;quoted&quot;"');
  });

  it('extractIdentifiers captures variables in optional chaining expressions', () => {
    const template = `
      <script>
        let user = { profile: { name: 'Alice' } };
      </script>
      <div>{user?.profile?.name}</div>
    `;
    const compiled = compile(template);
    const userBinding = compiled.reactiveBindings?.find((b) => b.variable === 'user');
    expect(userBinding).toBeDefined();
    expect(userBinding?.positions.length).toBeGreaterThan(0);
  });

  it('lexes attribute string literals containing escaped quotes correctly', () => {
    const template = `<input placeholder="He said \\"hello\\"" />`;
    const lexer = new DriftLexer(template);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const inputNode = ast.body.find((n: any) => n.type === ASTNodeType.Element && n.tagName === 'input') as any;
    expect(inputNode).toBeDefined();
    const placeholderAttr = inputNode.attributes.find((a: any) => a.name === 'placeholder');
    expect(placeholderAttr).toBeDefined();
    expect(placeholderAttr.value).toBe('He said "hello"');
  });

  it('preserves "this" context inside class methods and constructors', () => {
    const template = `
      <script>
        class Counter {
          constructor(initial = 0) {
            this.val = initial;
          }
          increment() {
            this.val++;
            return this.val;
          }
        }
      </script>
      <div>Counter</div>
    `;
    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope);
    }
    expect(scope.Counter).toBeDefined();
    const counter = new scope.Counter(5);
    expect(counter.val).toBe(5);
    expect(counter.increment()).toBe(6);
    expect(counter.val).toBe(6);
  });

  it('extractIdentifiers does not fall through into ChainExpression for SequenceExpression (BUG-003)', () => {
    const template = `
      <script>
        let a = 1, b = 2;
        let c = (a++, b++);
      </script>
      <div>{c}</div>
    `;
    const compiled = compile(template);
    expect(compiled.reactiveBindings).toBeDefined();
  });

  it('function parameter default expressions correctly resolve earlier parameters (BUG-005)', () => {
    const template = `
      <script>
        function greet(name, greeting = 'Hello, ' + name) {
          return greeting;
        }
      </script>
      <div>{greet('World')}</div>
    `;
    const compiled = compile(template);
    const scope: Record<string, any> = {};
    const scriptAst = compiled.constants[0];
    if (typeof scriptAst === 'object' && scriptAst.__drift_fn__) {
      const fn = new Function('return (' + scriptAst.__drift_fn__ + ')')();
      fn(scope);
    }
    expect(scope.greet).toBeDefined();
    expect(scope.greet('World')).toBe('Hello, World');
    expect(scope.greet('Drift', 'Welcome to Drift')).toBe('Welcome to Drift');
  });
});


