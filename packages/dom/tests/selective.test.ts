import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hydrateSelectively,
  hydrateOnIdle,
  hydrateWhenVisible,
  hydrateOnInteraction,
  hydrateOnMedia,
  hydrateIslands,
  hydrate,
} from '../src/index.js';
import { renderToString } from '../../ssr/src/index.js';
import { DriftLexer, DriftParser, DriftTransformer, DriftGenerator } from '../../compiler/src/index.js';

function compileSFC(src: string) {
  const lexer = new DriftLexer(src);
  const parser = new DriftParser(lexer);
  const ast = parser.parse();
  const transformer = new DriftTransformer(ast);
  return new DriftGenerator(transformer.transform()).generate();
}

describe('Selective Hydration Suite', () => {
  const counterSrc = `
    <script>
      let count = 0;
      function inc() {
        count++;
      }
    </script>
    <div class="counter-box">
      <span class="count">{count}</span>
      <button class="inc-btn" onclick={inc}>Increment</button>
    </div>
  `;

  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  describe('hydrateSelectively (Eager & Custom Triggers)', () => {
    it('hydrates eagerly by default with controller ready promise', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      const spanBefore = container.querySelector('.count');
      const btnBefore = container.querySelector('.inc-btn') as HTMLButtonElement;

      const controller = hydrateSelectively(comp, container);

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      const vm = await controller.ready;
      expect(vm).toBe(controller.vm);

      const spanAfter = container.querySelector('.count');
      const btnAfter = container.querySelector('.inc-btn') as HTMLButtonElement;

      expect(spanBefore).toBe(spanAfter);
      expect(btnBefore).toBe(btnAfter);

      btnAfter.click();
      expect(spanAfter!.textContent).toBe('1');

      controller.unmount();
      expect(controller.isHydrated).toBe(false);
      expect(controller.vm).toBeNull();
    });

    it('hydrates with custom trigger function and handles cancel / unmount', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      let triggerFn: (() => void) | null = null;
      let cleanupCalled = false;

      const controller = hydrateSelectively(comp, container, {
        trigger: (hydrateFn) => {
          triggerFn = hydrateFn;
          return () => {
            cleanupCalled = true;
          };
        },
      });

      expect(controller.isHydrated).toBe(false);
      expect(controller.vm).toBeNull();
      expect(triggerFn).not.toBeNull();

      // Trigger custom hydration
      triggerFn!();

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      const span = container.querySelector('.count');
      const btn = container.querySelector('.inc-btn') as HTMLButtonElement;
      btn.click();
      expect(span!.textContent).toBe('1');

      controller.unmount();
      expect(cleanupCalled).toBe(true);
    });
  });

  describe('hydrateOnIdle', () => {
    it('defers hydration until requestIdleCallback executes', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      let idleCb: (() => void) | null = null;
      (window as any).requestIdleCallback = vi.fn((cb: () => void) => {
        idleCb = cb;
        return 42;
      });
      (window as any).cancelIdleCallback = vi.fn();

      const controller = hydrateOnIdle(comp, container, { timeout: 1500 });

      expect(controller.isHydrated).toBe(false);
      expect(window.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 1500 });

      // Simulate browser entering idle period
      expect(idleCb).not.toBeNull();
      idleCb!();

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      const span = container.querySelector('.count');
      const btn = container.querySelector('.inc-btn') as HTMLButtonElement;
      btn.click();
      expect(span!.textContent).toBe('1');
    });

    it('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      const originalRIC = (window as any).requestIdleCallback;
      delete (window as any).requestIdleCallback;

      vi.useFakeTimers();

      const controller = hydrateOnIdle(comp, container, { timeout: 100 });
      expect(controller.isHydrated).toBe(false);

      vi.advanceTimersByTime(60);

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      vi.useRealTimers();
      if (originalRIC) (window as any).requestIdleCallback = originalRIC;
    });

    it('supports hydrateNow() forcing immediate hydration and cancel()', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      (window as any).requestIdleCallback = vi.fn(() => 99);
      (window as any).cancelIdleCallback = vi.fn();

      const controller = hydrateOnIdle(comp, container);
      expect(controller.isHydrated).toBe(false);

      const vm = controller.hydrateNow();
      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).toBe(vm);
      expect(window.cancelIdleCallback).toHaveBeenCalledWith(99);

      // Calling hydrateNow again is idempotent
      expect(controller.hydrateNow()).toBe(vm);
    });
  });

  describe('hydrateWhenVisible', () => {
    it('defers hydration until container intersects viewport', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      let observerCallback: IntersectionObserverCallback | null = null;
      let observedElement: Element | null = null;
      let disconnectCalled = false;

      class MockIntersectionObserver {
        constructor(callback: IntersectionObserverCallback, public options?: IntersectionObserverInit) {
          observerCallback = callback;
        }
        observe(target: Element) {
          observedElement = target;
        }
        unobserve() {}
        disconnect() {
          disconnectCalled = true;
        }
      }

      (window as any).IntersectionObserver = MockIntersectionObserver;

      const controller = hydrateWhenVisible(comp, container, { rootMargin: '100px', threshold: 0.5 });

      expect(controller.isHydrated).toBe(false);
      expect(observedElement).toBe(container);
      expect(observerCallback).not.toBeNull();

      // Trigger intersection entry
      observerCallback!(
        [
          {
            isIntersecting: true,
            target: container,
            intersectionRatio: 0.6,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as any
      );

      expect(controller.isHydrated).toBe(true);
      expect(disconnectCalled).toBe(true);

      const span = container.querySelector('.count');
      const btn = container.querySelector('.inc-btn') as HTMLButtonElement;
      btn.click();
      expect(span!.textContent).toBe('1');
    });

    it('falls back gracefully when IntersectionObserver is not available', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      const originalIO = (window as any).IntersectionObserver;
      delete (window as any).IntersectionObserver;

      vi.useFakeTimers();

      const controller = hydrateWhenVisible(comp, container);
      expect(controller.isHydrated).toBe(false);

      vi.advanceTimersByTime(5);

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      vi.useRealTimers();
      if (originalIO) (window as any).IntersectionObserver = originalIO;
    });
  });

  describe('hydrateOnInteraction', () => {
    it('defers hydration until user interaction and replays the event', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      const spanBefore = container.querySelector('.count');
      const btnBefore = container.querySelector('.inc-btn') as HTMLButtonElement;

      const controller = hydrateOnInteraction(comp, container, {
        events: ['click'],
        replayEvent: true,
      });

      expect(controller.isHydrated).toBe(false);
      expect(controller.vm).toBeNull();

      // Click button before hydration
      btnBefore.click();

      // Hydration triggers synchronously on the interaction event
      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      // Wait for microtask event replay
      await new Promise<void>((r) => queueMicrotask(() => r()));

      expect(spanBefore!.textContent).toBe('1');

      // Subsequent clicks continue to work reactively
      btnBefore.click();
      expect(spanBefore!.textContent).toBe('2');
    });

    it('supports hover / pointerenter interaction trigger', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      const controller = hydrateOnInteraction(comp, container, {
        events: ['pointerenter'],
        replayEvent: false,
      });

      expect(controller.isHydrated).toBe(false);

      container.dispatchEvent(new Event('pointerenter', { bubbles: true }));

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();
    });

    it('supports fallback timeout if interaction does not happen within timeout', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      vi.useFakeTimers();

      const controller = hydrateOnInteraction(comp, container, {
        timeout: 300,
      });

      expect(controller.isHydrated).toBe(false);

      vi.advanceTimersByTime(350);

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();

      vi.useRealTimers();
    });
  });

  describe('hydrateOnMedia', () => {
    it('hydrates immediately if media query already matches', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      const controller = hydrateOnMedia(comp, container, '(min-width: 768px)');

      expect(controller.isHydrated).toBe(true);
      expect(controller.vm).not.toBeNull();
    });

    it('defers hydration until media query changes to match', async () => {
      const comp = compileSFC(counterSrc);
      container.innerHTML = renderToString(comp);

      let changeListener: ((e: any) => void) | null = null;
      let removed = false;

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn((evt: string, handler: any) => {
          if (evt === 'change') changeListener = handler;
        }),
        removeEventListener: vi.fn(() => {
          removed = true;
        }),
      }));

      const controller = hydrateOnMedia(comp, container, '(min-width: 768px)');

      expect(controller.isHydrated).toBe(false);
      expect(changeListener).not.toBeNull();

      // Trigger media match event
      changeListener!({ matches: true });

      expect(controller.isHydrated).toBe(true);
      expect(removed).toBe(true);
    });
  });

  describe('hydrateIslands', () => {
    it('discovers and selective-hydrates multiple islands across container', async () => {
      const headerSrc = `
        <script>
          let title = (typeof props !== 'undefined' && props && props.title) || 'Default Title';
        </script>
        <header class="header"><h1>{title}</h1></header>
      `;
      const counterComp = compileSFC(counterSrc);
      const headerComp = compileSFC(headerSrc);

      container.innerHTML = `
        <div class="page">
          <div data-drift-island="Header" data-drift-trigger="eager" data-drift-props='{"title":"Island Header"}'>
            ${renderToString(headerComp, { scope: { title: 'Island Header', props: { title: 'Island Header' } } })}
          </div>
          <div data-drift-island="Counter" data-drift-trigger="eager" data-drift-props='{"count":10}'>
            ${renderToString(counterComp, { scope: { count: 10 } })}
          </div>
        </div>
      `;

      const result = hydrateIslands(container, {
        Header: headerComp,
        Counter: counterComp,
      });

      expect(result.controllers.length).toBe(2);
      expect(result.controllers[0]!.isHydrated).toBe(true);
      expect(result.controllers[1]!.isHydrated).toBe(true);

      const h1 = container.querySelector('h1');
      expect(h1!.textContent).toBe('Island Header');

      const count = container.querySelector('.count');
      const btn = container.querySelector('.inc-btn') as HTMLButtonElement;
      expect(count!.textContent).toBe('0'); // initialized scope
      btn.click();
      expect(count!.textContent).toBe('1');
    });

    it('handles hydrateAll() and cancelAll() on island result', async () => {
      const counterComp = compileSFC(counterSrc);

      container.innerHTML = `
        <div data-drift-island="CounterA" data-drift-trigger="idle">
          ${renderToString(counterComp)}
        </div>
        <div data-drift-island="CounterB" data-drift-trigger="idle">
          ${renderToString(counterComp)}
        </div>
      `;

      (window as any).requestIdleCallback = vi.fn(() => 101);
      (window as any).cancelIdleCallback = vi.fn();

      const result = hydrateIslands(container, {
        CounterA: counterComp,
        CounterB: counterComp,
      });

      expect(result.controllers.length).toBe(2);
      expect(result.controllers[0]!.isHydrated).toBe(false);
      expect(result.controllers[1]!.isHydrated).toBe(false);

      const vms = await result.hydrateAll();
      expect(vms.length).toBe(2);
      expect(result.controllers[0]!.isHydrated).toBe(true);
      expect(result.controllers[1]!.isHydrated).toBe(true);

      result.cancelAll();
    });
  });

  describe('Nested Component SSR Hydration with Shared HydrationCursor', () => {
    it('hydrates parent and nested child component with zero duplicate DOM nodes', () => {
      const childSrc = `
        <script>
          let subtitle = props.subtitle || 'Sub';
          let childCount = 0;
          function incChild() {
            childCount++;
          }
        </script>
        <div class="child-card">
          <h2 class="subtitle">{subtitle}</h2>
          <span class="child-count">{childCount}</span>
          <button class="child-btn" onclick={incChild}>Child Inc</button>
        </div>
      `;

      const parentSrc = `
        <script>
          import ChildComponent from './Child.drift';
          let parentTitle = 'Parent Title';
          let parentCount = 0;
          function incParent() {
            parentCount++;
          }
        </script>
        <div class="parent-container">
          <h1 class="main-title">{parentTitle}</h1>
          <p class="parent-count">{parentCount}</p>
          <button class="parent-btn" onclick={incParent}>Parent Inc</button>
          <ChildComponent subtitle="Custom Subtitle" />
        </div>
      `;

      const childComp = compileSFC(childSrc);
      const parentComp = compileSFC(parentSrc);
      (parentComp as any).scope = { ChildComponent: childComp };

      // 1. Render SSR
      const ssrHtml = renderToString(parentComp);
      container.innerHTML = ssrHtml;

      const mainTitleBefore = container.querySelector('.main-title');
      const subtitleBefore = container.querySelector('.subtitle');
      const parentBtnBefore = container.querySelector('.parent-btn') as HTMLButtonElement;
      const childBtnBefore = container.querySelector('.child-btn') as HTMLButtonElement;
      const childCountBefore = container.querySelector('.child-count');

      // 2. Hydrate
      const vm = hydrate(parentComp, container);

      const mainTitleAfter = container.querySelector('.main-title');
      const subtitleAfter = container.querySelector('.subtitle');
      const parentBtnAfter = container.querySelector('.parent-btn') as HTMLButtonElement;
      const childBtnAfter = container.querySelector('.child-btn') as HTMLButtonElement;
      const childCountAfter = container.querySelector('.child-count');

      // Zero node replacements across parent AND child!
      expect(mainTitleBefore).toBe(mainTitleAfter);
      expect(subtitleBefore).toBe(subtitleAfter);
      expect(parentBtnBefore).toBe(parentBtnAfter);
      expect(childBtnBefore).toBe(childBtnAfter);
      expect(childCountBefore).toBe(childCountAfter);

      // Verify child interaction
      childBtnAfter.click();
      expect(childCountAfter!.textContent).toBe('1');

      // Verify parent interaction
      const parentCountDisplay = container.querySelector('.parent-count');
      parentBtnAfter.click();
      expect(parentCountDisplay!.textContent).toBe('1');
    });
  });
});
