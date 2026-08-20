import { describe, it, expect, vi } from 'vitest';
import { DriftClientVM, mount } from '../src/index.js';
import { Opcode, type CompiledModule } from '../types/index.js';
import { compile } from '../../compiler/src/index.js';

describe('DriftClientVM (DOM Engine) - Reproduction Test Cases for Identified Bugs', () => {
  // BUG-01: unmount() wipes global eventHandlersMap, disabling all event listeners across the entire app
  it('BUG-01 [Critical Correctness]: unmounting one VM instance does not disable event listeners on other active VM instances', () => {
    const doc = document;
    const container1 = doc.createElement('div');
    const container2 = doc.createElement('div');
    doc.body.appendChild(container1);
    doc.body.appendChild(container2);

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const comp1: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // button
        Opcode.SET_ATTR, 0, 1, 2, 0, // onclick
        Opcode.RETURN, 0,
      ],
      constants: ['button', 'onclick', handler1],
    };

    const comp2: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // button
        Opcode.SET_ATTR, 0, 1, 2, 0, // onclick
        Opcode.RETURN, 0,
      ],
      constants: ['button', 'onclick', handler2],
    };

    const vm1 = new DriftClientVM();
    const node1 = vm1.execute(comp1, { document: doc });
    container1.appendChild(node1!);

    const vm2 = new DriftClientVM();
    const node2 = vm2.execute(comp2, { document: doc });
    container2.appendChild(node2!);

    // Test that both handlers work initially
    const btn1 = container1.querySelector('button')!;
    const btn2 = container2.querySelector('button')!;

    btn1.click();
    expect(handler1).toHaveBeenCalledTimes(1);

    btn2.click();
    expect(handler2).toHaveBeenCalledTimes(1);

    // Now unmount VM1 (e.g. a component or modal closes)
    vm1.unmount();
    container1.removeChild(node1!);

    // Click on Button 2 on the still-active VM2
    btn2.click();

    // Expected true behavior: handler2 on active VM2 is called again (total: 2)
    // Buggy current behavior: unmount() wiped DriftClientVM.eventHandlersMap = new WeakMap(),
    // so handler2 is permanently lost and not called!
    expect(handler2).toHaveBeenCalledTimes(2);

    // Cleanup
    vm2.unmount();
    doc.body.removeChild(container1);
    doc.body.removeChild(container2);
  });

  // BUG-05: patchItemAttributes fails to update DOM properties (value, checked, selected, disabled)
  it('BUG-05 [Correctness]: patchItemAttributes updates input element "value" and "checked" DOM properties', () => {
    const doc = document;
    const vm = new DriftClientVM();

    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // input
        Opcode.SET_ATTR, 0, 1, 2, 1, // value = eval(item.text)
        Opcode.SET_ATTR, 0, 3, 4, 1, // checked = eval(item.done)
        Opcode.RETURN, 0,
      ],
      constants: [
        'input',
        'value',
        { __drift_fn__: '(scope) => scope.item.text' },
        'checked',
        { __drift_fn__: '(scope) => scope.item.done' },
      ],
    };

    const initialScope = { item: { text: 'Initial Text', done: false } };
    const inputNode = vm.execute(bodyMod, { document: doc, scope: initialScope }) as HTMLInputElement;

    expect(inputNode.value).toBe('Initial Text');
    expect(inputNode.checked).toBe(false);

    // Now user or state updates the item attributes via fast-path patchItemAttributes
    const updatedScope = { item: { text: 'Updated Text', done: true } };
    vm.patchItemAttributes(bodyMod, updatedScope, inputNode);

    // Expected true behavior: inputNode.value is updated to 'Updated Text' and checked is true
    // Buggy current behavior: only setAttribute('value', ...) is called, which does not update inputNode.value property
    expect(inputNode.value).toBe('Updated Text');
    expect(inputNode.checked).toBe(true);
  });

  // BUG-06: patchItemAttributes corrupts root list elements with child element attribute values
  it('BUG-06 [Correctness]: patchItemAttributes does not apply child element attributes onto the root element', () => {
    const doc = document;
    const vm = new DriftClientVM();

    // Template: <li class="row"><button class={item.btnClass}>Click</button></li>
    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = createElement('li')
        Opcode.SET_ATTR, 0, 1, 2, 0, // r0.setAttribute('class', 'row')
        Opcode.CREATE_ELEMENT, 1, 3, // r1 = createElement('button')
        Opcode.SET_ATTR, 1, 1, 4, 1, // r1.setAttribute('class', eval(item.btnClass))
        Opcode.APPEND_CHILD, 0, 1,   // r0.appendChild(r1)
        Opcode.RETURN, 0,
      ],
      constants: [
        'li',
        'class',
        'row',
        'button',
        { __drift_fn__: '(scope) => scope.item.btnClass' },
      ],
    };

    const scope = { item: { btnClass: 'btn-danger' } };
    const rootLi = vm.execute(bodyMod, { document: doc, scope }) as HTMLLIElement;

    expect(rootLi.className).toBe('row');
    const btn = rootLi.querySelector('button')!;
    expect(btn.className).toBe('btn-danger');

    // Run patchItemAttributes with new button class
    const updatedScope = { item: { btnClass: 'btn-success' } };
    vm.patchItemAttributes(bodyMod, updatedScope, rootLi);

    // Expected true behavior: rootLi keeps class="row", button gets class="btn-success"
    // Buggy current behavior: patchItemAttributes applies all SET_ATTR opcodes to rootLi,
    // overwriting rootLi.className to 'btn-success'!
    expect(rootLi.className).toBe('row');
  });

  // BUG-16: Non-bubbling events (focus, blur) are captured by event delegation
  it('BUG-16 [Correctness]: event delegation captures non-bubbling events like "focus" and "blur"', () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const onFocus = vi.fn();
    const comp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // input
        Opcode.SET_ATTR, 0, 1, 2, 0, // onfocus
        Opcode.RETURN, 0,
      ],
      constants: ['input', 'onfocus', onFocus],
    };

    const vm = new DriftClientVM();
    const input = vm.execute(comp, { document: doc }) as HTMLInputElement;
    container.appendChild(input);

    // Dispatch focus event (focus does not bubble by default in DOM)
    input.dispatchEvent(new Event('focus', { bubbles: false }));

    // Expected true behavior: onFocus handler is called
    // Buggy current behavior: event listener on document is added with useCapture: false, so non-bubbling focus event never reaches it
    expect(onFocus).toHaveBeenCalled();

    vm.unmount();
    doc.body.removeChild(container);
  });
});
