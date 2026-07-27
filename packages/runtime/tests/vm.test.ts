import { describe, it, expect } from 'vitest';
import { DriftClientVirtualMachine } from '../src/client/index.js';
import { Opcode, CompiledModule } from '../types/index.js';

class MockNode {
  public childNodes: MockNode[] = [];
  public parentNode: MockNode | null = null;
  public nodeType: number;
  public nodeName: string;
  public textContent: string = '';
  public attributes: Record<string, string> = {};

  constructor(nodeType: number, nodeName: string, textContent = '') {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.textContent = textContent;
  }

  public appendChild(child: MockNode): MockNode {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  public removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  public get tagName(): string {
    return this.nodeName.toLowerCase();
  }

  public get outerHTML(): string {
    if (this.nodeType === 3) {
      return this.textContent;
    }
    if (this.nodeType === 8) {
      return `<!--${this.textContent}-->`;
    }
    if (this.nodeType === 11) {
      return this.childNodes.map((c) => c.outerHTML).join('');
    }

    const attrsStr = Object.entries(this.attributes)
      .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
      .join('');

    const childrenStr = this.childNodes.map((c) => c.outerHTML).join('');
    return `<${this.tagName}${attrsStr}>${childrenStr}</${this.tagName}>`;
  }
}

function createMockDocument(): Document {
  return {
    createElement: (tag: string) => new MockNode(1, tag) as unknown as Element,
    createTextNode: (text: string) => new MockNode(3, '#text', text) as unknown as Text,
    createComment: (comment: string) => new MockNode(8, '#comment', comment) as unknown as Comment,
    createDocumentFragment: () => new MockNode(11, '#document-fragment') as unknown as DocumentFragment,
  } as unknown as Document;
}

describe('DriftClientVirtualMachine', () => {
  const doc = createMockDocument();
  const vm = new DriftClientVirtualMachine();

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

    const node = vm.execute(module, { document: doc }) as unknown as MockNode;
    expect(node).toBeDefined();
    expect(node.outerHTML).toBe('<h1>Hello World</h1>');
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
    }) as unknown as MockNode;

    expect(node.outerHTML).toBe('<input type="checkbox" data-id="42"></input>');
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
    }) as unknown as MockNode;

    expect(userResult.outerHTML).toBe('<span>User</span>');

    const guestResult = vm.execute(module, {
      document: doc,
      scope: { isLoggedIn: false },
    }) as unknown as MockNode;

    expect(guestResult.outerHTML).toBe('<span>Guest</span>');
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
    }) as unknown as MockNode;

    expect(result.outerHTML).toBe('<ul><li>Apple</li><li>Banana</li><li>Cherry</li></ul>');
  });
});
