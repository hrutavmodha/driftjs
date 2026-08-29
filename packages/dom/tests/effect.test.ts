import { describe, it, expect, vi } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { onMount, onUnmount, effect } from 'driftjs-shared';
import { compile } from '../../compiler/src/index.js';

describe('effect() Reactive Side-Effects & Lifecycle in DriftClientVM', () => {
  it('runs effect() after initial mount and accesses state and DOM', () => {
    let effectRanWith: number | null = null;
    (globalThis as any).__test_hook__ = (val: number) => {
      effectRanWith = val;
    };

    const sfc = `
      <script>
        let count = 42;

        effect(() => {
          globalThis.__test_hook__(count);
        });
      </script>
      <div class="target">Count: {count}</div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(effectRanWith).toBe(42);
    expect(container.querySelector('.target')?.textContent).toBe('Count: 42');

    vm.unmount();
    document.body.removeChild(container);
    delete (globalThis as any).__test_hook__;
  });

  it('re-runs effect() reactively when tracked dependency changes', async () => {
    const runs: number[] = [];
    (globalThis as any).__test_tracker__ = (val: number) => {
      runs.push(val);
    };

    const sfc = `
      <script>
        let count = 1;

        effect(() => {
          globalThis.__test_tracker__(count);
        });

        function increment() {
          count++;
        }
      </script>
      <div>
        <span class="count">{count}</span>
        <button id="btn" onclick={increment}>+1</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(runs).toEqual([1]);

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();

    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.count')?.textContent).toBe('2');
    expect(runs).toEqual([1, 2]);

    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.count')?.textContent).toBe('3');
    expect(runs).toEqual([1, 2, 3]);

    vm.unmount();
    document.body.removeChild(container);
    delete (globalThis as any).__test_tracker__;
  });

  it('executes cleanup function before effect re-runs and on unmount', async () => {
    const events: string[] = [];
    (globalThis as any).__record_event__ = (e: string) => {
      events.push(e);
    };

    const sfc = `
      <script>
        let count = 10;

        effect(() => {
          let current = count;
          globalThis.__record_event__('effect:' + current);
          return () => {
            globalThis.__record_event__('cleanup:' + current);
          };
        });

        function change() {
          count = 20;
        }
      </script>
      <div>
        <span>{count}</span>
        <button id="btn" onclick={change}>Change</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(events).toEqual(['effect:10']);

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    // Cleanup for 10 must run before effect for 20
    expect(events).toEqual(['effect:10', 'cleanup:10', 'effect:20']);

    vm.unmount();
    // Cleanup for 20 must run on unmount
    expect(events).toEqual(['effect:10', 'cleanup:10', 'effect:20', 'cleanup:20']);

    document.body.removeChild(container);
    delete (globalThis as any).__record_event__;
  });

  it('triggers effect depending on derive() state when underlying dependency updates', async () => {
    const derivedObservations: number[] = [];
    (globalThis as any).__observe_derived__ = (val: number) => {
      derivedObservations.push(val);
    };

    const sfc = `
      <script>
        let count = 2;
        let double = derive(count * 2);

        effect(() => {
          globalThis.__observe_derived__(double);
        });

        function increment() {
          count = 5;
        }
      </script>
      <div>
        <span class="double">{double}</span>
        <button id="btn" onclick={increment}>Update</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(derivedObservations).toEqual([4]);

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.double')?.textContent).toBe('10');
    expect(derivedObservations).toEqual([4, 10]);

    vm.unmount();
    document.body.removeChild(container);
    delete (globalThis as any).__observe_derived__;
  });

  it('handles async effect functions and state mutation inside async effect', async () => {
    const sfc = `
      <script>
        let status = 'idle';

        effect(async () => {
          await new Promise((r) => setTimeout(r, 10));
          status = 'resolved';
        });
      </script>
      <div class="status">{status}</div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.status')?.textContent).toBe('idle');

    await new Promise((r) => setTimeout(r, 25));

    expect(container.querySelector('.status')?.textContent).toBe('resolved');

    vm.unmount();
    document.body.removeChild(container);
  });

  it('runs mount-only effect with empty dependencies only once', async () => {
    let mountRuns = 0;
    (globalThis as any).__inc_mount__ = () => {
      mountRuns++;
    };

    const sfc = `
      <script>
        let count = 0;

        effect(() => {
          globalThis.__inc_mount__();
        });

        function inc() {
          count++;
        }
      </script>
      <div>
        <span class="count">{count}</span>
        <button id="btn" onclick={inc}>+1</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(mountRuns).toBe(1);

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.count')?.textContent).toBe('1');
    expect(mountRuns).toBe(1); // Still 1

    vm.unmount();
    document.body.removeChild(container);
    delete (globalThis as any).__inc_mount__;
  });

  it('supports programmatic onMount and onUnmount lifecycle hooks', async () => {
    const lifecycleLog: string[] = [];

    const sfc = `
      <script>
        onMount(() => {
          lifecycleLog.push('mounted');
          return () => {
            lifecycleLog.push('mount-cleanup');
          };
        });

        onUnmount(() => {
          lifecycleLog.push('unmounted');
        });
      </script>
      <div>Lifecycle Demo</div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document, scope: { onMount, onUnmount, lifecycleLog } });
    if (root) container.appendChild(root);

    expect(lifecycleLog).toEqual(['mounted']);

    vm.unmount();

    expect(lifecycleLog).toEqual(['mounted', 'mount-cleanup', 'unmounted']);

    document.body.removeChild(container);
  });

  it('cleans up child component effects when child is unmounted conditionally via @if', async () => {
    const childLog: string[] = [];
    (globalThis as any).__child_log__ = (msg: string) => {
      childLog.push(msg);
    };

    const childSfc = `
      <script>
        effect(() => {
          globalThis.__child_log__('child:mounted');
          return () => {
            globalThis.__child_log__('child:cleaned');
          };
        });
      </script>
      <div class="child">Child Content</div>
    `;

    const parentSfc = `
      <script>
        import Child from './Child.drift';
        let show = true;

        function toggle() {
          show = !show;
        }
      </script>
      <div>
        @if show {
          <Child />
        }
        <button id="toggle-btn" onclick={toggle}>Toggle</button>
      </div>
    `;

    const childModule = compile(childSfc);
    const parentModule = compile(parentSfc);

    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(parentModule, {
      document,
      scope: { Child: childModule },
    });
    if (root) container.appendChild(root);

    expect(childLog).toEqual(['child:mounted']);
    expect(container.querySelector('.child')).not.toBeNull();

    // Toggle off: Unmount child
    const btn = container.querySelector('#toggle-btn') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.child')).toBeNull();
    expect(childLog).toEqual(['child:mounted', 'child:cleaned']);

    // Toggle back on: Mount child again
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.child')).not.toBeNull();
    expect(childLog).toEqual(['child:mounted', 'child:cleaned', 'child:mounted']);

    vm.unmount();
    expect(childLog).toEqual(['child:mounted', 'child:cleaned', 'child:mounted', 'child:cleaned']);

    document.body.removeChild(container);
    delete (globalThis as any).__child_log__;
  });

  it('runs multiple independent effect() calls within the same component', async () => {
    const logA: number[] = [];
    const logB: string[] = [];

    (globalThis as any).__log_a__ = (n: number) => logA.push(n);
    (globalThis as any).__log_b__ = (s: string) => logB.push(s);

    const sfc = `
      <script>
        let count = 0;
        let name = "Alpha";

        effect(() => {
          globalThis.__log_a__(count);
        });

        effect(() => {
          globalThis.__log_b__(name);
        });

        function changeCount() {
          count = 10;
        }

        function changeName() {
          name = "Beta";
        }
      </script>
      <div>
        <button id="btn-count" onclick={changeCount}>Count</button>
        <button id="btn-name" onclick={changeName}>Name</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(logA).toEqual([0]);
    expect(logB).toEqual(['Alpha']);

    // Change only count
    const btnCount = container.querySelector('#btn-count') as HTMLButtonElement;
    btnCount.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(logA).toEqual([0, 10]);
    expect(logB).toEqual(['Alpha']); // Effect B was not re-triggered

    // Change only name
    const btnName = container.querySelector('#btn-name') as HTMLButtonElement;
    btnName.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(logA).toEqual([0, 10]);
    expect(logB).toEqual(['Alpha', 'Beta']); // Effect A was not re-triggered

    vm.unmount();
    document.body.removeChild(container);
    delete (globalThis as any).__log_a__;
    delete (globalThis as any).__log_b__;
  });
});
