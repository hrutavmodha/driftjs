/**
 * Deep diagnostic test: traces reactiveRegions and DOM state step-by-step
 * to find why count < 0 shows blank in the browser.
 */
import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';

function compile(src: string) {
  const lexer = new DriftLexer(src);
  const parser = new DriftParser(lexer);
  const ast = parser.parse();
  return new DriftGenerator(new DriftTransformer(ast).transform()).generate();
}

describe('Diagnostic: @else if blank on count < 0', () => {
  const src = `
    <script>
      let count = 0;
      function inc() { count++; }
      function dec() { count--; }
    </script>
    <div>
      @if count > 0 {
        <strong>Positive</strong>
      } @else if count < 0 {
        <strong>Negative</strong>
      } @else {
        <strong>Zero</strong>
      }
    </div>
  `;

  it('logs region count and DOM state at each transition', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const regions = (vm as any).reactiveRegions as Array<{ deps: Set<string>; reRender: () => void }>;

    console.log('=== INITIAL (count=0) ===');
    console.log('Regions count:', regions.length);
    console.log('DOM:', container.innerHTML);
    expect(container.querySelector('strong')?.textContent).toBe('Zero');

    // Decrement: count = -1
    (vm as any).scope.count = -1;
    console.log('\n=== BEFORE triggerUpdates count=-1 ===');
    console.log('Regions count:', regions.length);
    console.log('Regions deps:', regions.map(r => [...r.deps]));

    vm.triggerUpdates(new Set(['count']));

    console.log('\n=== AFTER triggerUpdates count=-1 ===');
    console.log('Regions count:', regions.length);
    console.log('DOM:', container.innerHTML);

    const strong = container.querySelector('strong');
    console.log('strong text:', strong?.textContent);
    console.log('strong parentNode:', strong?.parentNode?.nodeName);

    // This is the key assertion — does it show Negative?
    expect(strong?.textContent).toBe('Negative');

    document.body.removeChild(container);
  });

  it('logs what happens on the second triggerUpdates (count=0 then count=-1)', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    const regions = (vm as any).reactiveRegions as Array<{ deps: Set<string>; reRender: () => void }>;

    // Go to Positive first
    (vm as any).scope.count = 1;
    vm.triggerUpdates(new Set(['count']));
    console.log('\n=== count=1 ===');
    console.log('Regions:', regions.length, '| DOM:', container.querySelector('strong')?.textContent);

    // Go back to Zero
    (vm as any).scope.count = 0;
    vm.triggerUpdates(new Set(['count']));
    console.log('\n=== count=0 ===');
    console.log('Regions:', regions.length, '| DOM:', container.querySelector('strong')?.textContent);

    // Now go Negative — this is where it goes blank in the browser
    (vm as any).scope.count = -1;
    console.log('\n=== BEFORE count=-1 triggerUpdates ===');
    console.log('Regions:', regions.length);
    console.log('Each region deps:', regions.map(r => [...r.deps]));

    vm.triggerUpdates(new Set(['count']));

    console.log('\n=== AFTER count=-1 ===');
    console.log('Regions:', regions.length);
    console.log('DOM:', container.innerHTML);
    console.log('strong:', container.querySelector('strong')?.textContent);

    expect(container.querySelector('strong')?.textContent).toBe('Negative');

    document.body.removeChild(container);
  });

  it('checks anchor comment parentNodes after each render', () => {
    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    function getComments(el: Element) {
      const result: string[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        result.push(`<!--${(node as Comment).data}-->`);
      }
      return result;
    }

    console.log('\n=== INITIAL comments ===', getComments(container));

    (vm as any).scope.count = -1;
    vm.triggerUpdates(new Set(['count']));
    console.log('\n=== AFTER count=-1 comments ===', getComments(container));
    console.log('DOM:', container.innerHTML);

    document.body.removeChild(container);
  });
});
