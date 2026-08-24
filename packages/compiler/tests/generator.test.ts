import { describe, it, expect } from 'vitest';
import { compile } from '../src/index.js';
import { Opcode } from '../types/index.js';

describe('DriftGenerator', () => {
  it('generates fragment and return for empty templates', () => {
    const module = compile('');

    expect(module.constants).toEqual([]);
    expect(module.bytecode).toEqual([Opcode.CREATE_FRAGMENT, 0, Opcode.RETURN, 0]);
  });

  it('generates direct root element for single top-level element', () => {
    const module = compile('<div>Hello World</div>');

    expect(module.constants).toContain('div');
    expect(module.constants).toContain('Hello World');

    const tagIdx = module.constants.indexOf('div');

    expect(module.bytecode[0]).toBe(Opcode.CREATE_ELEMENT);
    expect(module.bytecode[1]).toBe(0); // rootReg = 0
    expect(module.bytecode[2]).toBe(tagIdx);

    expect(module.bytecode[module.bytecode.length - 2]).toBe(Opcode.RETURN);
    expect(module.bytecode[module.bytecode.length - 1]).toBe(0);
  });

  it('generates fragment container for multiple top-level nodes', () => {
    const module = compile('<h1>Title</h1><p>Paragraph</p>');

    expect(module.bytecode[0]).toBe(Opcode.CREATE_FRAGMENT);
    expect(module.bytecode[1]).toBe(0); // fragment reg

    expect(module.constants).toContain('h1');
    expect(module.constants).toContain('p');
  });

  it('generates static, dynamic, and boolean attributes', () => {
    const module = compile('<input type="checkbox" checked data-id={id} />');

    expect(module.constants).toContain('type');
    expect(module.constants).toContain('checkbox');
    expect(module.constants).toContain('checked');
    expect(module.constants).toContain('data-id');

    // SET_ATTR opcode is present
    expect(module.bytecode).toContain(Opcode.SET_ATTR);
  });

  it('generates interpolated text and comments', () => {
    const module = compile('<!-- header --><div>{ user.name }</div>');

    expect(module.constants).toContain(' header ');
    expect(module.bytecode).toContain(Opcode.CREATE_COMMENT);
    expect(module.bytecode).toContain(Opcode.INTERPOLATE_TEXT);
  });

  it('generates REACTIVE_IF opcode for @if, @else if, and @else control flows', () => {
    const src = `@if isLoggedIn { <span>Welcome</span> } @else if isGuest { <span>Guest</span> } @else { <span>Login</span> }`;
    const module = compile(src);

    // Reactive encoding: emits REACTIVE_IF with sub-modules
    expect(module.bytecode).toContain(Opcode.REACTIVE_IF);

    // The condition AST, consequent sub-module, and deps array must all be in the constant pool
    const reactiveIfIdx = module.bytecode.indexOf(Opcode.REACTIVE_IF);
    expect(reactiveIfIdx).toBeGreaterThan(-1);

    // Operand layout: REACTIVE_IF parentReg condIdx consIdx altIdx depsIdx
    expect(module.bytecode.length).toBeGreaterThan(reactiveIfIdx + 5);
  });

  it('generates REACTIVE_FOR opcode for @for loop directives', () => {
    const src = `@for (item, index) in list { <li>{item}</li> }`;
    const module = compile(src);

    // Reactive encoding: emits REACTIVE_FOR with body sub-module
    expect(module.bytecode).toContain(Opcode.REACTIVE_FOR);

    const reactiveForIdx = module.bytecode.indexOf(Opcode.REACTIVE_FOR);
    expect(reactiveForIdx).toBeGreaterThan(-1);

    // Operand layout: REACTIVE_FOR parentReg iterIdx itemNameIdx indexNameIdx bodyIdx depsIdx
    expect(module.bytecode.length).toBeGreaterThan(reactiveForIdx + 6);
  });

  it('generates bytecode for @switch, @case, and @default directives', () => {
    const src = `@switch role { @case "admin" { <p>Admin</p> } @default { <p>User</p> } }`;
    const module = compile(src);

    expect(module.bytecode).toContain(Opcode.REACTIVE_IF);
  });

  it('works end-to-end via compile() function', () => {
    const template = `
      <ul>
        @for (item, index) in list {
          <li key={index}>{item}</li>
        }
      </ul>
    `;
    const module = compile(template, false);

    expect(module.bytecode.length).toBeGreaterThan(0);
    expect(module.constants.length).toBeGreaterThan(0);
  });

  it('extracts imports metadata from script block', () => {
    const src = `<script>import Header from "./Header.drift";</script><div><Header /></div>`;
    const module = compile(src);

    expect(module.imports).toBeDefined();
    expect(module.imports).toHaveLength(1);
    expect(module.imports![0]).toEqual({
      localName: 'Header',
      source: './Header.drift',
      isDefault: true,
      isNamespace: false,
      importedName: undefined,
    });
    expect(module.declaredVars).toContain('Header');
  });

  it('extracts namespace and side-effect imports metadata from script block', () => {
    const src = `
      <script>
        import * as helpers from "./helpers";
        import "./theme.css";
      </script>
      <div>Test</div>
    `;
    const module = compile(src);

    expect(module.imports).toBeDefined();
    expect(module.imports).toHaveLength(2);
    expect(module.imports![0]).toEqual({
      localName: 'helpers',
      source: './helpers',
      isDefault: false,
      isNamespace: true,
      importedName: undefined,
    });
    expect(module.imports![1]).toEqual({
      localName: '',
      source: './theme.css',
      isDefault: false,
      isSideEffect: true,
    });
    expect(module.declaredVars).toContain('helpers');
  });

  it('generates propsSpec for component elements with static and dynamic attributes', () => {
    const src = `<script>import Header from "./Header.drift"; let count = 5;</script><div><Header title="Drift" count={count} /></div>`;
    const module = compile(src);

    expect(module.declaredVars).toContain('Header');
    expect(module.declaredVars).toContain('count');

    const propsSpec = module.constants.find(
      (c) => typeof c === 'object' && c !== null && 'title' in c && 'count' in c
    );
    expect(propsSpec).toBeDefined();
    expect((propsSpec as any).title).toBe('Drift');
  });

  it('extracts destructured prop variables from script block', () => {
    const src = `<script>let { title = "Default", count = 0 } = props;</script><h1>{title}</h1>`;
    const module = compile(src);

    expect(module.declaredVars).toContain('title');
    expect(module.declaredVars).toContain('count');
  });

  it('packages consequent and alternate branches as separate sub-modules', () => {
    const mod = compile('@if flag { <i>A</i> } @else { <b>B</b> }');
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    const consIdx = mod.bytecode[ifPos + 3]!;
    const altIdx = mod.bytecode[ifPos + 4]!;
    const consMod = mod.constants[consIdx] as any;
    const altMod = mod.constants[altIdx] as any;
    expect(Array.isArray(consMod.bytecode)).toBe(true);
    expect(Array.isArray(altMod.bytecode)).toBe(true);
    expect(consMod).not.toBe(altMod);
  });

  it('generates nested REACTIVE_IF inside consequent sub-module for nested @if', () => {
    const mod = compile('@if outer { @if inner { <b>yes</b> } } @else { <i>no</i> }');
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    const consIdx = mod.bytecode[ifPos + 3]!;
    const consMod = mod.constants[consIdx] as any;
    expect(consMod.bytecode).toContain(Opcode.REACTIVE_IF);
  });

  it('correctly handles ArrayPattern in VariableDeclaration inside script block', () => {
    const src = `<script>const [a, b, c = 10, ...rest] = items;</script><div>{a}-{b}-{c}</div>`;
    const module = compile(src);

    expect(module.declaredVars).toContain('a');
    expect(module.declaredVars).toContain('b');
    expect(module.declaredVars).toContain('c');
    expect(module.declaredVars).toContain('rest');

    const scriptConst = module.constants.find((c) => typeof c === 'object' && c !== null && '__drift_fn__' in c);
    expect(scriptConst).toBeDefined();
    const fnStr = (scriptConst as any).__drift_fn__;
    expect(fnStr).not.toContain('"[ a, b, c = 10, ...rest ]"');
    expect(fnStr).toContain('"a"');
    expect(fnStr).toContain('"b"');
    expect(fnStr).toContain('"c"');
    expect(fnStr).toContain('"rest"');
  });

  it('correctly handles destructured object and rest parameters in functions and arrow functions', () => {
    const src = `
      <script>
        function formatUser({ name, role = "guest" }, ...extra) {
          return name + ":" + role + ":" + extra.join(",");
        }
        const calc = ([a, b = 2], ...rest) => a + b + rest.length;
      </script>
      <div>Test</div>
    `;
    const module = compile(src);

    const scriptConst = module.constants.find((c) => typeof c === 'object' && c !== null && '__drift_fn__' in c);
    expect(scriptConst).toBeDefined();
    const fnStr = (scriptConst as any).__drift_fn__;

    // Parameter names and rest arguments preserved
    expect(fnStr).toContain('...extra');
    expect(fnStr).toContain('...rest');
    // Function body should use local variable references for parameters
    expect(fnStr).not.toContain('scope["name"]');
    expect(fnStr).not.toContain('scope["extra"]');
    expect(fnStr).not.toContain('scope["rest"]');
  });

  it('correctly emits async modifier and await expressions in functions and arrow functions', () => {
    const src = `
      <script>
        async function fetchUser(id) {
          const res = await Promise.resolve({ id, name: "User" + id });
          return res;
        }
        const load = async (url) => {
          return await Promise.resolve(url);
        };
      </script>
      <div>Test</div>
    `;
    const module = compile(src);

    const scriptConst = module.constants.find((c) => typeof c === 'object' && c !== null && '__drift_fn__' in c);
    expect(scriptConst).toBeDefined();
    const fnStr = (scriptConst as any).__drift_fn__;

    expect(fnStr).toContain('async function fetchUser(id)');
    expect(fnStr).toContain('async (url) =>');
    expect(fnStr).toContain('await');
  });

  it('correctly generates code for try/catch/finally, throw, and switch/case statements', () => {
    const src = `
      <script>
        function runSafe(val) {
          try {
            switch (val) {
              case 1:
                return "one";
              case 2:
                return "two";
              default:
                throw new Error("unsupported");
            }
          } catch (err) {
            return "caught: " + err.message;
          } finally {
            let done = true;
          }
        }
      </script>
      <div>Test</div>
    `;
    const module = compile(src);

    const scriptConst = module.constants.find((c) => typeof c === 'object' && c !== null && '__drift_fn__' in c);
    expect(scriptConst).toBeDefined();
    const fnStr = (scriptConst as any).__drift_fn__;

    expect(fnStr).toContain('try {');
    expect(fnStr).toContain('switch (');
    expect(fnStr).toContain('case 1:');
    expect(fnStr).toContain('default:');
    expect(fnStr).toContain('throw new');
    expect(fnStr).toContain('catch (err)');
    expect(fnStr).toContain('finally {');
  });

  it('correctly generates code for class declarations with methods and properties', () => {
    const src = `
      <script>
        class Counter {
          count = 0;
          constructor(init = 0) {
            this.count = init;
          }
          inc() {
            this.count++;
          }
        }
      </script>
      <div>Test</div>
    `;
    const module = compile(src);

    expect(module.declaredVars).toContain('Counter');

    const scriptConst = module.constants.find((c) => typeof c === 'object' && c !== null && '__drift_fn__' in c);
    expect(scriptConst).toBeDefined();
    const fnStr = (scriptConst as any).__drift_fn__;

    expect(fnStr).toContain('class Counter');
    expect(fnStr).toContain('constructor(');
    expect(fnStr).toContain('inc()');
  });

  it('BUG-021: exhaustively extracts reactive dependencies from complex and modern ESTree expressions', () => {
    const src = `
      <script>
        let a = 1;
        let b = 2;
        let c = 3;
        let d = 4;
        let user = { profile: { name: 'Alice' } };
        let customTag = (s) => s;
      </script>
      <div>
        { customTag\`prefix \${a} middle \${b} suffix\` }
        { c ?? (d ? user?.profile?.name : 'fallback') }
      </div>
    `;
    const module = compile(src);

    expect(module.reactiveBindings).toBeDefined();
    const boundVars = module.reactiveBindings!.map((b) => b.variable);
    expect(boundVars).toContain('customTag');
    expect(boundVars).toContain('a');
    expect(boundVars).toContain('b');
    expect(boundVars).toContain('c');
    expect(boundVars).toContain('d');
    expect(boundVars).toContain('user');
  });

  it('BUG-026: extractBindingNames extracts identifiers across nested object/array destructuring, defaults, and rest elements', () => {
    const src = `
      <script>
        const { a, b: { c = 10, d: [e, ...f] } = {}, ...restObj } = complexSource;
      </script>
      <div>{a}</div>
    `;
    const module = compile(src);

    expect(module.declaredVars).toContain('a');
    expect(module.declaredVars).toContain('c');
    expect(module.declaredVars).toContain('e');
    expect(module.declaredVars).toContain('f');
    expect(module.declaredVars).toContain('restObj');
  });

  it('BUG-027: unified destructuring assignments support nested objects, arrays, and defaults in expressions and statements', () => {
    const src = `
      <script>
        let x = 0;
        let y = 0;
        function update(source) {
          ({ a: x, b: { c: y = 42 } } = source);
        }
      </script>
      <button onclick={ () => update({ a: 1, b: {} }) }>Click</button>
    `;
    const module = compile(src);
    expect(module.declaredVars).toContain('x');
    expect(module.declaredVars).toContain('y');
    expect(module.declaredVars).toContain('update');
  });

  it('correctly compiles CatchClause with destructured parameters and defaults (BUG-009)', () => {
    const src = `
      <script>
        let result = '';
        try {
          throw { message: 'failed', code: 500 };
        } catch ({ message = 'unknown', code = 0 }) {
          result = message + ':' + code;
        }
      </script>
      <div>{result}</div>
    `;
    const module = compile(src);
    const scriptConst = module.constants.find((c) => typeof c === 'object' && c !== null && '__drift_fn__' in c);
    expect(scriptConst).toBeDefined();
    const fnStr = (scriptConst as any).__drift_fn__;
    expect(fnStr).toContain('catch');
    expect(fnStr).toContain('message');
    expect(fnStr).toContain('code');
  });
});

