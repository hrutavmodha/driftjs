import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { Opcode } from '../types/index.js';
import { executeBlockStatement } from '@driftjs/utils';

describe('DriftClientVM – Zero-Proxy Async Reactivity & Microtask Batching', () => {
  it('updates DOM reactively when state changes inside an async function (async/await)', async () => {
    const mod = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.INTERPOLATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          type: 'VariableDeclaration',
          declarations: [
            { id: { type: 'Identifier', name: 'status' }, init: { type: 'Literal', value: 'idle' } },
          ],
        },
        'span',
        { type: 'Identifier', name: 'status' },
      ],
      reactiveBindings: [
        { variable: 'status', positions: [{ opcode: Opcode.INTERPOLATE_TEXT, pc: 5 }] },
      ],
      declaredVars: ['status'],
      scope: {},
    };

    const vm = new DriftClientVM();
    const root = vm.execute(mod as any, { document }) as HTMLElement;

    expect(root.textContent).toBe('idle');

    // Simulate async data fetching operation mutating state
    const loadData = async () => {
      executeBlockStatement(
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'AssignmentExpression',
            operator: '=',
            left: { type: 'Identifier', name: 'status' },
            right: { type: 'Literal', value: 'loading' },
          },
        },
        (vm as any).scope,
        (vm as any).declaredVars
      );

      await new Promise((r) => setTimeout(r, 10));

      executeBlockStatement(
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'AssignmentExpression',
            operator: '=',
            left: { type: 'Identifier', name: 'status' },
            right: { type: 'Literal', value: 'success' },
          },
        },
        (vm as any).scope,
        (vm as any).declaredVars
      );
    };

    const promise = loadData();

    // After first sync step inside loadData, microtask fires
    await Promise.resolve();
    expect(root.textContent).toBe('loading');

    // After async timeout finishes and second setScopeValue runs
    await promise;
    await Promise.resolve();
    expect(root.textContent).toBe('success');
  });

  it('updates DOM reactively when state changes inside setTimeout', async () => {
    const mod = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.INTERPOLATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          type: 'VariableDeclaration',
          declarations: [
            { id: { type: 'Identifier', name: 'count' }, init: { type: 'Literal', value: 0 } },
          ],
        },
        'div',
        { type: 'Identifier', name: 'count' },
      ],
      reactiveBindings: [
        { variable: 'count', positions: [{ opcode: Opcode.INTERPOLATE_TEXT, pc: 5 }] },
      ],
      declaredVars: ['count'],
      scope: {},
    };

    const vm = new DriftClientVM();
    const root = vm.execute(mod as any, { document }) as HTMLElement;

    expect(root.textContent).toBe('0');

    setTimeout(() => {
      executeBlockStatement(
        {
          type: 'ExpressionStatement',
          expression: {
            type: 'AssignmentExpression',
            operator: '=',
            left: { type: 'Identifier', name: 'count' },
            right: { type: 'Literal', value: 100 },
          },
        },
        (vm as any).scope,
        (vm as any).declaredVars
      );
    }, 10);

    await new Promise((r) => setTimeout(r, 20));
    await Promise.resolve();

    expect(root.textContent).toBe('100');
  });

  it('coalesces multiple sync/async state assignments into a single microtask update pass', async () => {
    let updateCount = 0;

    const mod = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.INTERPOLATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: ['div', { type: 'Identifier', name: 'val' }],
      reactiveBindings: [
        { variable: 'val', positions: [{ opcode: Opcode.INTERPOLATE_TEXT, pc: 2 }] },
      ],
      declaredVars: ['val'],
      scope: {},
    };

    const vm = new DriftClientVM();

    // Spy on triggerUpdates
    const origTrigger = vm.triggerUpdates.bind(vm);
    vm.triggerUpdates = (changed) => {
      updateCount++;
      origTrigger(changed);
    };

    vm.execute(mod as any, { document });

    // Perform 5 rapid assignments
    vm.markDirty('val');
    vm.markDirty('val');
    vm.markDirty('val');
    vm.markDirty('val');
    vm.markDirty('val');

    expect(updateCount).toBe(0);

    await Promise.resolve();

    expect(updateCount).toBe(1);
  });

  it('triggers reactivity on array mutating calls (e.g. push)', async () => {
    const mod = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.INTERPOLATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        'div',
        {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'items' },
          property: { type: 'Identifier', name: 'length' },
          computed: false,
        },
      ],
      reactiveBindings: [
        { variable: 'items', positions: [{ opcode: Opcode.INTERPOLATE_TEXT, pc: 3 }] },
      ],
      declaredVars: ['items'],
      scope: { items: [1, 2] },
    };

    const vm = new DriftClientVM();
    const root = vm.execute(mod as any, { document }) as HTMLElement;

    expect(root.textContent).toBe('2');

    // Simulate array mutator call emitted by compiler: (items.push(3), setScopeValue(scope, 'items', items))
    const scope = (vm as any).scope;
    scope.items.push(3);
    executeBlockStatement(
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'AssignmentExpression',
          operator: '=',
          left: { type: 'Identifier', name: 'items' },
          right: { type: 'Identifier', name: 'items' },
        },
      },
      scope,
      (vm as any).declaredVars
    );

    await Promise.resolve();

    expect(root.textContent).toBe('3');
  });
});
