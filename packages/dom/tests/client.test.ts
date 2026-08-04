import { describe, it, expect, vi } from 'vitest';
import { DriftClientVM, mount } from '../src/index.js';
import { Opcode, CompiledModule } from '../types/index.js';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';

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
      constants: ['input', 'type', 'checkbox', 'data-id', { type: 'Identifier', name: 'id' }],
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
    const condExpr = { type: 'Identifier', name: 'isLoggedIn' };

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
    const condExpr = { type: 'Identifier', name: 'show' };

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
      constants: ['li', { type: 'Identifier', name: 'item' }],
      reactiveBindings: [],
    };
    const iterExpr = { type: 'Identifier', name: 'items' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 3, 4,
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
      constants: ['li', { type: 'Identifier', name: 'item' }],
      reactiveBindings: [],
    };
    const iterExpr = { type: 'Identifier', name: 'items' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 3, 4,
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
      constants: ['p', { type: 'Identifier', name: 'count' }],
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
    const scriptBody = [
      {
        type: 'VariableDeclaration', kind: 'let',
        declarations: [{ type: 'VariableDeclarator', id: { type: 'Identifier', name: 'count' }, init: { type: 'Literal', value: 0 } }],
      },
      {
        type: 'FunctionDeclaration',
        id: { type: 'Identifier', name: 'increment' },
        params: [],
        body: {
          type: 'BlockStatement',
          body: [{ type: 'ExpressionStatement', expression: { type: 'UpdateExpression', operator: '++', prefix: false, argument: { type: 'Identifier', name: 'count' } } }],
        },
      },
    ];
    const countExpr = { type: 'Identifier', name: 'count' };

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
});
