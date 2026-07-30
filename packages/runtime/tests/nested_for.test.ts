import { describe, it, expect } from 'vitest';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';
import { DriftClientVirtualMachine } from '../src/client/index.js';

describe('Nested loops test', () => {
  it('renders nested @for loops correctly', () => {
    const src = `
      <script>
        let categories = [
          { name: 'Fruits', items: ['Apple', 'Banana'] },
          { name: 'Veggies', items: ['Carrot'] }
        ];
      </script>
      <div>
        @for cat in categories {
          <div class="category">
            <h3>{cat.name}</h3>
            <ul>
              @for item in cat.items {
                <li>{item}</li>
              }
            </ul>
          </div>
        }
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

    console.log('--- MOUNT ---');
    console.log(container.innerHTML);

    const categories = container.querySelectorAll('.category');
    expect(categories.length).toBe(2);

    const fruitsLis = categories[0]?.querySelectorAll('li');
    expect(fruitsLis?.length).toBe(2);
    expect(fruitsLis?.[0]?.textContent).toBe('Apple');

    const veggiesLis = categories[1]?.querySelectorAll('li');
    expect(veggiesLis?.length).toBe(1);
    expect(veggiesLis?.[0]?.textContent).toBe('Carrot');
  });
});
