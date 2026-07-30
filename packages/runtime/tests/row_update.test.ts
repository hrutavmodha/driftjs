import { describe, it, expect } from 'vitest';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';
import { DriftClientVirtualMachine } from '../src/client/index.js';

describe('Fine-grained row update test', () => {
  it('updates modified item in-place without touching unchanged DOM nodes', () => {
    const src = `
      <script>
        let items = [
          { id: 1, text: 'Item 1' },
          { id: 2, text: 'Item 2' },
          { id: 3, text: 'Item 3' }
        ];
      </script>
      <div>
        <ul>
          @for item in items {
            <li id={'item-' + item.id}>{item.text}</li>
          }
        </ul>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const vm = new DriftClientVirtualMachine();
    const container = document.createElement('div');
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const li1Before = container.querySelector('#item-1');
    const li2Before = container.querySelector('#item-2');
    const li3Before = container.querySelector('#item-3');

    expect(li2Before?.textContent).toBe('Item 2');

    // Mutate only Item 2
    vm.scope.items = [
      { id: 1, text: 'Item 1' },
      { id: 2, text: 'Item 2 UPDATED' },
      { id: 3, text: 'Item 3' }
    ];

    vm.triggerUpdates(new Set(['items']));

    const li1After = container.querySelector('#item-1');
    const li2After = container.querySelector('#item-2');
    const li3After = container.querySelector('#item-3');

    // Unchanged DOM nodes (1 and 3) must be the exact SAME node references
    expect(li1Before).toBe(li1After);
    expect(li3Before).toBe(li3After);

    // Modified node (2) updated text
    expect(li2After?.textContent).toBe('Item 2 UPDATED');
  });
});
