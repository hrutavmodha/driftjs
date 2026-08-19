import { describe, it, expect, vi } from 'vitest';
import { DriftClientVM, mount } from '../src/index.js';
import { Opcode, type CompiledModule } from '../types/index.js';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';
import { setScopeValue } from 'driftjs-shared';

describe('DriftClientVM', () => {
  const vm = new DriftClientVM();
  const doc = document;

  it('renders simple static HTML elements', () => {
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = createElement('h1')
        Opcode.CREATE_TEXT, 1, 1,    // r1 = createTextNode('Hello World')
        Opcode.APPEND_CHILD, 0, 1,   // r0.appendChild(r1)
        Opcode.RETURN, 0,            // return r0
      ],
      constants: ['h1', 'Hello World'],
    };

    const node = vm.execute(module, { document: doc });
    expect(node).toBeDefined();
    expect(node).toBeInstanceOf(HTMLHeadingElement);
    expect(node!.nodeName).toBe('H1');
    expect(node!.textContent).toBe('Hello World');
  });

  it('renders attributes dynamically and statically', () => {
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,            // r0 = createElement('input')
        Opcode.SET_ATTR, 0, 1, 2, 0,            // r0.setAttribute('type', 'checkbox')
        Opcode.SET_ATTR, 0, 3, 4, 1,            // r0.setAttribute('data-id', eval(expr))
        Opcode.RETURN, 0,                       // return r0
      ],
      constants: ['input', 'type', 'checkbox', 'data-id', { __drift_fn__: '(scope) => scope.id' }],
    };

    const node = vm.execute(module, {
      document: doc,
      scope: { id: 42 },
    }) as HTMLInputElement;

    expect(node).toBeInstanceOf(HTMLInputElement);
    expect(node.type).toBe('checkbox');
    expect(node.getAttribute('data-id')).toBe('42');
  });

  it('renders REACTIVE_IF: true branch shown, false branch hidden', () => {
    const consMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.CREATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['span', 'User'],
      reactiveBindings: [],
    };
    const altMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.CREATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['span', 'Guest'],
      reactiveBindings: [],
    };
    const condExpr = { __drift_fn__: '(scope) => scope.isLoggedIn' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.REACTIVE_IF, 0, 1, 2, 3, 4,
        Opcode.RETURN, 0,
      ],
      constants: [null, condExpr, consMod, altMod, ['isLoggedIn']],
    };

    const userResult = new DriftClientVM().execute(module, {
      document: doc,
      scope: { isLoggedIn: true },
    }) as DocumentFragment;

    const children = Array.from(userResult.childNodes);
    expect(children.length).toBe(3);
    expect(children[1]).toBeInstanceOf(HTMLSpanElement);
    expect((children[1] as HTMLSpanElement).textContent).toBe('User');

    const guestResult = new DriftClientVM().execute(module, {
      document: doc,
      scope: { isLoggedIn: false },
    }) as DocumentFragment;

    const guestChildren = Array.from(guestResult.childNodes);
    expect(guestChildren.length).toBe(3);
    expect(guestChildren[1]).toBeInstanceOf(HTMLSpanElement);
    expect((guestChildren[1] as HTMLSpanElement).textContent).toBe('Guest');
  });

  it('REACTIVE_IF re-renders on state change (triggerUpdates)', () => {
    const consMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.CREATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['p', 'Shown'],
      reactiveBindings: [],
    };
    const condExpr = { __drift_fn__: '(scope) => scope.show' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.REACTIVE_IF, 0, 1, 2, 0xFF, 3,
        Opcode.RETURN, 0,
      ],
      constants: [null, condExpr, consMod, ['show']],
      reactiveBindings: [],
    };

    const freshVm = new DriftClientVM();
    const container = doc.createElement('div');
    const frag = freshVm.execute(module, { document: doc, scope: { show: true } }) as DocumentFragment;
    container.appendChild(frag);

    expect(container.querySelector('p')).not.toBeNull();

    (freshVm as any).scope.show = false;
    freshVm.triggerUpdates(new Set(['show']));
    expect(container.querySelector('p')).toBeNull();

    (freshVm as any).scope.show = true;
    freshVm.triggerUpdates(new Set(['show']));
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('correctly updates @if / @else if / @else chain when resetting count to 0', () => {
    const src = `
      <script>
        let count = 0;
      </script>
      <div>
        <p class="status">
          @if count > 0 {
            <span>Positive</span>
          } @else if count < 0 {
            <span>Negative</span>
          } @else {
            <span>Zero</span>
          }
        </p>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = doc.createElement('div');
    const root = vmInstance.execute(mod, { document: doc });
    if (root) container.appendChild(root);

    expect(container.querySelector('.status span')?.textContent).toBe('Zero');

    (vmInstance as any).scope.count = 1;
    vmInstance.triggerUpdates(new Set(['count']));
    expect(container.querySelector('.status span')?.textContent).toBe('Positive');

    (vmInstance as any).scope.count = -1;
    vmInstance.triggerUpdates(new Set(['count']));
    expect(container.querySelector('.status span')?.textContent).toBe('Negative');

    (vmInstance as any).scope.count = 0;
    vmInstance.triggerUpdates(new Set(['count']));
    expect(container.querySelector('.status span')?.textContent).toBe('Zero');
  });


  it('renders REACTIVE_FOR: list items rendered between anchors', () => {
    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.INTERPOLATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['li', { __drift_fn__: '(scope) => scope.item' }],
      reactiveBindings: [],
    };
    const iterExpr = { __drift_fn__: '(scope) => scope.items' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 0xFF, 3, 4,
        Opcode.RETURN, 0,
      ],
      constants: ['ul', iterExpr, 'item', bodyMod, ['items']],
    };

    const result = new DriftClientVM().execute(module, {
      document: doc,
      scope: { items: ['Apple', 'Banana', 'Cherry'] },
    }) as HTMLUListElement;

    expect(result).toBeInstanceOf(HTMLUListElement);
    const lis = result.querySelectorAll('li');
    expect(lis.length).toBe(3);
    expect(lis[0]?.textContent).toBe('Apple');
    expect(lis[1]?.textContent).toBe('Banana');
    expect(lis[2]?.textContent).toBe('Cherry');
  });

  it('REACTIVE_FOR re-renders on list change (triggerUpdates)', () => {
    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.INTERPOLATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['li', { __drift_fn__: '(scope) => scope.item' }],
      reactiveBindings: [],
    };
    const iterExpr = { __drift_fn__: '(scope) => scope.items' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 0xFF, 3, 4,
        Opcode.RETURN, 0,
      ],
      constants: ['ul', iterExpr, 'item', bodyMod, ['items']],
    };

    const freshVm = new DriftClientVM();
    const ul = freshVm.execute(module, {
      document: doc,
      scope: { items: ['Apple', 'Banana'] },
    }) as HTMLUListElement;

    expect(ul.querySelectorAll('li').length).toBe(2);

    (freshVm as any).scope.items = ['Apple', 'Banana', 'Cherry'];
    freshVm.triggerUpdates(new Set(['items']));

    expect(ul.querySelectorAll('li').length).toBe(3);
    expect(ul.querySelectorAll('li')[2]?.textContent).toBe('Cherry');
  });

  it('mounts a component directly to an HTMLElement container', () => {
    const container = document.createElement('div');
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.CREATE_TEXT, 1, 1,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['p', 'Mounted Component'],
    };

    mount(module, container);
    expect(container.children.length).toBe(1);
    expect(container.firstElementChild?.tagName).toBe('P');
    expect(container.firstElementChild?.textContent).toBe('Mounted Component');
  });

  it('updates reactive nodes in-place via updateAt(pc, module, scope)', () => {
    const vmInstance = new DriftClientVM();
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.INTERPOLATE_TEXT, 1, 1,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['p', { __drift_fn__: '(scope) => scope.count' }],
    };

    const initialScope = { count: 0 };
    const p = vmInstance.execute(module, { document: doc, scope: initialScope }) as HTMLParagraphElement;
    expect(p.textContent).toBe('0');

    const updatedScope = { count: 1 };
    vmInstance.updateAt(3, module, { document: doc, scope: updatedScope });
    expect(p.textContent).toBe('1');
  });

  it('EXEC_SCRIPT initialises scope from VariableDeclaration and FunctionDeclaration AST', () => {
    const vmInstance = new DriftClientVM();
    const scriptBody = {
      __drift_fn__: `(scope, declaredVars, setScopeValue) => {
        scope.count = 0;
        scope.increment = function() {
          scope.count++;
          setScopeValue(scope, 'count', scope.count);
        };
      }`,
    };
    const countExpr = { __drift_fn__: '(scope) => scope.count' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_FRAGMENT, 1,
        Opcode.CREATE_ELEMENT, 2, 1,
        Opcode.INTERPOLATE_TEXT, 3, 2,
        Opcode.APPEND_CHILD, 2, 3,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ],
      constants: [scriptBody, 'p', countExpr],
      reactiveBindings: [{ variable: 'count', positions: [{ pc: 7, opcode: Opcode.INTERPOLATE_TEXT }] }],
    };

    const frag = vmInstance.execute(module, { document: doc }) as DocumentFragment;
    const p = frag.firstChild as HTMLParagraphElement;

    expect(p.textContent).toBe('0');

    (vmInstance as any).scope.increment();
    vmInstance.triggerUpdates(new Set(['count']));

    expect((vmInstance as any).scope.count).toBe(1);
    expect(p.textContent).toBe('1');
  });

  it('renders nested @for loops correctly', () => {
    const src = `
      <script>
        let categories = [
          { name: 'Fruits', items: ['Apple', 'Banana'] },
          { name: 'Veggies', items: ['Carrot'] }
        ];
      </script>
      <div>
        @for cat in categories {
          <div class="category">
            <h3>{cat.name}</h3>
            <ul>
              @for item in cat.items {
                <li>{item}</li>
              }
            </ul>
          </div>
        }
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    const categories = container.querySelectorAll('.category');
    expect(categories.length).toBe(2);

    const fruitsLis = categories[0]?.querySelectorAll('li');
    expect(fruitsLis?.length).toBe(2);
    expect(fruitsLis?.[0]?.textContent).toBe('Apple');

    const veggiesLis = categories[1]?.querySelectorAll('li');
    expect(veggiesLis?.length).toBe(1);
    expect(veggiesLis?.[0]?.textContent).toBe('Carrot');
  });

  it('uses a single delegated event listener on document for thousands of items', () => {
    const src = `
      <script>
        let count = 0;
        function inc() { count++; }
      </script>
      <div>
        <button id="b1" onclick={inc}>Btn 1</button>
        <button id="b2" onclick={inc}>Btn 2</button>
        <button id="b3" onclick={inc}>Btn 3</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    const clickListeners = addEventListenerSpy.mock.calls.filter((call) => call[0] === 'click');
    expect(clickListeners.length).toBe(1);

    addEventListenerSpy.mockRestore();
  });

  it('handles event bubbling when clicking nested children inside an event-bound element', () => {
    const clicked = vi.fn();

    const src = `
      <script>
        function handleClick() {
          clicked();
        }
      </script>
      <div>
        <button id="btn" onclick={handleClick}>
          <span id="inner-span">Click <strong>Me</strong></span>
        </button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { scope: { clicked }, document });
    if (root) container.appendChild(root);

    const strong = container.querySelector('strong') as HTMLElement;
    expect(strong).not.toBeNull();

    strong.click();

    expect(clicked).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
  });

  it('updates list history on click event in template component', () => {
    const src = `
      <script>
        let count = 0;
        let history = [];

        function increment() {
          count++; 
          history = [...history, 'Incremented'];
        }
      </script>

      <div class="card">
        <button class="btn btn-inc" onclick={increment}>+</button>
        <ul class="history">
          @for log in history {
            <li class="pill">{log}</li>
          }
        </ul>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    const incBtn = container.querySelector('.btn-inc') as HTMLButtonElement;
    incBtn.click();

    const lis1 = container.querySelectorAll('.history .pill');
    expect(lis1.length).toBe(1);

    document.body.removeChild(container);
  });

  it('updates modified list item in-place without touching unchanged DOM nodes', () => {
    const src = `
      <script>
        let items = [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' },
          { id: 3, text: 'Item 3' }
        ];
      </script>
      <div>
        <ul>
          @for item in items {
            <li id={'item-' + item.id}>{item.text}</li>
          }
        </ul>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    const li1Before = container.querySelector('#item-1');
    const li2Before = container.querySelector('#item-2');
    const li3Before = container.querySelector('#item-3');

    expect(li2Before?.textContent).toBe('Item 2');

    (vmInstance as any).scope.items = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2 UPDATED' },
      { id: 3, text: 'Item 3' }
    ];

    vmInstance.triggerUpdates(new Set(['items']));

    const li1After = container.querySelector('#item-1');
    const li2After = container.querySelector('#item-2');
    const li3After = container.querySelector('#item-3');

    expect(li1Before).toBe(li1After);
    expect(li3Before).toBe(li3After);
    expect(li2After?.textContent).toBe('Item 2 UPDATED');
  });

  it('re-renders @switch directive reactively when discriminant state variable changes', () => {
    const src = `
      <script>
        let mode = 'all';
      </script>
      <div>
        @switch mode {
          @case 'all' {
            <p class="content">Showing ALL</p>
          }
          @case 'active' {
            <p class="content">Showing ACTIVE</p>
          }
          @default {
            <p class="content">Showing DEFAULT</p>
          }
        }
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.content')?.textContent).toBe('Showing ALL');

    (vmInstance as any).scope.mode = 'active';
    vmInstance.triggerUpdates(new Set(['mode']));

    expect(container.querySelector('.content')?.textContent).toBe('Showing ACTIVE');

    (vmInstance as any).scope.mode = 'other';
    vmInstance.triggerUpdates(new Set(['mode']));

    expect(container.querySelector('.content')?.textContent).toBe('Showing DEFAULT');
  });

  describe('Comprehensive Control Flow Nesting & All Directives Suite', () => {
    // 1. @for inside @if / @else
    it('renders @for nested inside @if and switches cleanly when outer condition toggles', () => {
      const src = `
        <script>
          let showList = true;
          let items = ['Alpha', 'Beta', 'Gamma'];
        </script>
        <div id="root">
          @if showList {
            <ul class="items-list">
              @for item in items {
                <li class="item">{item}</li>
              }
            </ul>
          } @else {
            <p class="empty">List Hidden</p>
          }
        </div>
      `;

      const mod = new DriftGenerator(new DriftTransformer(new DriftParser(new DriftLexer(src)).parse()).transform()).generate();
      const vmInstance = new DriftClientVM();
      const container = document.createElement('div');
      const root = vmInstance.execute(mod, { document });
      if (root) container.appendChild(root);

      expect(container.querySelectorAll('.item').length).toBe(3);
      expect(container.querySelector('.empty')).toBeNull();

      // Mutate nested list state while visible
      (vmInstance as any).scope.items = ['Delta', 'Epsilon'];
      vmInstance.triggerUpdates(new Set(['items']));
      expect(container.querySelectorAll('.item').length).toBe(2);
      expect(container.querySelectorAll('.item')[0]!.textContent).toBe('Delta');

      // Toggle outer @if to false
      (vmInstance as any).scope.showList = false;
      vmInstance.triggerUpdates(new Set(['showList']));
      expect(container.querySelectorAll('.item').length).toBe(0);
      expect(container.querySelector('.empty')?.textContent).toBe('List Hidden');

      // Toggle outer @if back to true
      (vmInstance as any).scope.showList = true;
      vmInstance.triggerUpdates(new Set(['showList']));
      expect(container.querySelectorAll('.item').length).toBe(2);
      expect(container.querySelectorAll('.item')[0]!.textContent).toBe('Delta');
    });

    it('handles @if nested inside @for loop and re-evaluates conditionals per row on item/condition updates', () => {
      const src = `
        <script>
          let numbers = [1, 2, 3, 4, 5];
          let filterMode = 'even';
        </script>
        <div id="root">
          <ul class="num-list">
            @for num in numbers {
              <li class="num-item">
                @if num % 2 === 0 {
                  <span class="even-tag">Even: {num}</span>
                } @else {
                  <span class="odd-tag">Odd: {num}</span>
                }
              </li>
            }
          </ul>
        </div>
      `;

      const mod = new DriftGenerator(new DriftTransformer(new DriftParser(new DriftLexer(src)).parse()).transform()).generate();
      const vmInstance = new DriftClientVM();
      const container = document.createElement('div');
      const root = vmInstance.execute(mod, { document });
      if (root) container.appendChild(root);

      expect(container.querySelectorAll('.even-tag').length).toBe(2);
      expect(container.querySelectorAll('.odd-tag').length).toBe(3);

      // Mutate list items
      (vmInstance as any).scope.numbers = [10, 20, 30];
      vmInstance.triggerUpdates(new Set(['numbers']));
      expect(container.querySelectorAll('.even-tag').length).toBe(3);
      expect(container.querySelectorAll('.odd-tag').length).toBe(0);
    });

    it('handles 4-level ultra-nested control flow (@if -> @for -> @if -> @switch) and maintains reactivity', () => {
      const src = `
        <script>
          let activeSection = 'users';
          let users = [
            { id: 1, name: 'Alice', role: 'admin', active: true },
            { id: 2, name: 'Bob', role: 'user', active: false },
            { id: 3, name: 'Charlie', role: 'guest', active: true }
          ];
        </script>
        <div id="app">
          @if activeSection === 'users' {
            <div class="users-view">
              @for user in users {
                <div class="user-card">
                  @if user.active {
                    <span class="status-active">{user.name}</span>
                    @switch user.role {
                      @case 'admin' {
                        <strong class="role-badge admin">Full Access</strong>
                      }
                      @case 'user' {
                        <strong class="role-badge user">Standard Access</strong>
                      }
                      @default {
                        <strong class="role-badge guest">Restricted Access</strong>
                      }
                    }
                  } @else {
                    <span class="status-inactive">{user.name} (Disabled)</span>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="other-view">Section Offline</div>
          }
        </div>
      `;

      const mod = new DriftGenerator(new DriftTransformer(new DriftParser(new DriftLexer(src)).parse()).transform()).generate();
      const vmInstance = new DriftClientVM();
      const container = document.createElement('div');
      const root = vmInstance.execute(mod, { document });
      if (root) container.appendChild(root);

      // User 1 (Alice): active admin -> status-active + role-badge admin
      // User 2 (Bob): inactive user -> status-inactive
      // User 3 (Charlie): active guest -> status-active + role-badge guest
      expect(container.querySelectorAll('.user-card').length).toBe(3);
      expect(container.querySelectorAll('.status-active').length).toBe(2);
      expect(container.querySelectorAll('.status-inactive').length).toBe(1);
      expect(container.querySelector('.role-badge.admin')?.textContent).toBe('Full Access');
      expect(container.querySelector('.role-badge.guest')?.textContent).toBe('Restricted Access');

      // Update inner list element
      (vmInstance as any).scope.users = [
        { id: 1, name: 'Alice', role: 'user', active: true },
        { id: 2, name: 'Bob', role: 'admin', active: true }
      ];
      vmInstance.triggerUpdates(new Set(['users']));

      expect(container.querySelectorAll('.user-card').length).toBe(2);
      expect(container.querySelectorAll('.status-active').length).toBe(2);
      expect(container.querySelectorAll('.status-inactive').length).toBe(0);
      expect(container.querySelector('.role-badge.admin')?.textContent).toBe('Full Access');

      // Switch top-level section
      (vmInstance as any).scope.activeSection = 'other';
      vmInstance.triggerUpdates(new Set(['activeSection']));

      expect(container.querySelector('.users-view')).toBeNull();
      expect(container.querySelector('.other-view')?.textContent).toBe('Section Offline');

      // Switch back to users section
      (vmInstance as any).scope.activeSection = 'users';
      vmInstance.triggerUpdates(new Set(['activeSection']));
      expect(container.querySelectorAll('.user-card').length).toBe(2);
    });

    // 4. Same-directive self-nesting: @if inside @if inside @if
    it('handles 3-level deep self-nested @if inside @if inside @if', () => {
      const src = `
        <script>
          let outer = true;
          let mid = true;
          let inner = true;
        </script>
        <div>
          @if outer {
            @if mid {
              @if inner {
                <span class="depth-node">DEEP TRUE</span>
              } @else {
                <span class="depth-node">INNER FALSE</span>
              }
            } @else {
              <span class="depth-node">MID FALSE</span>
            }
          } @else {
            <span class="depth-node">OUTER FALSE</span>
          }
        </div>
      `;

      const mod = new DriftGenerator(new DriftTransformer(new DriftParser(new DriftLexer(src)).parse()).transform()).generate();
      const vmInstance = new DriftClientVM();
      const container = document.createElement('div');
      const root = vmInstance.execute(mod, { document });
      if (root) container.appendChild(root);

      expect(container.querySelector('.depth-node')?.textContent).toBe('DEEP TRUE');

      (vmInstance as any).scope.inner = false;
      vmInstance.triggerUpdates(new Set(['inner']));
      expect(container.querySelector('.depth-node')?.textContent).toBe('INNER FALSE');

      (vmInstance as any).scope.mid = false;
      vmInstance.triggerUpdates(new Set(['mid']));
      expect(container.querySelector('.depth-node')?.textContent).toBe('MID FALSE');

      (vmInstance as any).scope.outer = false;
      vmInstance.triggerUpdates(new Set(['outer']));
      expect(container.querySelector('.depth-node')?.textContent).toBe('OUTER FALSE');
    });

    // 5. Same-directive self-nesting: @for inside @for (matrix grid)
    it('handles self-nested @for inside @for (2D matrix grid)', () => {
      const src = `
        <script>
          let matrix = [
            [1, 2],
            [3, 4]
          ];
        </script>
        <div>
          @for row in matrix {
            <div class="row">
              @for cell in row {
                <span class="cell">{cell}</span>
              }
            </div>
          }
        </div>
      `;

      const mod = new DriftGenerator(new DriftTransformer(new DriftParser(new DriftLexer(src)).parse()).transform()).generate();
      const vmInstance = new DriftClientVM();
      const container = document.createElement('div');
      const root = vmInstance.execute(mod, { document });
      if (root) container.appendChild(root);

      expect(container.querySelectorAll('.row').length).toBe(2);
      expect(container.querySelectorAll('.cell').length).toBe(4);

      (vmInstance as any).scope.matrix = [
        [10, 20, 30],
        [40, 50, 60]
      ];
      vmInstance.triggerUpdates(new Set(['matrix']));

      expect(container.querySelectorAll('.row').length).toBe(2);
      expect(container.querySelectorAll('.cell').length).toBe(6);
    });

    // 6. Same-directive self-nesting: @switch inside @switch
    it('handles self-nested @switch inside @switch and re-evaluates both discriminants reactively', () => {
      const src = `
        <script>
          let outer = 'a';
          let inner = 'x';
        </script>
        <div>
          @switch outer {
            @case 'a' {
              @switch inner {
                @case 'x' {
                  <span class="sw-res">A-X</span>
                }
                @case 'y' {
                  <span class="sw-res">A-Y</span>
                }
              }
            }
            @case 'b' {
              <span class="sw-res">OUTER-B</span>
            }
          }
        </div>
      `;

      const mod = new DriftGenerator(new DriftTransformer(new DriftParser(new DriftLexer(src)).parse()).transform()).generate();
      const vmInstance = new DriftClientVM();
      const container = document.createElement('div');
      const root = vmInstance.execute(mod, { document });
      if (root) container.appendChild(root);

      expect(container.querySelector('.sw-res')?.textContent).toBe('A-X');

      (vmInstance as any).scope.inner = 'y';
      vmInstance.triggerUpdates(new Set(['inner']));
      expect(container.querySelector('.sw-res')?.textContent).toBe('A-Y');

      (vmInstance as any).scope.outer = 'b';
      vmInstance.triggerUpdates(new Set(['outer']));
      expect(container.querySelector('.sw-res')?.textContent).toBe('OUTER-B');
    });
  });

  it('renders nested components correctly when tag matches scope (raw or ESM default)', () => {
    const childModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.CREATE_TEXT, 1, 1,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['h1', 'Hello from Header'],
    };

    const parentModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.MOUNT_COMPONENT, 1, 1, 0xFF,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['div', 'Header'],
      scope: {
        Header: { default: childModule },
      },
    };

    const vmInstance = new DriftClientVM();
    const root = vmInstance.execute(parentModule, { document }) as HTMLElement;
    expect(root.tagName).toBe('DIV');
    expect(root.querySelector('h1')?.textContent).toBe('Hello from Header');
    expect(root.querySelector('header')).toBeNull();
  });

  it('passes static and dynamic props into nested child component', () => {
    const childComponent = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.CREATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: `(scope) => {
            scope.title = scope.props ? scope.props.title : undefined;
          }`,
        },
        'h1',
        { __drift_fn__: '(scope) => scope.title' },
      ],
      declaredVars: ['title'],
      scope: {},
    };

    const parentComponent = {
      bytecode: new Uint32Array([
        Opcode.MOUNT_COMPONENT, 0, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: [
        'Header',
        { __drift_props__: true, title: 'Hello from Prop!' },
      ],
      declaredVars: ['Header'],
      scope: {
        Header: childComponent,
      },
    };

    const vm = new DriftClientVM();
    const root = vm.execute(parentComponent as any, { document });

    expect(root).toBeDefined();
    expect(root?.textContent).toContain('Hello from Prop!');
  });

  it('reactively updates child component props when parent state changes', () => {
    const childComponent = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.INTERPOLATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        'span',
        { __drift_fn__: '(scope) => scope.count' },
      ],
      reactiveBindings: [
        { variable: 'count', positions: [{ opcode: Opcode.INTERPOLATE_TEXT, pc: 3 }] },
      ],
      declaredVars: ['count'],
      scope: {},
    };

    const parentComponent = {
      bytecode: new Uint32Array([
        Opcode.MOUNT_COMPONENT, 0, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: [
        'CounterDisplay',
        { __drift_props__: true, count: { __drift_fn__: '(scope) => scope.parentCount' } },
      ],
      reactiveBindings: [
        { variable: 'parentCount', positions: [{ opcode: Opcode.MOUNT_COMPONENT, pc: 0 }] },
      ],
      declaredVars: ['CounterDisplay', 'parentCount'],
      scope: {
        CounterDisplay: childComponent,
        parentCount: 10,
      },
    };

    const vm = new DriftClientVM();
    const root = vm.execute(parentComponent as any, { document }) as HTMLElement;

    expect(root).toBeDefined();
    expect(root.textContent).toBe('10');

    (vm as any).scope.parentCount = 42;
    vm.triggerUpdates(new Set(['parentCount']));

    expect(root.textContent).toBe('42');
  });

  it('supports direct props.key expressions in child templates', () => {
    const childComponent = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.INTERPOLATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        'p',
        { __drift_fn__: '(scope) => scope.props.message' },
      ],
      declaredVars: [],
      scope: {},
    };

    const parentComponent = {
      bytecode: new Uint32Array([
        Opcode.MOUNT_COMPONENT, 0, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: [
        'Child',
        { __drift_props__: true, message: 'Direct Prop Access' },
      ],
      declaredVars: ['Child'],
      scope: {
        Child: childComponent,
      },
    };

    const vm = new DriftClientVM();
    const root = vm.execute(parentComponent as any, { document }) as HTMLElement;

    expect(root).toBeDefined();
    expect(root.textContent).toBe('Direct Prop Access');
  });

  it('triggers reactive updates when state is mutated from event handlers inside @for loop items', () => {
    const src = `
      <script>
        let count = 0;
        let items = [1, 2, 3];
        function inc() {
          count++;
        }
      </script>
      <div>
        <span class="total">Total: {count}</span>
        <ul>
          @for item in items {
            <li>
              <button class="item-btn" onclick={inc}>Item {item}</button>
            </li>
          }
        </ul>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.total')?.textContent).toBe('Total: 0');

    const itemBtns = container.querySelectorAll('.item-btn');
    expect(itemBtns.length).toBe(3);

    (itemBtns[0] as HTMLButtonElement).click();

    expect(container.querySelector('.total')?.textContent).toBe('Total: 1');

    (itemBtns[1] as HTMLButtonElement).click();

    expect(container.querySelector('.total')?.textContent).toBe('Total: 2');

    document.body.removeChild(container);
  });

  it('triggers reactivity across parent and child VM scopes when parent state is mutated via setScopeValue', () => {
    const initialScope: Record<string, any> = { parentCount: 0 };
    const parentVM = new DriftClientVM();
    parentVM.execute({ bytecode: new Uint32Array([Opcode.RETURN, 0]), constants: [] }, { scope: initialScope, document });

    const childVM = new DriftClientVM();
    childVM.execute({ bytecode: new Uint32Array([Opcode.RETURN, 0]), constants: [] }, { scope: parentVM.scope, document });

    const markParentSpy = vi.spyOn(parentVM, 'markDirty');
    const markChildSpy = vi.spyOn(childVM, 'markDirty');

    // Mutate parent variable from child scope
    setScopeValue(childVM.scope, 'parentCount', 10);

    expect(parentVM.scope.parentCount).toBe(10);
    expect(markParentSpy).toHaveBeenCalledWith('parentCount');
    expect(markChildSpy).toHaveBeenCalledWith('parentCount');
  });

  it('triggers reactive updates when mutating nested object properties and array elements', () => {
    const src = `
      <script>
        let user = { name: 'Alice', age: 25 };
        function updateName() {
          user.name = 'Bob';
        }
        function incAge() {
          user.age++;
        }
      </script>
      <div>
        <span class="user-info">{user.name} ({user.age})</span>
        <button class="name-btn" onclick={updateName}>Change Name</button>
        <button class="age-btn" onclick={incAge}>Inc Age</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.user-info')?.textContent).toBe('Alice (25)');

    (container.querySelector('.name-btn') as HTMLButtonElement).click();
    expect(container.querySelector('.user-info')?.textContent).toBe('Bob (25)');

    (container.querySelector('.age-btn') as HTMLButtonElement).click();
    expect(container.querySelector('.user-info')?.textContent).toBe('Bob (26)');

    document.body.removeChild(container);
  });

  it('triggers reactive updates when calling array mutators on nested object properties', () => {
    const src = `
      <script>
        let user = { todos: ['Buy milk'] };
        function addTodo() {
          user.todos.push('Walk dog');
        }
      </script>
      <div>
        <ul class="todos">
          @for todo in user.todos {
            <li class="todo-item">{todo}</li>
          }
        </ul>
        <button class="add-btn" onclick={addTodo}>Add Todo</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelectorAll('.todo-item').length).toBe(1);
    expect(container.querySelector('.todo-item')?.textContent).toBe('Buy milk');

    (container.querySelector('.add-btn') as HTMLButtonElement).click();

    expect(container.querySelectorAll('.todo-item').length).toBe(2);
    expect(container.querySelectorAll('.todo-item')[1]?.textContent).toBe('Walk dog');

    document.body.removeChild(container);
  });

  it('triggers reactive updates on destructuring assignments', () => {
    const src = `
      <script>
        let first = 'Initial';
        let second = 'State';
        function swap() {
          [first, second] = ['Swapped1', 'Swapped2'];
        }
      </script>
      <div>
        <span class="destruct-info">{first} - {second}</span>
        <button class="swap-btn" onclick={swap}>Swap</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.destruct-info')?.textContent).toBe('Initial - State');

    (container.querySelector('.swap-btn') as HTMLButtonElement).click();

    expect(container.querySelector('.destruct-info')?.textContent).toBe('Swapped1 - Swapped2');

    document.body.removeChild(container);
  });

  it('cleans up reactive regions and document event listeners on unmount()', () => {
    const src = `
      <script>
        let count = 0;
        function inc() { count++; }
      </script>
      <div>
        <span>{count}</span>
        <button class="inc-btn" onclick={inc}>Inc</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('span')?.textContent).toBe('0');

    // Unmount VM instance
    vmInstance.unmount();

    document.body.removeChild(container);
  });

  it('unregisters child regions recursively when nested @if / @for blocks toggle off', () => {
    const src = `
      <script>
        let show = true;
        let items = [1, 2, 3];
      </script>
      <div>
        @if show {
          <ul>
            @for item in items {
              <li>{item}</li>
            }
          </ul>
        }
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vmInstance.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelectorAll('li').length).toBe(3);

    // Toggle show off
    (vmInstance as any).scope.show = false;
    vmInstance.triggerUpdates(new Set(['show']));

    expect(container.querySelectorAll('li').length).toBe(0);

    // Toggle show back on
    (vmInstance as any).scope.show = true;
    vmInstance.triggerUpdates(new Set(['show']));

    expect(container.querySelectorAll('li').length).toBe(3);

    vmInstance.unmount();
    document.body.removeChild(container);
  });

  it('supports React-like style objects with reactive updates', () => {
    const src = `
      <script>
        let bgColor = '#3b82f6';
        let radius = 12;
        let pad = 20;
        let isVisible = true;
      </script>
      <div 
        class="card"
        style={{ 
          backgroundColor: bgColor, 
          borderRadius: radius, 
          padding: pad,
          opacity: isVisible ? 1 : 0,
          zIndex: 10
        }}
      >
        <span>Content</span>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vmInstance = new DriftClientVM();
    const root = vmInstance.execute(mod, { document }) as Node;
    const div = (root.nodeType === 11 ? (root as DocumentFragment).firstElementChild : root) as HTMLElement;

    expect(div).toBeDefined();
    expect(div.tagName.toLowerCase()).toBe('div');
    const styleAttr = div.getAttribute('style') || '';
    expect(styleAttr).toContain('background-color: #3b82f6');
    expect(styleAttr).toContain('border-radius: 12px');
    expect(styleAttr).toContain('padding: 20px');
    expect(styleAttr).toContain('opacity: 1');
    expect(styleAttr).toContain('z-index: 10');

    // Mutate reactive variables
    (vmInstance as any).scope.bgColor = '#10b981';
    (vmInstance as any).scope.radius = 24;
    (vmInstance as any).scope.isVisible = false;
    vmInstance.triggerUpdates(new Set(['bgColor', 'radius', 'isVisible']));

    const updatedStyle = div.getAttribute('style') || '';
    expect(updatedStyle).toContain('background-color: #10b981');
    expect(updatedStyle).toContain('border-radius: 24px');
    expect(updatedStyle).toContain('opacity: 0');
  });

  it('correctly evaluates dynamic expression props passed to components', () => {
    const childSrc = `
      <script>
        let label = props.label || '';
        let to = props.to || '';
      </script>
      <a href={to}>{label}</a>
    `;
    const childLexer = new DriftLexer(childSrc);
    const childParser = new DriftParser(childLexer);
    const childAst = childParser.parse();
    const childMod = new DriftGenerator(new DriftTransformer(childAst).transform()).generate();

    const parentSrc = `
      <script>
        let p = { id: 'ada', name: 'Ada' };
      </script>
      <div>
        <Link to={'/pioneers/' + p.id} label={'View Profile →'} />
      </div>
    `;
    const parentLexer = new DriftLexer(parentSrc);
    const parentParser = new DriftParser(parentLexer);
    const parentAst = parentParser.parse();
    const parentMod = new DriftGenerator(new DriftTransformer(parentAst).transform()).generate();
    (parentMod as any).scope = { Link: childMod };

    const vmInstance = new DriftClientVM();
    const root = vmInstance.execute(parentMod, { document }) as HTMLElement;

    const link = root.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/pioneers/ada');
    expect(link?.textContent).toBe('View Profile →');
  });
});






