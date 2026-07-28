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

  it('renders conditional branches accurately', () => {
    // Compiled module for: @if isLoggedIn { <span>User</span> } @else { <span>Guest</span> }
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,              // r0 = fragment
        Opcode.EVAL_EXPR, 1, 0,                 // r1 = scope.isLoggedIn
        Opcode.JUMP_IF_FALSE, 1, 0, 24,         // if (!r1) jump to 24 (@else)
        Opcode.CREATE_ELEMENT, 2, 1,            // r2 = createElement('span')
        Opcode.CREATE_TEXT, 3, 2,               // r3 = createTextNode('User')
        Opcode.APPEND_CHILD, 2, 3,
        Opcode.APPEND_CHILD, 0, 2,
        Opcode.JUMP, 0, 36,                     // jump to end (RETURN at byte 36)
        Opcode.CREATE_ELEMENT, 4, 1,            // r4 = createElement('span')
        Opcode.CREATE_TEXT, 5, 3,               // r5 = createTextNode('Guest')
        Opcode.APPEND_CHILD, 4, 5,
        Opcode.APPEND_CHILD, 0, 4,
        Opcode.RETURN, 0,
      ],
      constants: ['isLoggedIn', 'span', 'User', 'Guest'],
    };

    const userResult = vm.execute(module, {
      document: doc,
      scope: { isLoggedIn: true },
    })!;

    expect(userResult).toBeInstanceOf(DocumentFragment);
    expect(userResult.childNodes.length).toBe(1);
    expect(userResult.firstChild).toBeInstanceOf(HTMLSpanElement);
    expect(userResult.textContent).toBe('User');

    const guestResult = vm.execute(module, {
      document: doc,
      scope: { isLoggedIn: false },
    })!;

    expect(guestResult).toBeInstanceOf(DocumentFragment);
    expect(guestResult.childNodes.length).toBe(1);
    expect(guestResult.firstChild).toBeInstanceOf(HTMLSpanElement);
    expect(guestResult.textContent).toBe('Guest');
  });

  it('renders @for loops over arrays', () => {
    // Compiled module for: <ul> @for (item, index) in list { <li>{item}</li> } </ul>
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,                                // r0 = createElement('ul')
        Opcode.EVAL_EXPR, 1, 1,                                    // r1 = scope.list
        Opcode.LOOP_ITER, 1, 2, 3, 0, 2, 0, 3, 0, 31,             // LOOP_ITER arrayReg=1, itemReg=2, indexReg=3, itemConst=2, indexConst=3, jump=31 (RETURN)
        Opcode.CREATE_ELEMENT, 4, 4,                                // r4 = createElement('li')
        Opcode.INTERPOLATE_TEXT, 5, 2,                             // r5 = text(item)
        Opcode.APPEND_CHILD, 4, 5,
        Opcode.APPEND_CHILD, 0, 4,
        Opcode.JUMP, 0, 6,                                         // jump back to LOOP_ITER
        Opcode.RETURN, 0,
      ],
      constants: ['ul', 'list', 'item', 'index', 'li'],
    };

    const result = vm.execute(module, {
      document: doc,
      scope: { list: ['Apple', 'Banana', 'Cherry'] },
    }) as HTMLUListElement;

    expect(result).toBeInstanceOf(HTMLUListElement);
    expect(result.children.length).toBe(3);
    expect(result?.children?.[0]?.textContent).toBe('Apple');
    expect(result?.children?.[1]?.textContent).toBe('Banana');
    expect(result?.children?.[2]?.textContent).toBe('Cherry');
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
});

