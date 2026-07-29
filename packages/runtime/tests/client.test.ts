import { describe, it, expect } from 'vitest';
import { DriftClientVirtualMachine, mount } from '../src/client/index.js';
import { Opcode, CompiledModule } from '../types/index.js';

describe('DriftClientVirtualMachine', () => {
  const vm = new DriftClientVirtualMachine();
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
    // Consequent sub-module: CREATE_FRAGMENT r0 → CREATE_ELEMENT r1,'span' → CREATE_TEXT r2,'User' → APPEND_CHILD → APPEND_CHILD → RETURN r0
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

    // Parent module: CREATE_FRAGMENT r0, REACTIVE_IF r0 condIdx=1 consIdx=2 altIdx=3 depsIdx=4, RETURN r0
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.REACTIVE_IF, 0, 1, 2, 3, 4,
        Opcode.RETURN, 0,
      ],
      constants: [null, condExpr, consMod, altMod, ['isLoggedIn']],
    };

    const userResult = new DriftClientVirtualMachine().execute(module, {
      document: doc,
      scope: { isLoggedIn: true },
    }) as DocumentFragment;

    // Fragment contains: <!--if--> <span>User</span> <!--/if-->
    const children = Array.from(userResult.childNodes);
    expect(children.length).toBe(3); // comment, span, comment
    expect(children[1]).toBeInstanceOf(HTMLSpanElement);
    expect((children[1] as HTMLSpanElement).textContent).toBe('User');

    const guestResult = new DriftClientVirtualMachine().execute(module, {
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

    const freshVm = new DriftClientVirtualMachine();
    const container = doc.createElement('div');
    const frag = freshVm.execute(module, { document: doc, scope: { show: true } }) as DocumentFragment;
    container.appendChild(frag);

    // Initially the <p> is there
    expect(container.querySelector('p')).not.toBeNull();

    // Toggle show=false and trigger update
    (freshVm as any).scope.show = false;
    freshVm.triggerUpdates(new Set(['show']));

    // After update the <p> should be gone (empty between anchors)
    expect(container.querySelector('p')).toBeNull();

    // Toggle back
    (freshVm as any).scope.show = true;
    freshVm.triggerUpdates(new Set(['show']));
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('renders REACTIVE_FOR: list items rendered between anchors', () => {
    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,       // r1 = <li>
        Opcode.INTERPOLATE_TEXT, 2, 1,     // r2 = text(item)
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
        Opcode.CREATE_ELEMENT, 0, 0,         // r0 = <ul>
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 3, 4,
        Opcode.RETURN, 0,
      ],
      constants: ['ul', iterExpr, 'item', bodyMod, ['items']],
    };

    const result = new DriftClientVirtualMachine().execute(module, {
      document: doc,
      scope: { items: ['Apple', 'Banana', 'Cherry'] },
    }) as HTMLUListElement;

    expect(result).toBeInstanceOf(HTMLUListElement);
    // ul contains: <!--for--> <li>Apple</li> <li>Banana</li> <li>Cherry</li> <!--/for-->
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

    const freshVm = new DriftClientVirtualMachine();
    const ul = freshVm.execute(module, {
      document: doc,
      scope: { items: ['Apple', 'Banana'] },
    }) as HTMLUListElement;

    expect(ul.querySelectorAll('li').length).toBe(2);

    // Add an item and trigger update
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
    const vm = new DriftClientVirtualMachine();
    // Bytecode for <p>{count}</p>
    // PC 0: CREATE_ELEMENT r0, 'p'
    // PC 3: INTERPOLATE_TEXT r1, expr (scope.count)
    // PC 6: APPEND_CHILD r0, r1
    // PC 9: RETURN r0
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
    const p = vm.execute(module, { document: doc, scope: initialScope }) as HTMLParagraphElement;
    expect(p.textContent).toBe('0');

    // Perform state update to count = 1 by jumping directly to PC 3 (INTERPOLATE_TEXT)
    const updatedScope = { count: 1 };
    vm.updateAt(3, module, { document: doc, scope: updatedScope });

    // The live DOM paragraph element updates in-place!
    expect(p.textContent).toBe('1');
  });

  it('EXEC_SCRIPT initialises scope from VariableDeclaration and FunctionDeclaration AST', () => {
    const vm = new DriftClientVirtualMachine();
    // Mirrors the compiled output of:
    //   <script>
    //     let count = 0;
    //     function increment() { count++; }
    //   </script>
    //   <p>{count}</p>
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
        Opcode.EXEC_SCRIPT, 0,          // PC 0: run scriptBody => initialises scope
        Opcode.CREATE_FRAGMENT, 1,      // PC 2
        Opcode.CREATE_ELEMENT, 2, 1,    // PC 4: r2 = createElement('p')
        Opcode.INTERPOLATE_TEXT, 3, 2,  // PC 7: r3 = text(count)
        Opcode.APPEND_CHILD, 2, 3,      // PC 10
        Opcode.APPEND_CHILD, 1, 2,      // PC 13
        Opcode.RETURN, 1,               // PC 16
      ],
      constants: [scriptBody, 'p', countExpr],
      reactiveBindings: [{ variable: 'count', positions: [{ pc: 7, opcode: Opcode.INTERPOLATE_TEXT }] }],
    };

    const frag = vm.execute(module, { document: doc }) as DocumentFragment;
    const p = frag.firstChild as HTMLParagraphElement;

    // count starts at 0
    expect(p.textContent).toBe('0');

    // Simulate what happens when increment() is wired to onclick and the button is clicked
    (vm as any).scope.increment();
    vm.triggerUpdates(new Set(['count']));

    expect((vm as any).scope.count).toBe(1);
    expect(p.textContent).toBe('1');
  });
});
