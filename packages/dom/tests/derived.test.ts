import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { compile } from '../../compiler/src/index.js';

describe('derive() Computed / Derived State VM Reactivity', () => {
  it('renders and reactively updates derived state from direct expressions', async () => {
    const sfc = `
      <script>
        let count = 2;
        let double = derive(count * 2);
        let quad = derive(double * 2);

        function increment() {
          count++;
        }
      </script>
      <div>
        <span class="count">{count}</span>
        <span class="double">{double}</span>
        <span class="quad">{quad}</span>
        <button id="inc-btn" onclick={increment}>+1</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.count')?.textContent).toBe('2');
    expect(container.querySelector('.double')?.textContent).toBe('4');
    expect(container.querySelector('.quad')?.textContent).toBe('8');

    // Trigger state update
    const btn = container.querySelector('#inc-btn') as HTMLButtonElement;
    btn.click();

    // Wait for microtask batch flush
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.count')?.textContent).toBe('3');
    expect(container.querySelector('.double')?.textContent).toBe('6');
    expect(container.querySelector('.quad')?.textContent).toBe('12');

    vm.unmount();
    document.body.removeChild(container);
  });

  it('supports function block derive(() => { ... }) with multi-step logic', async () => {
    const sfc = `
      <script>
        let score = 75;
        let grade = derive(() => {
          if (score >= 90) return 'A';
          if (score >= 80) return 'B';
          if (score >= 70) return 'C';
          return 'F';
        });

        function boost() {
          score = 95;
        }
      </script>
      <div>
        <span class="score">{score}</span>
        <span class="grade">{grade}</span>
        <button id="boost-btn" onclick={boost}>Boost</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.score')?.textContent).toBe('75');
    expect(container.querySelector('.grade')?.textContent).toBe('C');

    const btn = container.querySelector('#boost-btn') as HTMLButtonElement;
    btn.click();

    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.score')?.textContent).toBe('95');
    expect(container.querySelector('.grade')?.textContent).toBe('A');

    vm.unmount();
    document.body.removeChild(container);
  });

  it('allows reading derived variables directly inside script functions', () => {
    const sfc = `
      <script>
        let count = 10;
        let double = derive(count * 2);

        function getSummary() {
          return 'double is ' + double;
        }
      </script>
      <div>{getSummary()}</div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const root = vm.execute(module, { document }) as HTMLElement;

    expect(root.textContent).toBe('double is 20');
    vm.unmount();
  });

  it('lazily caches derived calculations and only re-evaluates when dependencies change', async () => {
    (globalThis as any).evalCount = 0;
    const sfc = `
      <script>
        let count = 1;
        let other = 100;
        let expensive = derive(() => {
          globalThis.evalCount = (globalThis.evalCount || 0) + 1;
          return count * 10;
        });

        function changeOther() {
          other++;
        }

        function changeCount() {
          count++;
        }
      </script>
      <div>
        <span class="exp">{expensive}</span>
        <button class="btn-other" onclick={changeOther}>Other</button>
        <button class="btn-count" onclick={changeCount}>Count</button>
      </div>
    `;

    const module = compile(sfc);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(module, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.exp')?.textContent).toBe('10');
    expect((globalThis as any).evalCount).toBe(1);

    // Reading scope.expensive again uses cached value
    const read1 = vm.scope.expensive;
    expect(read1).toBe(10);
    expect((globalThis as any).evalCount).toBe(1);

    // Changing unrelated variable 'other' does NOT invalidate expensive
    const btnOther = container.querySelector('.btn-other') as HTMLButtonElement;
    btnOther.click();
    await new Promise((r) => setTimeout(r, 10));

    expect((globalThis as any).evalCount).toBe(1);

    // Changing dependent variable 'count' invalidates and recalculates
    const btnCount = container.querySelector('.btn-count') as HTMLButtonElement;
    btnCount.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.exp')?.textContent).toBe('20');
    expect((globalThis as any).evalCount).toBe(2);

    vm.unmount();
    document.body.removeChild(container);
  });
});
