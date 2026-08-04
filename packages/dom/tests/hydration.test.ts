import { describe, it, expect } from 'vitest';
import { hydrate } from '../src/index.js';
import { renderToString } from '../../ssr/src/index.js';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';

describe('SSR & Hydration End-to-End Integration', () => {
  it('hydrates pre-rendered SSR HTML without destroying existing DOM nodes and binds event listeners', () => {
    const src = `
      <script>
        let count = 0;
        function increment() {
          count++;
        }
      </script>
      <div class="card">
        <h1 class="title">Counter</h1>
        <p class="count-display">{count}</p>
        <button class="btn" onclick={increment}>Increment</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const compiledModule = new DriftGenerator(transformer.transform()).generate();

    // 1. Server-Side Render (SSR) to HTML string
    const ssrHtml = renderToString(compiledModule);
    expect(ssrHtml).toBe('<div class="card"><h1 class="title">Counter</h1><p class="count-display">0</p><button class="btn">Increment</button></div>');

    // 2. Browser receives SSR HTML string into container
    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    const h1Before = container.querySelector('.title');
    const pBefore = container.querySelector('.count-display');
    const btnBefore = container.querySelector('.btn') as HTMLButtonElement;

    // 3. Hydrate client-side
    const vm = hydrate(compiledModule, container);

    const h1After = container.querySelector('.title');
    const pAfter = container.querySelector('.count-display');
    const btnAfter = container.querySelector('.btn') as HTMLButtonElement;

    // Zero DOM node replacements! Existing SSR nodes were claimed in-place
    expect(h1Before).toBe(h1After);
    expect(pBefore).toBe(pAfter);
    expect(btnBefore).toBe(btnAfter);

    // 4. Trigger event on hydrated element
    btnAfter.click();

    // 5. Verify reactive DOM updates work after hydration!
    expect(pAfter.textContent).toBe('1');

    document.body.removeChild(container);
  });
});
