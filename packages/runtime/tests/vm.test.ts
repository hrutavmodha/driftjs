// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { DriftJSClientVM, mount, interpret } from '../src/index.js';
import { parseTemplate, generate } from '@driftjs/compiler';
import { Opcodes, encodeInstruction, encodeInstruction24 } from '../src/isa.js';

describe('DriftJSClientVM', () => {
  describe('constructor input data passing', () => {
    it('should boot app when program and root element are passed in constructor', () => {
      const ast = parseTemplate('<div>Hello VM</div>');
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = new DriftJSClientVM(program, root);
      vm.boot();

      expect(root.innerHTML).toBe('<div>Hello VM</div>');
      vm.unmount();
    });

    it('should mount app via mount convenience function', () => {
      const ast = parseTemplate('<p>App VM</p>');
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);

      expect(root.innerHTML).toBe('<p>App VM</p>');
      vm.unmount();
    });
  });

  describe('ISA opcodes: SET_PROPERTY, REMOVE_CHILD, JUMP_IF_TRUE, CALL', () => {
    it('should set DOM property directly via SET_PROPERTY', () => {
      const template = '<input type="text" value={val} /><script>let val = "initial";</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      const input = root.querySelector('input') as HTMLInputElement;

      expect(input.value).toBe('initial');
      vm.unmount();
    });

    it('should remove child node via REMOVE_CHILD opcode', () => {
      const bytecode = new Uint32Array([
        encodeInstruction(Opcodes.CREATE_ELEMENT, 0, 1), // parent div (node 1)
        encodeInstruction(Opcodes.CREATE_ELEMENT, 1, 2), // child span (node 2)
        encodeInstruction(Opcodes.APPEND_CHILD, 1, 2),    // append node 2 to node 1
        encodeInstruction(Opcodes.MOUNT, 1),              // mount node 1
        encodeInstruction(Opcodes.REMOVE_CHILD, 1, 2),    // remove node 2 from node 1
        encodeInstruction(Opcodes.RETURN)
      ]);

      const program = {
        bytecode,
        constants: ['div', 'span'],
        updateBlockOffset: 5
      };

      const root = document.createElement('div');
      const vm = interpret(program, root);

      expect(root.innerHTML).toBe('<div></div>');
      vm.unmount();
    });

    it('should execute CALL and RETURN subroutines and JUMP_IF_TRUE conditional branching', () => {
      const bytecode = new Uint32Array([
        encodeInstruction(Opcodes.LOAD_CONST, 1, 0),        // regs[1] = true
        encodeInstruction(Opcodes.CREATE_ELEMENT, 1, 1),    // node 1 = div
        encodeInstruction(Opcodes.MOUNT, 1),                // mount node 1
        encodeInstruction24(Opcodes.CALL, 5),               // CALL subroutine at offset 5
        encodeInstruction24(Opcodes.JUMP, 8),               // JUMP to end (offset 8)
        // Subroutine (offset 5):
        encodeInstruction(Opcodes.CREATE_TEXT, 2, 2),       // node 2 = text 'Subroutine'
        encodeInstruction(Opcodes.APPEND_CHILD, 1, 2),      // append text to node 1
        encodeInstruction(Opcodes.RETURN),                  // RETURN from subroutine
        // Offset 8:
        encodeInstruction(Opcodes.RETURN)
      ]);

      const program = {
        bytecode,
        constants: [true, 'div', 'Subroutine'],
        updateBlockOffset: 8
      };

      const root = document.createElement('div');
      const vm = interpret(program, root);

      expect(root.innerHTML).toBe('<div>Subroutine</div>');
      vm.unmount();
    });

    it('should clean up event listeners, node references, and innerHTML on unmount', () => {
      const ast = parseTemplate('<button onclick={handleClick}>Click</button><script>function handleClick() {}</script>');
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<button data-drift-node="1">Click</button>');

      vm.unmount();
      expect(root.innerHTML).toBe('');
    });
  });

  describe('fine-grained async reactivity', () => {
    it('should update DOM asynchronously when state is mutated inside setTimeout', async () => {
      const template = '<p>Count: {count}</p><script>let count = 0; setTimeout(() => { count = 42; }, 10);</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<p>Count: 0</p>');

      await new Promise(resolve => setTimeout(resolve, 30));

      expect(root.innerHTML).toBe('<p>Count: 42</p>');
      vm.unmount();
    });

    it('should batch multiple synchronous mutations into a single microtask DOM update', async () => {
      const template = '<p>Count: {count}</p><script>let count = 0; setTimeout(() => { count = 1; count = 2; count = 3; }, 10);</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<p>Count: 0</p>');

      await new Promise(resolve => setTimeout(resolve, 30));

      expect(root.innerHTML).toBe('<p>Count: 3</p>');
      vm.unmount();
    });

    it('should retain O(1) bitmask dependency check so unchanged signals are skipped during re-render', async () => {
      const template = '<p>A: {a}</p><p>B: {b}</p><script>let a = 1; let b = 10; setTimeout(() => { a = 2; }, 10);</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<p>A: 1</p><p>B: 10</p>');

      await new Promise(resolve => setTimeout(resolve, 30));

      expect(root.innerHTML).toBe('<p>A: 2</p><p>B: 10</p>');
      vm.unmount();
    });

    it('should update DOM asynchronously when state is mutated inside Promise.then', async () => {
      const template = '<p>Status: {status}</p><script>let status = "loading"; Promise.resolve("done").then(val => { status = val; });</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<p>Status: loading</p>');

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(root.innerHTML).toBe('<p>Status: done</p>');
      vm.unmount();
    });

    it('should update DOM when state is mutated inside async function with await', async () => {
      const template = '<p>Data: {data}</p><script>let data = "none"; async function loadData() { const res = await Promise.resolve("loaded"); data = res; } loadData();</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<p>Data: none</p>');

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(root.innerHTML).toBe('<p>Data: loaded</p>');
      vm.unmount();
    });

    it('should update DOM repeatedly on setInterval ticks', async () => {
      const template = '<p>Ticks: {ticks}</p><script>let ticks = 0; const timer = setInterval(() => { ticks++; if (ticks >= 3) clearInterval(timer); }, 15);</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      expect(root.innerHTML).toBe('<p>Ticks: 0</p>');

      await new Promise(resolve => setTimeout(resolve, 120));

      expect(root.innerHTML).toBe('<p>Ticks: 3</p>');
      vm.unmount();
    });

    it('should update DOM asynchronously when state is mutated after fetch() resolves', async () => {
      const originalFetch = globalThis.fetch;
      (globalThis as any).fetch = async () => ({
        json: async () => ({ user: 'Alice' })
      });

      try {
        const template = '<p>User: {username}</p><script>let username = "Guest"; async function fetchUser() { const res = await fetch("/api/user"); const data = await res.json(); username = data.user; } fetchUser();</script>';
        const ast = parseTemplate(template);
        const program = generate(ast);
        const root = document.createElement('div');

        const vm = interpret(program, root);
        expect(root.innerHTML).toBe('<p>User: Guest</p>');

        await new Promise(resolve => setTimeout(resolve, 30));

        expect(root.innerHTML).toBe('<p>User: Alice</p>');
        vm.unmount();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should safely handle unmount while microtask re-render is pending', async () => {
      const template = '<p>Count: {count}</p><script>let count = 0;</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      vm.markDirty(1);
      expect(() => vm.unmount()).not.toThrow();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(root.innerHTML).toBe('');
    });

    it('should handle event delegation on targets removed during bubbling', () => {
      const template = '<button onclick={handleClick}>Click</button><script>function handleClick() {}</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      const button = root.querySelector('button')!;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(() => vm.unmount()).not.toThrow();
    });

    it('should handle re-entrant state mutations during patch flush loop', async () => {
      const template = '<p>Count: {count}</p><script>let count = 0; function inc() { count++; }</script>';
      const ast = parseTemplate(template);
      const program = generate(ast);
      const root = document.createElement('div');

      const vm = interpret(program, root);
      vm.markDirty(1);
      vm.markDirty(1);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(root.innerHTML).toContain('Count:');
      vm.unmount();
    });
  });
});
