import { describe, it, expect, vi } from 'vitest';
import { DriftClientVM, mount } from '../src/index.js';
import { HydrationCursor } from '../src/hydration.js';
import { Opcode, type CompiledModule } from '../types/index.js';
import { compile } from '../../compiler/src/index.js';

describe('DriftClientVM (DOM Engine) - Reproduction Test Cases', () => {
  it('unmounting one VM instance does not disable event listeners on other active VM instances', () => {
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

    const btn1 = container1.querySelector('button')!;
    const btn2 = container2.querySelector('button')!;

    btn1.click();
    expect(handler1).toHaveBeenCalledTimes(1);

    btn2.click();
    expect(handler2).toHaveBeenCalledTimes(1);

    vm1.unmount();
    container1.removeChild(node1!);

    btn2.click();
    expect(handler2).toHaveBeenCalledTimes(2);

    vm2.unmount();
    doc.body.removeChild(container1);
    doc.body.removeChild(container2);
  });

  it('patchItemAttributes updates input element "value" and "checked" DOM properties', () => {
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

    const updatedScope = { item: { text: 'Updated Text', done: true } };
    vm.patchItemAttributes(bodyMod, updatedScope, inputNode);

    expect(inputNode.value).toBe('Updated Text');
    expect(inputNode.checked).toBe(true);
  });

  it('patchItemAttributes does not apply child element attributes onto the root element', () => {
    const doc = document;
    const vm = new DriftClientVM();

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

    const updatedScope = { item: { btnClass: 'btn-success' } };
    vm.patchItemAttributes(bodyMod, updatedScope, rootLi);

    expect(rootLi.className).toBe('row');
  });

  it('event delegation captures non-bubbling events like "focus" and "blur"', () => {
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

    input.dispatchEvent(new Event('focus', { bubbles: false }));
    expect(onFocus).toHaveBeenCalled();

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('child VM returning DocumentFragment is unmounted when parent unmounts subtree', () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const unmountCb = vi.fn();

    const childComp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0, // p
        Opcode.CREATE_ELEMENT, 2, 1, // span
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.APPEND_CHILD, 0, 2,
        Opcode.RETURN, 0,
      ],
      constants: ['p', 'span'],
    };

    const parentComp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // div
        Opcode.MOUNT_COMPONENT, 1, 1, 0xFF, // ChildComp
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['div', 'ChildComp'],
      scope: { ChildComp: childComp },
    };

    const parentVM = new DriftClientVM();
    const parentNode = parentVM.execute(parentComp, { document: doc }) as HTMLElement;
    container.appendChild(parentNode);

    const childEntry = (parentVM as any).mountedChildVMs.values().next().value;
    expect(childEntry).toBeDefined();
    childEntry.unmountCallbacks.push(unmountCb);

    parentVM.unmountSubtree(parentNode);

    expect(unmountCb).toHaveBeenCalledTimes(1);

    parentVM.unmount();
    doc.body.removeChild(container);
  });

  it('updates text interpolations depending on index when list is reordered', async () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const template = `
      <script>
        let items = [{ id: 'a', name: 'Item A' }, { id: 'b', name: 'Item B' }];
      </script>
      <ul>
        @for (item, idx) in items key item.id {
          <li>#{idx}: {item.name}</li>
        }
      </ul>
    `;

    const compiled = compile(template);
    const vm = new DriftClientVM();
    const node = vm.execute(compiled, { document: doc }) as HTMLElement;
    container.appendChild(node);

    const lisInitial = container.querySelectorAll('li');
    expect(lisInitial[0]?.textContent).toBe('#0: Item A');
    expect(lisInitial[1]?.textContent).toBe('#1: Item B');

    vm.scope.items = [{ id: 'b', name: 'Item B' }, { id: 'a', name: 'Item A' }];
    vm.markDirty('items');
    await new Promise((r) => setTimeout(r, 10));

    const lisUpdated = container.querySelectorAll('li');
    expect(lisUpdated[0]?.textContent).toBe('#0: Item B');
    expect(lisUpdated[1]?.textContent).toBe('#1: Item A');

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('event handler receives target DOM element as "this" context', () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    let capturedThis: any = null;

    const handler = function (this: any, e: Event) {
      capturedThis = this;
    };

    const comp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // button
        Opcode.SET_ATTR, 0, 1, 2, 0, // onclick
        Opcode.RETURN, 0,
      ],
      constants: ['button', 'onclick', handler],
    };

    const vm = new DriftClientVM();
    const btn = vm.execute(comp, { document: doc }) as HTMLButtonElement;
    container.appendChild(btn);

    btn.click();

    expect(capturedThis).toBe(btn);

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('delegated event listener supports event bubbling through ancestor handlers', () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const parentHandler = vi.fn();
    const childHandler = vi.fn();

    const template = `
      <div id="parent" onclick={onParentClick}>
        <button id="child" onclick={onChildClick}>Click Me</button>
      </div>
    `;

    const compiled = compile(template);
    const vm = new DriftClientVM();
    const node = vm.execute(compiled, {
      document: doc,
      scope: { onParentClick: parentHandler, onChildClick: childHandler },
    }) as HTMLElement;
    container.appendChild(node);

    const childBtn = container.querySelector('#child') as HTMLButtonElement;
    childBtn.click();

    expect(childHandler).toHaveBeenCalledTimes(1);
    expect(parentHandler).toHaveBeenCalledTimes(1);

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('fast-path row re-render updates event handlers on reused root element', async () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    let clickedItem: any = null;

    const template = `
      <script>
        let items = [{ id: 1, text: 'Old Text' }];
        let clickedItem = null;
        function handleItemClick(it) {
          clickedItem = it.text;
        }
      </script>
      <ul>
        @for item in items key item.id {
          <li onclick={() => handleItemClick(item)}>{item.text}</li>
        }
      </ul>
    `;

    const compiled = compile(template);
    const vm = new DriftClientVM();
    const node = vm.execute(compiled, { document: doc }) as HTMLElement;
    container.appendChild(node);

    const li = container.querySelector('li') as HTMLLIElement;
    li.click();
    expect(vm.scope.clickedItem).toBe('Old Text');

    // Update item text in place (same key, mutated object)
    vm.scope.items = [{ id: 1, text: 'New Text' }];
    vm.markDirty('items');
    await new Promise((r) => setTimeout(r, 10));

    const updatedLi = container.querySelector('li') as HTMLLIElement;
    updatedLi.click();
    expect(vm.scope.clickedItem).toBe('New Text');

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('markDirty on unmounted VM does not schedule microtasks or flush updates', async () => {
    const vm = new DriftClientVM();
    const flushSpy = vi.spyOn(vm as any, 'flushUpdates');
    vm.unmount();

    vm.markDirty('someVar');
    await new Promise((r) => setTimeout(r, 10));

    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('HydrationCursor matches comment content before claiming comment anchor', () => {
    const doc = document;
    const container = doc.createElement('div');
    const devComment = doc.createComment(' Section Description ');
    const ifStart = doc.createComment('if');
    const span = doc.createElement('span');
    span.textContent = 'Hello';
    const ifEnd = doc.createComment('/if');

    container.appendChild(devComment);
    container.appendChild(ifStart);
    container.appendChild(span);
    container.appendChild(ifEnd);

    const cursor = new HydrationCursor(container, doc);

    const claimedIf = cursor.claimComment('if', doc);
    expect(claimedIf.data.trim()).toBe('if');
  });

  it('patchItemAttributes targets correct DOM element when sibling elements are preceded by comment boundaries', () => {
    const doc = document;
    const vm = new DriftClientVM();

    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // div
        Opcode.CREATE_COMMENT, 1, 1, // comment
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.CREATE_ELEMENT, 2, 2, // button
        Opcode.SET_ATTR, 2, 3, 4, 1, // class = eval(item.btnClass)
        Opcode.APPEND_CHILD, 0, 2,
        Opcode.RETURN, 0,
      ],
      constants: [
        'div',
        'section-divider',
        'button',
        'class',
        { __drift_fn__: '(scope) => scope.item.btnClass' },
      ],
    };

    const initialScope = { item: { btnClass: 'btn-primary' } };
    const rootElem = vm.execute(bodyMod, { document: doc, scope: initialScope }) as HTMLElement;

    const btn = rootElem.querySelector('button')!;
    expect(btn.getAttribute('class')).toBe('btn-primary');

    const updatedScope = { item: { btnClass: 'btn-danger' } };
    vm.patchItemAttributes(bodyMod, updatedScope, rootElem);

    expect(btn.getAttribute('class')).toBe('btn-danger');
  });

  it('patchItemAttributes updates attributes across multi-root sibling elements', () => {
    const doc = document;
    const vm = new DriftClientVM();

    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0, // dt
        Opcode.SET_ATTR, 1, 1, 2, 1, // class = eval(item.dtClass)
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.CREATE_ELEMENT, 2, 3, // dd
        Opcode.SET_ATTR, 2, 1, 4, 1, // class = eval(item.ddClass)
        Opcode.APPEND_CHILD, 0, 2,
        Opcode.RETURN, 0,
      ],
      constants: [
        'dt',
        'class',
        { __drift_fn__: '(scope) => scope.item.dtClass' },
        'dd',
        { __drift_fn__: '(scope) => scope.item.ddClass' },
      ],
    };

    const initialScope = { item: { dtClass: 'dt-1', ddClass: 'dd-1' } };
    const frag = vm.execute(bodyMod, { document: doc, scope: initialScope }) as DocumentFragment;
    const nodes = Array.from(frag.childNodes);

    expect((nodes[0] as HTMLElement).className).toBe('dt-1');
    expect((nodes[1] as HTMLElement).className).toBe('dd-1');

    const updatedScope = { item: { dtClass: 'dt-updated', ddClass: 'dd-updated' } };
    vm.patchItemAttributes(bodyMod, updatedScope, nodes);

    expect((nodes[0] as HTMLElement).className).toBe('dt-updated');
    expect((nodes[1] as HTMLElement).className).toBe('dd-updated');
  });

  it('updateChildComponentProps unsets removed parent props on child scope', () => {
    const vm = new DriftClientVM();
    const childVM = new DriftClientVM();
    const triggerSpy = vi.spyOn(childVM, 'triggerUpdates');

    const childScope: Record<string, any> = {
      props: { title: 'Initial', disabled: true },
      title: 'Initial',
      disabled: true,
    };

    const newProps = { title: 'Updated' }; // disabled prop is omitted/removed
    (vm as any).updateChildComponentProps(childScope, childVM, newProps);

    expect(childScope.props.title).toBe('Updated');
    expect(childScope.title).toBe('Updated');
    expect(childScope.disabled).toBeUndefined();
    expect(triggerSpy).toHaveBeenCalled();
    const passedDirtyVars = triggerSpy.mock.calls[0]![0] as Set<string>;
    expect(passedDirtyVars.has('disabled')).toBe(true);
    expect(passedDirtyVars.has('title')).toBe(true);
  });

  it('preserves boolean false on aria-* and data-* attributes on client DOM', () => {
    const doc = document;
    const vm = new DriftClientVM();

    const comp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.SET_ATTR, 0, 1, 2, 1, // aria-hidden={false}
        Opcode.SET_ATTR, 0, 3, 4, 1, // data-active={false}
        Opcode.SET_ATTR, 0, 5, 6, 1, // disabled={false}
        Opcode.RETURN, 0,
      ],
      constants: [
        'div',
        'aria-hidden',
        { __drift_fn__: '() => false' },
        'data-active',
        { __drift_fn__: '() => false' },
        'disabled',
        { __drift_fn__: '() => false' },
      ],
    };

    const elem = vm.execute(comp, { document: doc }) as HTMLElement;
    expect(elem.getAttribute('aria-hidden')).toBe('false');
    expect(elem.getAttribute('data-active')).toBe('false');
    expect(elem.hasAttribute('disabled')).toBe(false);
  });

  it('event handler scope snapshotting does not trigger false positive updates for prototype-inherited variables', () => {
    const doc = document;
    const vm = new DriftClientVM();
    const triggerSpy = vi.spyOn(vm, 'triggerUpdates');

    const parentScope = { parentCount: 10 };
    const childScope = Object.create(parentScope);

    const comp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.SET_ATTR, 0, 1, 2, 0, // onclick
        Opcode.RETURN, 0,
      ],
      constants: [
        'button',
        'click',
        () => {
          // No-op event handler that does not modify state
        },
      ],
      declaredVars: ['parentCount'],
    };

    const elem = vm.execute(comp, { document: doc, scope: childScope }) as HTMLElement;
    doc.body.appendChild(elem);

    elem.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Because parentCount on prototype was not changed, triggerUpdates should not be called with parentCount
    expect(triggerSpy).not.toHaveBeenCalled();
    vm.unmount();
    if (elem.parentNode) elem.parentNode.removeChild(elem);
  });

  it('mount() returns DriftClientVM instance allowing clean unmounting', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const comp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0,
        Opcode.RETURN, 0,
      ],
      constants: ['span'],
    };

    const initialActiveCount = DriftClientVM.activeVMCount;
    const mountedVM = mount(comp, container);
    expect(mountedVM).toBeInstanceOf(DriftClientVM);
    expect(container.querySelector('span')).not.toBeNull();
    expect(DriftClientVM.activeVMCount).toBe(initialActiveCount + 1);

    const unmountSpy = vi.fn();
    mountedVM.unmountCallbacks.push(unmountSpy);

    mountedVM.unmount();
    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(DriftClientVM.activeVMCount).toBe(initialActiveCount);

    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it('dynamic event handler updating to null or undefined detaches listener (BUG-007)', () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const handler = vi.fn();
    const vm = new DriftClientVM();

    const comp: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // button
        Opcode.SET_ATTR, 0, 1, 2, 1, // onclick = eval(handleClick)
        Opcode.RETURN, 0,
      ],
      constants: [
        'button',
        'onclick',
        { __drift_fn__: '(scope) => scope.handleClick' },
      ],
      reactiveBindings: [
        { variable: 'handleClick', positions: [{ opcode: Opcode.SET_ATTR, pc: 3 }] },
      ],
      declaredVars: ['handleClick'],
    };

    const node = vm.execute(comp, { document: doc, scope: { handleClick: handler } }) as HTMLButtonElement;
    container.appendChild(node);

    node.click();
    expect(handler).toHaveBeenCalledTimes(1);

    // Update handleClick to null
    vm.scope.handleClick = null;
    (vm as any).updateAt(3, comp, { scope: vm.scope });

    node.click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(node.getAttribute('onclick')).toBeNull();

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('unmountSubtree unregisters reactive regions anchored inside the unmounted element (BUG-008)', () => {
    const doc = document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    const template = `
      <script>
        let show = true;
      </script>
      <div id="sub-wrapper">
        @if (show) {
          <span>Visible</span>
        }
      </div>
    `;

    const compiled = compile(template);
    const vm = new DriftClientVM();
    const node = vm.execute(compiled, { document: doc }) as HTMLElement;
    container.appendChild(node);

    expect((vm as any).reactiveRegions.size).toBeGreaterThan(0);

    const wrapper = container.querySelector('#sub-wrapper')!;
    vm.unmountSubtree(wrapper);

    expect((vm as any).reactiveRegions.size).toBe(0);

    vm.unmount();
    doc.body.removeChild(container);
  });

  it('HydrationCursor lookahead preserves intermediate nodes on mismatch without discarding comments (BUG-010)', async () => {
    const doc = document;
    const container = doc.createElement('div');
    // Simulated SSR DOM with whitespace text node before comment delimiter
    container.innerHTML = '<div>  <!--if--><span>Hydrated</span><!--/if--></div>';
    doc.body.appendChild(container);

    const { HydrationCursor } = await import('../src/hydration.js');
    const cursor = new HydrationCursor(container, doc);

    const el = cursor.claimElement('div', doc);
    expect(el.tagName.toLowerCase()).toBe('div');

    const comment = cursor.claimComment('if', doc);
    expect(comment.data.trim()).toBe('if');

    const span = cursor.claimElement('span', doc);
    expect(span.tagName.toLowerCase()).toBe('span');

    const endComment = cursor.claimComment('/if', doc);
    expect(endComment.data.trim()).toBe('/if');

    doc.body.removeChild(container);
  });
});

