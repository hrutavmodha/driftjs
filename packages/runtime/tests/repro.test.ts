import { describe, it, expect } from 'vitest';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';
import { DriftClientVirtualMachine } from '../src/client/index.js';

describe('App.drift exact test', () => {
  it('updates history on 1st click', () => {
    const src = `
      <script>
        let count = 0;
        let history = [];

        function increment() {
          count++; 
          history = [...history, 'Incremented'];
        }
      </script>

      <div class="card">
        <button class="btn btn-inc" onclick={increment}>+</button>
        <ul class="history">
          @for log in history {
            <li class="pill">{log}</li>
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
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const incBtn = container.querySelector('.btn-inc') as HTMLButtonElement;
    incBtn.click();

    const lis1 = container.querySelectorAll('.history .pill');
    expect(lis1.length).toBe(1);

    document.body.removeChild(container);
  });
});
