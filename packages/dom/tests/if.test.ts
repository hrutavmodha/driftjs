/**
 * Targeted reproduction test for the App.drift @else if ladder bug:
 * When "Decrement" button is clicked (count--), the @else if (count < 0)
 * branch should render "Negative".
 *
 * This test simulates the exact template structure from App.drift
 * including onclick={dec} wired through the event delegation system.
 */
import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { compile } from '../../compiler/src/index.js';

describe('App.drift @else if ladder – onclick dec() regression', () => {

  /**
   * Exact replica of the counter section from App.drift
   */
  const src = `
    <script>
      let count = 0;
      function inc() { count++; }
      function dec() { count--; }
      function reset() { count = 0; }
    </script>

    <div>
      <p>Current Value: <strong>{count}</strong></p>
      <button id="btn-inc" onclick={inc}>Increment (+1)</button>
      <button id="btn-dec" onclick={dec}>Decrement (-1)</button>
      <button id="btn-reset" onclick={reset}>Reset (0)</button>

      <div>
        <p id="status">
          Value Status:
          @if count > 0 {
            <strong id="label">Positive</strong>
          } @else if count < 0 {
            <strong id="label">Negative</strong>
          } @else {
            <strong id="label">Zero</strong>
          }
        </p>
      </div>
    </div>
  `;

  it('shows "Zero" on initial render (count === 0)', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('#label')?.textContent).toBe('Zero');

    document.body.removeChild(container);
  });

  it('shows "Positive" after clicking Increment once (count === 1)', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const incBtn = container.querySelector('#btn-inc') as HTMLButtonElement;
    incBtn.click();

    expect((vm as any).scope.count).toBe(1);
    expect(container.querySelector('#label')?.textContent).toBe('Positive');

    document.body.removeChild(container);
  });

  it('shows "Negative" after clicking Decrement once from 0 (count === -1)', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    // Start at Zero, click Decrement → count becomes -1
    expect(container.querySelector('#label')?.textContent).toBe('Zero');

    const decBtn = container.querySelector('#btn-dec') as HTMLButtonElement;
    decBtn.click();

    expect((vm as any).scope.count).toBe(-1);
    // THIS IS THE BUG: should show "Negative" but shows "Zero" (or "Positive")
    expect(container.querySelector('#label')?.textContent).toBe('Negative');

    document.body.removeChild(container);
  });

  it('transitions correctly through all three states: Zero → Negative → Zero → Positive → Zero', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const incBtn = container.querySelector('#btn-inc') as HTMLButtonElement;
    const decBtn = container.querySelector('#btn-dec') as HTMLButtonElement;
    const resetBtn = container.querySelector('#btn-reset') as HTMLButtonElement;

    // Initial
    expect(container.querySelector('#label')?.textContent).toBe('Zero');

    // Decrement → Negative
    decBtn.click();
    expect((vm as any).scope.count).toBe(-1);
    expect(container.querySelector('#label')?.textContent).toBe('Negative');

    // Reset → Zero
    resetBtn.click();
    expect((vm as any).scope.count).toBe(0);
    expect(container.querySelector('#label')?.textContent).toBe('Zero');

    // Increment → Positive
    incBtn.click();
    expect((vm as any).scope.count).toBe(1);
    expect(container.querySelector('#label')?.textContent).toBe('Positive');

    // Reset → Zero
    resetBtn.click();
    expect((vm as any).scope.count).toBe(0);
    expect(container.querySelector('#label')?.textContent).toBe('Zero');

    document.body.removeChild(container);
  });

  it('shows "Negative" after multiple decrements from positive (count: 2 → 1 → 0 → -1)', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const incBtn = container.querySelector('#btn-inc') as HTMLButtonElement;
    const decBtn = container.querySelector('#btn-dec') as HTMLButtonElement;

    incBtn.click(); // count = 1 → Positive
    incBtn.click(); // count = 2 → Positive
    expect(container.querySelector('#label')?.textContent).toBe('Positive');

    decBtn.click(); // count = 1 → Positive
    expect(container.querySelector('#label')?.textContent).toBe('Positive');

    decBtn.click(); // count = 0 → Zero
    expect(container.querySelector('#label')?.textContent).toBe('Zero');

    decBtn.click(); // count = -1 → Negative (THE BUG)
    expect((vm as any).scope.count).toBe(-1);
    expect(container.querySelector('#label')?.textContent).toBe('Negative');

    document.body.removeChild(container);
  });
});
