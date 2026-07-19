import { describe, it, expect } from 'vitest';
import { DriftJSVM, mountApp } from '../src/vm/index.js';
import { parseTemplate } from '../src/parser/index.js';
import { compile } from '../src/compiler/index.js';

/**
 * Lightweight DOM mock for node testing environment without external dependencies.
 */
class MockDOMNode {
  public nodeValue: string | null = null;
  public children: MockDOMNode[] = [];
  public attributes: Record<string, string> = {};
  public parentNode: MockDOMNode | null = null;
  public __vm_idx?: number;
  private listeners: Record<string, Function[]> = {};

  constructor(public tagName?: string) {}

  public appendChild(child: MockDOMNode) {
    child.parentNode = this;
    this.children.push(child);
  }

  public setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  public getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  public addEventListener(type: string, fn: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]!.push(fn);
  }

  public removeEventListener(type: string, fn: Function) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type]!.filter(l => l !== fn);
    }
  }

  public get innerHTML(): string {
    if (this.nodeValue !== null) return this.nodeValue;
    return this.children
      .map(c => {
        if (c.tagName) {
          const content = c.innerHTML;
          return `<${c.tagName}>${content}</${c.tagName}>`;
        }
        return c.nodeValue ?? '';
      })
      .join('');
  }

  public set innerHTML(val: string) {
    if (val === '') {
      this.children = [];
    }
  }
}

// Set global document mock if running in Node environment without DOM
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement(tag: string) {
      return new MockDOMNode(tag);
    },
    createTextNode(text: string) {
      const node = new MockDOMNode();
      node.nodeValue = text;
      return node;
    }
  };
}

describe('DriftJSVM', () => {
  describe('constructor input data passing', () => {
    it('should mount app when program and root element are passed in constructor', () => {
      const ast = parseTemplate('<div>Hello VM</div>');
      const program = compile(ast);
      const root = new MockDOMNode('div') as any;

      const vm = new DriftJSVM(program, root);
      vm.mount();

      expect(root.innerHTML).toBe('<div>Hello VM</div>');
      vm.unmount();
    });

    it('should mount app via mountApp convenience function', () => {
      const ast = parseTemplate('<p>App VM</p>');
      const program = compile(ast);
      const root = new MockDOMNode('div') as any;

      const vm = mountApp(program, root);

      expect(root.innerHTML).toBe('<p>App VM</p>');
      vm.unmount();
    });
  });
});
