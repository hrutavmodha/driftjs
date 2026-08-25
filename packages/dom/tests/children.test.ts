import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { compile } from '../../compiler/src/index.js';

describe('Custom Component Children Slot Reactivity ({children})', () => {
  it('renders children slot inside a custom component template using {children}', () => {
    const cardSfc = `
      <div class="card">
        <h2 class="title">{title}</h2>
        <div class="card-body">
          {children}
        </div>
      </div>
    `;

    const appSfc = `
      <script>
        import Card from './Card.drift';
      </script>
      <div class="app">
        <Card title="Analytics Card">
          <p class="stats">Active Users: 500</p>
        </Card>
      </div>
    `;

    const cardModule = compile(cardSfc);
    const appModule = compile(appSfc);

    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vm.execute(appModule, {
      scope: {
        Card: cardModule
      },
      document,
    });
    if (root) container.appendChild(root);

    expect(container.querySelector('.title')?.textContent).toBe('Analytics Card');
    expect(container.querySelector('.card-body .stats')?.textContent).toBe('Active Users: 500');

    vm.unmount();
    document.body.removeChild(container);
  });

  it('allows accessing children directly inside child component <script> while keeping props separate', () => {
    const childSfc = `
      <script>
        let hasChildren = derive(() => Boolean(children));
        let isChildInProps = derive(() => Boolean(props && 'children' in props));
      </script>
      <div class="wrapper">
        <span class="has-children">{hasChildren ? 'Yes' : 'No'}</span>
        <span class="props-has-children">{isChildInProps ? 'InProps' : 'NotInProps'}</span>
        <div class="content">{children}</div>
      </div>
    `;

    const appSfc = `
      <script>
        import CustomWrapper from './CustomWrapper.drift';
      </script>
      <div>
        <CustomWrapper customProp="testValue">
          <span class="slotted">Slotted Text</span>
        </CustomWrapper>
      </div>
    `;

    const childModule = compile(childSfc);
    const appModule = compile(appSfc);

    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vm.execute(appModule, {
      scope: { CustomWrapper: childModule },
      document,
    });
    if (root) container.appendChild(root);

    expect(container.querySelector('.has-children')?.textContent).toBe('Yes');
    expect(container.querySelector('.props-has-children')?.textContent).toBe('NotInProps');
    expect(container.querySelector('.content .slotted')?.textContent).toBe('Slotted Text');

    vm.unmount();
    document.body.removeChild(container);
  });

  it('reactively updates parent bindings rendered inside {children}', async () => {
    const layoutSfc = `
      <div class="layout">
        <header>Header</header>
        <main>{children}</main>
      </div>
    `;

    const appSfc = `
      <script>
        import Layout from './Layout.drift';
        let count = 5;
        function inc() {
          count++;
        }
      </script>
      <div>
        <Layout>
          <span class="count-display">{count}</span>
          <button id="inc-btn" onclick={inc}>Increment</button>
        </Layout>
      </div>
    `;

    const layoutModule = compile(layoutSfc);
    const appModule = compile(appSfc);

    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);

    const root = vm.execute(appModule, {
      scope: { Layout: layoutModule },
      document,
    });
    if (root) container.appendChild(root);

    expect(container.querySelector('.count-display')?.textContent).toBe('5');

    const btn = container.querySelector('#inc-btn') as HTMLButtonElement;
    btn.click();

    await new Promise((r) => setTimeout(r, 10));

    expect(container.querySelector('.count-display')?.textContent).toBe('6');

    vm.unmount();
    document.body.removeChild(container);
  });
});
