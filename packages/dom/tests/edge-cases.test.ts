import { describe, it, expect, vi } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { Opcode, type CompiledModule } from '../types/index.js';
import { compile } from '../../compiler/src/index.js';

describe('DriftJS Runtime Edge Cases & Scope Fixes', () => {
  const doc = document;

  it('handles NewExpression and ForStatement in VM script execution', () => {
    const vm = new DriftClientVM();
    const scriptFn = {
      __drift_fn__: `(scope) => {
        let items = new Array(3);
        for (let i = 0; i < 3; i++) {
          items[i] = i * 10;
        }
        scope.items = items;
      }`,
    };

    const module: CompiledModule = {
      bytecode: [
        Opcode.EXEC_SCRIPT, 0,
        Opcode.RETURN, 1,
      ],
      constants: [scriptFn],
      declaredVars: ['items'],
    };

    vm.execute(module, { document: doc });
    expect(vm.scope['items']).toEqual([0, 10, 20]);
  });

  it('handles default parameter assignment and function scope writebacks', () => {
    const vm = new DriftClientVM();
    const scriptFn = {
      __drift_fn__: `(scope, declaredVars, setScopeValue) => {
        scope.rowId = 1;
        scope.buildItems = function(count = 5) {
          const result = new Array(count);
          for (let i = 0; i < count; i++) {
            result[i] = scope.rowId++;
          }
          return result;
        };
      }`,
    };

    const module: CompiledModule = {
      bytecode: [
        Opcode.EXEC_SCRIPT, 0,
        Opcode.RETURN, 1,
      ],
      constants: [scriptFn],
      declaredVars: ['rowId', 'buildItems'],
    };

    vm.execute(module, { document: doc });
    expect(vm.scope['rowId']).toBe(1);

    const items1 = vm.scope['buildItems']();
    expect(items1).toEqual([1, 2, 3, 4, 5]);
    expect(vm.scope['rowId']).toBe(6);

    const items2 = vm.scope['buildItems'](2);
    expect(items2).toEqual([6, 7]);
    expect(vm.scope['rowId']).toBe(8);
  });

  it('preserves TR node identity during row swap in REACTIVE_FOR list', () => {
    const vm = new DriftClientVM();

    const itemMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = tr
        Opcode.CREATE_ELEMENT, 1, 1, // r1 = td
        Opcode.INTERPOLATE_TEXT, 2, 2, // r2 = text(row.id)
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: [
        'tr', 'td',
        { __drift_fn__: '(scope) => scope.row.id' },
      ],
    };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = tbody
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 3, 4, 5, // parent=r0, iter=data, itemName='row', idxName=none, key=row.id, bodyMod, deps=['data']
        Opcode.RETURN, 0,
      ],
      constants: [
        'tbody',
        { __drift_fn__: '(scope) => scope.data' },
        'row',
        { __drift_fn__: '(scope) => scope.row.id' },
        itemMod,
        ['data'],
      ],
      declaredVars: ['data'],
    };

    const parentElem = vm.execute(module, {
      document: doc,
      scope: { data: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    }) as Element;

    const rowsBefore = Array.from(parentElem.querySelectorAll('tr'));
    const firstRowNode = rowsBefore[0]!;
    const secondRowNode = rowsBefore[1]!;
    const thirdRowNode = rowsBefore[2]!;

    expect(firstRowNode.textContent).toBe('1');
    expect(secondRowNode.textContent).toBe('2');
    expect(thirdRowNode.textContent).toBe('3');

    // Trigger row swap: swap index 0 and index 1
    vm.scope['data'] = [{ id: 2 }, { id: 1 }, { id: 3 }];
    vm.triggerUpdates(new Set(['data']));

    const rowsAfter = Array.from(parentElem.querySelectorAll('tr'));
    expect(rowsAfter.length).toBe(3);
    expect(rowsAfter[0]!.textContent).toBe('2');
    expect(rowsAfter[1]!.textContent).toBe('1');
    expect(rowsAfter[2]!.textContent).toBe('3');

    // TR nodes must be physically swapped in DOM, NOT recreated!
    expect(rowsAfter[0]).toBe(secondRowNode);
    expect(rowsAfter[1]).toBe(firstRowNode);
    expect(rowsAfter[2]).toBe(thirdRowNode);
  });

  it('fast-patches attributes in-place without rebuilding DOM when item data is unchanged', () => {
    const vm = new DriftClientVM();

    const itemMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = tr
        Opcode.SET_ATTR, 0, 1, 2, 1, // attr='class', val={selected === row.id ? 'danger' : ''}, isDynamic=1
        Opcode.RETURN, 0,
      ],
      constants: [
        'tr',
        'class',
        { __drift_fn__: '(scope) => (scope.selected === scope.row.id ? "danger" : "")' },
      ],
    };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = tbody
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 0xFF, 3, 4, // parent=r0, iter=data, itemName='row', bodyMod, deps=['data', 'selected']
        Opcode.RETURN, 0,
      ],
      constants: [
        'tbody',
        { __drift_fn__: '(scope) => scope.data' },
        'row',
        itemMod,
        ['data', 'selected'],
      ],
      declaredVars: ['data', 'selected'],
    };

    // Create 1,000 rows
    const data = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
    const parentElem = vm.execute(module, {
      document: doc,
      scope: { data, selected: null },
    }) as Element;

    const rowsBefore = Array.from(parentElem.querySelectorAll('tr'));
    expect(rowsBefore.length).toBe(1000);
    expect(rowsBefore[4]!.getAttribute('class')).toBe('');

    // Trigger row selection (select row id 5)
    vm.scope['selected'] = 5;
    vm.triggerUpdates(new Set(['selected']));

    const rowsAfter = Array.from(parentElem.querySelectorAll('tr'));
    expect(rowsAfter[4]!.getAttribute('class')).toBe('danger');
    expect(rowsAfter[0]!.getAttribute('class')).toBe('');

    // Verify all 1,000 TR elements maintain exact DOM node identity (zero node recreations)
    for (let i = 0; i < 1000; i++) {
      expect(rowsAfter[i]).toBe(rowsBefore[i]);
    }
  });

  it('correctly advances PC over CREATE_ELEMENT with props spec in patchItemAttributes without desynchronization', () => {
    const vm = new DriftClientVM();
    const elem = doc.createElement('div');
    elem.setAttribute('data-test', 'initial');

    const bodyMod: CompiledModule = {
      bytecode: [
        // MOUNT_COMPONENT with propsSpec (4 bytes: opcode + 3 operand bytes)
        Opcode.MOUNT_COMPONENT, 0, 0, 1,
        // Followed by SET_ATTR (5 bytes)
        Opcode.SET_ATTR, 0, 2, 3, 1,
        Opcode.RETURN, 0,
      ],
      constants: [
        'CustomDiv',
        { __drift_props__: true, foo: 'bar' },
        'data-test',
        { __drift_fn__: '(scope) => scope.updatedValue' },
      ],
      declaredVars: ['updatedValue'],
    };

    vm.patchItemAttributes(bodyMod, { updatedValue: 'patched' }, elem);
    expect(elem.getAttribute('data-test')).toBe('patched');
  });

  it('correctly unpacks array pattern destructuring in script block', () => {
    const vm = new DriftClientVM();
    const mod = compile(`
      <script>
        const [a, b, c = 'default_c', ...rest] = ['first', 'second', undefined, 'fourth', 'fifth'];
      </script>
      <div>{a}-{b}-{c}-{rest.join(',')}</div>
    `);

    const node = vm.execute(mod, { document: doc });
    expect(node).toBeDefined();
    expect(node!.textContent).toBe('first-second-default_c-fourth,fifth');
    expect(vm.scope['a']).toBe('first');
    expect(vm.scope['b']).toBe('second');
    expect(vm.scope['c']).toBe('default_c');
    expect(vm.scope['rest']).toEqual(['fourth', 'fifth']);
  });

  it('correctly executes functions with destructured params and rest arguments at runtime', () => {
    const vm = new DriftClientVM();
    const mod = compile(`
      <script>
        function formatUser({ name, role = 'admin' }, ...tags) {
          return name + ' (' + role + ') [' + tags.join(', ') + ']';
        }
        const calcSum = ([x, y = 10], ...more) => x + y + more.reduce((a, b) => a + b, 0);

        let userString = formatUser({ name: 'Alice' }, 'staff', 'core');
        let sumResult = calcSum([5], 20, 30);
      </script>
      <div>{userString} - {sumResult}</div>
    `);

    const node = vm.execute(mod, { document: doc });
    expect(node).toBeDefined();
    expect(node!.textContent).toBe('Alice (admin) [staff, core] - 65');
    expect(vm.scope['userString']).toBe('Alice (admin) [staff, core]');
    expect(vm.scope['sumResult']).toBe(65);
  });

  it('correctly executes try/catch/finally, throw, switch/case, and class declarations in script blocks', () => {
    const vm = new DriftClientVM();
    const mod = compile(`
      <script>
        class Evaluator {
          multiplier = 2;
          constructor(mult) {
            if (mult) this.multiplier = mult;
          }
          calc(type, val) {
            try {
              switch (type) {
                case 'double':
                  return val * this.multiplier;
                case 'triple':
                  return val * 3;
                default:
                  throw new Error('unknown type');
              }
            } catch (e) {
              return 'err: ' + e.message;
            }
          }
        }

        const ev = new Evaluator(4);
        let res1 = ev.calc('double', 5);
        let res2 = ev.calc('unknown', 0);
      </script>
      <div>{res1} - {res2}</div>
    `);

    const node = vm.execute(mod, { document: doc });
    expect(node).toBeDefined();
    expect(node!.textContent).toBe('20 - err: unknown type');
    expect(vm.scope['res1']).toBe(20);
    expect(vm.scope['res2']).toBe('err: unknown type');
  });

  it('renders all sibling elements in @default case of @switch when @default is the only case', () => {
    const vm = new DriftClientVM();
    const mod = compile(`
      <script>
        let role = "guest";
      </script>
      <div>
        @switch role {
          @default {
            <span>First</span>
            <span>Second</span>
            <span>Third</span>
          }
        }
      </div>
    `);

    const node = vm.execute(mod, { document: doc });
    expect(node).toBeDefined();
    const spans = (node as HTMLElement).querySelectorAll('span');
    expect(spans).toHaveLength(3);
    expect(spans[0]?.textContent).toBe('First');
    expect(spans[1]?.textContent).toBe('Second');
    expect(spans[2]?.textContent).toBe('Third');
  });

  it('handles keyed reconciliation when items produce 0 DOM nodes without TypeError', async () => {
    const vm = new DriftClientVM();
    const mod = compile(`
      <script>
        let items = [
          { id: 1, visible: true, text: 'Item 1' },
          { id: 2, visible: false, text: 'Item 2' },
          { id: 3, visible: true, text: 'Item 3' },
        ];
      </script>
      <ul>
        @for item in items key item.id {
          @if item.visible {
            <li>{item.text}</li>
          }
        }
      </ul>
    `);

    const node = vm.execute(mod, { document: doc }) as HTMLElement;
    expect(node).toBeDefined();
    expect(node.querySelectorAll('li')).toHaveLength(2);

    // Mutate items: add item 4 at front and reorder
    vm.scope['items'] = [
      { id: 4, visible: true, text: 'Item 4' },
      { id: 2, visible: false, text: 'Item 2' },
      { id: 1, visible: true, text: 'Item 1' },
      { id: 3, visible: true, text: 'Item 3' },
    ];
    vm.markDirty('items');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const lis = node.querySelectorAll('li');
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe('Item 4');
    expect(lis[1]?.textContent).toBe('Item 1');
    expect(lis[2]?.textContent).toBe('Item 3');
  });

  it('event delegation works across separate Document contexts (e.g. iframes)', () => {
    const doc1 = document;
    const doc2 = document.implementation.createHTMLDocument('iframe-doc');

    const fn1 = vi.fn();
    const fn2 = vi.fn();

    const comp1: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // button
        Opcode.SET_ATTR, 0, 1, 2, 0, // onclick
        Opcode.RETURN, 0,
      ],
      constants: ['button', 'onclick', fn1],
    };

    const comp2: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // button
        Opcode.SET_ATTR, 0, 1, 2, 0, // onclick
        Opcode.RETURN, 0,
      ],
      constants: ['button', 'onclick', fn2],
    };

    const vm1 = new DriftClientVM();
    const btn1 = vm1.execute(comp1, { document: doc1 }) as HTMLButtonElement;
    doc1.body.appendChild(btn1);

    const vm2 = new DriftClientVM();
    const btn2 = vm2.execute(comp2, { document: doc2 }) as HTMLButtonElement;
    doc2.body.appendChild(btn2);

    btn1.click();
    expect(fn1).toHaveBeenCalledTimes(1);

    btn2.click();
    expect(fn2).toHaveBeenCalledTimes(1);

    vm1.unmount();
    vm2.unmount();
    doc1.body.removeChild(btn1);
  });
});
