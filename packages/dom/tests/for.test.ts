import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { compile } from '../../compiler/src/index.js';

describe('DriftJS @for Directive Integration Suite', () => {

  it('renders initial list and reactively adds items on button click', () => {
    const src = `
      <script>
        let items = [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' }
        ];
        function addItem() {
          items = items.concat({ id: 3, text: 'Item 3' });
        }
      </script>
      <div>
        <button id="add-btn" onclick={addItem}>Add</button>
        <ul id="list">
          @for item in items key item.id {
            <li id={"item-" + item.id}>{item.text}</li>
          }
        </ul>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('#item-1')?.textContent).toBe('Item 1');
    expect(container.querySelector('#item-2')?.textContent).toBe('Item 2');

    const btn = container.querySelector('#add-btn') as HTMLButtonElement;
    btn.click();

    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelector('#item-3')?.textContent).toBe('Item 3');

    document.body.removeChild(container);
  });

  it('reactively removes items and cleans up DOM nodes', () => {
    const src = `
      <script>
        let items = [
          { id: 10, name: 'Alice' },
          { id: 20, name: 'Bob' },
          { id: 30, name: 'Charlie' }
        ];
        function removeBob() {
          items = items.filter(i => i.id !== 20);
        }
      </script>
      <div>
        <button id="remove-btn" onclick={removeBob}>Remove Bob</button>
        <ul>
          @for item in items key item.id {
            <li class="user-row">{item.name}</li>
          }
        </ul>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const rowsBefore = container.querySelectorAll('.user-row');
    expect(rowsBefore).toHaveLength(3);
    expect(rowsBefore[1]?.textContent).toBe('Bob');

    const btn = container.querySelector('#remove-btn') as HTMLButtonElement;
    btn.click();

    const rowsAfter = container.querySelectorAll('.user-row');
    expect(rowsAfter).toHaveLength(2);
    expect(rowsAfter[0]?.textContent).toBe('Alice');
    expect(rowsAfter[1]?.textContent).toBe('Charlie');

    document.body.removeChild(container);
  });

  it('preserves DOM node identity across keyed row swaps (LIS reconciler)', () => {
    const src = `
      <script>
        let rows = [
          { id: 1, label: 'First' },
          { id: 2, label: 'Second' },
          { id: 3, label: 'Third' }
        ];
        function swap() {
          const next = rows.slice();
          const tmp = next[0];
          next[0] = next[1];
          next[1] = tmp;
          rows = next;
        }
      </script>
      <div>
        <button id="swap-btn" onclick={swap}>Swap</button>
        <table id="tbl">
          <tbody>
            @for row in rows key row.id {
              <tr data-id={row.id}><td>{row.label}</td></tr>
            }
          </tbody>
        </table>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const rowsBefore = Array.from(container.querySelectorAll('tr'));
    const row1 = rowsBefore[0]!;
    const row2 = rowsBefore[1]!;
    const row3 = rowsBefore[2]!;

    const btn = container.querySelector('#swap-btn') as HTMLButtonElement;
    btn.click();

    const rowsAfter = Array.from(container.querySelectorAll('tr'));
    expect(rowsAfter[0]).toBe(row2);
    expect(rowsAfter[1]).toBe(row1);
    expect(rowsAfter[2]).toBe(row3);

    document.body.removeChild(container);
  });

  it('supports unkeyed loops with strict index fallback', () => {
    const src = `
      <script>
        let fruits = ['Apple', 'Banana', 'Cherry'];
        function updateBanana() {
          const next = fruits.slice();
          next[1] = 'Blueberry';
          fruits = next;
        }
      </script>
      <div>
        <button id="btn-update" onclick={updateBanana}>Update</button>
        <ul id="fruit-list">
          @for fruit in fruits {
            <li>{fruit}</li>
          }
        </ul>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelectorAll('li')[1]?.textContent).toBe('Banana');

    const btn = container.querySelector('#btn-update') as HTMLButtonElement;
    btn.click();

    expect(container.querySelectorAll('li')[1]?.textContent).toBe('Blueberry');

    document.body.removeChild(container);
  });

  it('binds item and index variables in @for loop header', () => {
    const src = `
      <script>
        let tasks = ['Design', 'Develop', 'Deploy'];
      </script>
      <div>
        <ul>
          @for (task, idx) in tasks key task {
            <li>{idx + 1}. {task}</li>
          }
        </ul>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toBe('1. Design');
    expect(items[1]?.textContent).toBe('2. Develop');
    expect(items[2]?.textContent).toBe('3. Deploy');

    document.body.removeChild(container);
  });

  it('handles transitions between populated list and empty list', () => {
    const src = `
      <script>
        let items = [1, 2, 3];
        function clear() { items = []; }
        function populate() { items = [4, 5]; }
      </script>
      <div>
        <button id="clear-btn" onclick={clear}>Clear</button>
        <button id="pop-btn" onclick={populate}>Populate</button>
        <div id="wrapper">
          @for n in items {
            <span>{n}</span>
          }
        </div>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelectorAll('span')).toHaveLength(3);

    (container.querySelector('#clear-btn') as HTMLButtonElement).click();
    expect(container.querySelectorAll('span')).toHaveLength(0);

    (container.querySelector('#pop-btn') as HTMLButtonElement).click();
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(container.querySelectorAll('span')[0]?.textContent).toBe('4');

    document.body.removeChild(container);
  });

  it('correctly moves items to the tail of a keyed list when refNode is null (BUG-008)', () => {
    const src = `
      <script>
        let items = [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' }
        ];
        function moveHeadToTail() {
          items = [
            { id: 'b', text: 'B' },
            { id: 'c', text: 'C' },
            { id: 'a', text: 'A' }
          ];
        }
      </script>
      <div>
        <button id="move-btn" onclick={moveHeadToTail}>Move</button>
        <ul>
          @for item in items key item.id {
            <li id={"node-" + item.id}>{item.text}</li>
          }
        </ul>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    let lis = container.querySelectorAll('li');
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe('A');
    expect(lis[1]?.textContent).toBe('B');
    expect(lis[2]?.textContent).toBe('C');

    (container.querySelector('#move-btn') as HTMLButtonElement).click();

    lis = container.querySelectorAll('li');
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe('B');
    expect(lis[1]?.textContent).toBe('C');
    expect(lis[2]?.textContent).toBe('A');

    document.body.removeChild(container);
  });
});
