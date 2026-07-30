import { describe, it, expect, vi } from 'vitest';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';
import { DriftClientVirtualMachine } from '../src/client/index.js';

describe('Event Delegation & Edge Cases', () => {
  it('uses a single delegated event listener on document for thousands of items', () => {
    const src = `
      <script>
        let count = 0;
        function inc() { count++; }
      </script>
      <div>
        <button id="b1" onclick={inc}>Btn 1</button>
        <button id="b2" onclick={inc}>Btn 2</button>
        <button id="b3" onclick={inc}>Btn 3</button>
      </div>
    `;

    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const mod = new DriftGenerator(transformer.transform()).generate();

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    const vm = new DriftClientVirtualMachine();
    const container = document.createElement('div');
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    // Only ONE 'click' listener registered on document despite multiple buttons!
    const clickListeners = addEventListenerSpy.mock.calls.filter((call) => call[0] === 'click');
    expect(clickListeners.length).toBe(1);

    addEventListenerSpy.mockRestore();
  });

  it('handles event bubbling when clicking nested children inside an event-bound element', () => {
    const clicked = vi.fn();

    const src = `
      <script>
        function handleClick() {
          clicked();
        }
      </script>
      <div>
        <button id="btn" onclick={handleClick}>
          <span id="inner-span">Click <strong>Me</strong></span>
        </button>
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

    const root = vm.execute(mod, { scope: { clicked }, document });
    if (root) container.appendChild(root);

    const strong = container.querySelector('strong') as HTMLElement;
    expect(strong).not.toBeNull();

    // Click deep child <strong> inside <span> inside <button>
    strong.click();

    expect(clicked).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
  });
});
