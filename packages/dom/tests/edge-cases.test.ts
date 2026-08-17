import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { Opcode, type CompiledModule } from '../types/index.js';

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
        Opcode.REACTIVE_FOR, 0, 1, 2, 0xFF, 0xFF, 3, 4, // parent=r0, iter=data, itemName='row', bodyMod, deps=['data']
        Opcode.RETURN, 0,
      ],
      constants: [
        'tbody',
        { __drift_fn__: '(scope) => scope.data' },
        'row',
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
});
