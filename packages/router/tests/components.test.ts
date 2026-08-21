import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createRouter,
  createMemoryHistory,
  RouterView,
  RouterLink,
  Link,
  RouterContext,
} from '../src/index.js';
import { compile } from 'driftjs-compiler';
import { DriftClientVM } from 'driftjs-dom';

describe('Router Components (.drift SFC & VM Integration)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  // Home Component SFC
  const homeSrc = `
    <div class="home-page">
      <h1>Home Page</h1>
    </div>
  `;
  const Home = compile(homeSrc);

  // About Component SFC
  const aboutSrc = `
    <div class="about-page">
      <h1>About Us</h1>
    </div>
  `;
  const About = compile(aboutSrc);

  it('renders matched route component inside RouterView', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: [
        { path: '/', component: Home },
        { path: '/about', component: About },
      ],
    });
    await router.isReady();

    const appSrc = `
      <script>
        import { RouterContext } from '../src/router.js';
        RouterContext.provide(router);
      </script>
      <div class="app">
        <RouterView />
      </div>
    `;
    const App = compile(appSrc);
    (App as any).scope = {
      RouterContext,
      RouterView,
    };

    const vm = new DriftClientVM();
    const node = vm.execute(App, { scope: { router, RouterView, RouterContext }, document }) as HTMLElement;
    if (node) container.appendChild(node);

    expect(container.querySelector('.home-page')).toBeDefined();
    expect(container.querySelector('h1')?.textContent).toBe('Home Page');

    // Navigate to /about
    await router.push('/about');

    // Verify view swapped
    expect(container.querySelector('.about-page')).toBeDefined();
    expect(container.querySelector('h1')?.textContent).toBe('About Us');
  });

  it('handles nested route components with depth incrementation', async () => {
    // Child view for nested route
    const profileSrc = `
      <div class="user-profile">
        <p>User Profile Content</p>
      </div>
    `;
    const Profile = compile(profileSrc);

    // Parent layout containing a nested RouterView
    const userLayoutSrc = `
      <div class="user-layout">
        <h2>User Dashboard</h2>
        <RouterView />
      </div>
    `;
    const UserLayout = compile(userLayoutSrc);
    (UserLayout as any).scope = { RouterView };

    const history = createMemoryHistory('/user/profile');
    const router = createRouter({
      history,
      routes: [
        {
          path: '/user',
          component: UserLayout,
          children: [
            { path: 'profile', component: Profile },
          ],
        },
      ],
    });
    await router.isReady();

    const appSrc = `
      <script>
        import { RouterContext } from '../src/router.js';
        RouterContext.provide(router);
      </script>
      <div class="root">
        <RouterView />
      </div>
    `;
    const App = compile(appSrc);
    (App as any).scope = { RouterContext, RouterView };

    const vm = new DriftClientVM();
    const node = vm.execute(App, { scope: { router, RouterView, RouterContext }, document }) as HTMLElement;
    if (node) container.appendChild(node);

    expect(container.querySelector('.user-layout')).toBeDefined();
    expect(container.querySelector('.user-profile')).toBeDefined();
    expect(container.querySelector('p')?.textContent).toBe('User Profile Content');
  });

  it('renders RouterLink and Link with dynamic active class and handles clicks', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: [
        { path: '/', component: Home },
        { path: '/about', component: About },
      ],
    });
    await router.isReady();

    const navSrc = `
      <script>
        import { RouterContext } from '../src/router.js';
        RouterContext.provide(router);
      </script>
      <nav>
        <RouterLink to="/" label="Home" class="nav-item" />
        <RouterLink to="/about" label="About" class="nav-item" />
      </nav>
    `;
    const Nav = compile(navSrc);
    (Nav as any).scope = { RouterContext, RouterLink };

    const vm = new DriftClientVM();
    const node = vm.execute(Nav, { scope: { router, RouterLink, RouterContext }, document }) as HTMLElement;
    if (node) container.appendChild(node);

    const links = container.querySelectorAll('a');
    expect(links.length).toBe(2);

    const homeLink = links[0]!;
    const aboutLink = links[1]!;

    expect(homeLink.textContent?.trim()).toBe('Home');
    expect(homeLink.classList.contains('router-link-active')).toBe(true);
    expect(homeLink.classList.contains('router-link-exact-active')).toBe(true);

    expect(aboutLink.textContent?.trim()).toBe('About');
    expect(aboutLink.classList.contains('router-link-active')).toBe(false);

    // Click on About link
    aboutLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Router should navigate to /about
    expect(router.currentRoute.path).toBe('/about');
  });

  it('seamlessly updates DOM on multiple sequential route clicks without page reload', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const PageA = compile(`<div><span class="page-name">Page A</span></div>`);
    const PageB = compile(`<div><span class="page-name">Page B</span></div>`);
    const PageC = compile(`<div><span class="page-name">Page C</span></div>`);

    const history = createMemoryHistory('/a');
    const router = createRouter({
      history,
      routes: [
        { path: '/a', component: PageA },
        { path: '/b', component: PageB },
        { path: '/c', component: PageC },
      ],
    });
    await router.isReady();

    const appSrc = `
      <script>
        import { RouterContext, RouterView, RouterLink } from '../src/index.js';
        RouterContext.provide(router);
      </script>
      <div>
        <nav>
          <RouterLink to="/a" label="Go A" class="btn-a" />
          <RouterLink to="/b" label="Go B" class="btn-b" />
          <RouterLink to="/c" label="Go C" class="btn-c" />
        </nav>
        <main>
          <RouterView />
        </main>
      </div>
    `;
    const AppComp = compile(appSrc);
    (AppComp as any).scope = { RouterContext, RouterView, RouterLink, router };

    const vm = new DriftClientVM();
    const node = vm.execute(AppComp, { scope: { router, RouterView, RouterLink, RouterContext }, document }) as HTMLElement;
    if (node) container.appendChild(node);

    expect(container.querySelector('.page-name')?.textContent).toBe('Page A');

    // Click Go B
    const btnB = container.querySelector('.btn-b') as HTMLElement;
    btnB.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(router.currentRoute.path).toBe('/b');
    expect(container.querySelector('.page-name')?.textContent).toBe('Page B');

    // Click Go C
    const btnC = container.querySelector('.btn-c') as HTMLElement;
    btnC.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(router.currentRoute.path).toBe('/c');
    expect(container.querySelector('.page-name')?.textContent).toBe('Page C');

    // Click Go A
    const btnA = container.querySelector('.btn-a') as HTMLElement;
    btnA.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(router.currentRoute.path).toBe('/a');
    expect(container.querySelector('.page-name')?.textContent).toBe('Page A');
  });

  it('handles nested route transitions without blanking or corrupting parent views', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const Home = compile('<div class="home">Home Page</div>');
    const DocsIntro = compile('<div class="docs-intro">Intro Page</div>');
    const DocsVM = compile('<div class="docs-vm">VM Page</div>');
    const DocsLayout = compile(`
      <script>
        import { RouterView, RouterLink } from '../src/index.js';
      </script>
      <div class="docs-layout">
        <nav class="docs-nav">
          <RouterLink to="/docs/intro" label="Intro Link" class="link-docs-intro" />
          <RouterLink to="/docs/vm" label="VM Link" class="link-docs-vm" />
        </nav>
        <div class="docs-body">
          <RouterView />
        </div>
      </div>
    `);
    (DocsLayout as any).scope = { RouterView, RouterLink };

    const PioneersList = compile('<div class="pioneers-list">Pioneers Directory</div>');

    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: [
        { path: '/', component: Home },
        {
          path: '/docs',
          component: DocsLayout,
          children: [
            { path: 'intro', component: DocsIntro },
            { path: 'vm', component: DocsVM },
          ],
        },
        { path: '/pioneers', component: PioneersList },
      ],
    });
    await router.isReady();

    const appSrc = `
      <script>
        import { RouterContext, RouterView, RouterLink } from '../src/index.js';
        RouterContext.provide(router);
      </script>
      <div>
        <nav class="main-nav">
          <RouterLink to="/" label="Home" class="main-link-home" />
          <RouterLink to="/docs/intro" label="Docs" class="main-link-docs" />
          <RouterLink to="/pioneers" label="Pioneers" class="main-link-pioneers" />
        </nav>
        <main>
          <RouterView />
        </main>
      </div>
    `;
    const App = compile(appSrc);
    (App as any).scope = { RouterContext, RouterView, RouterLink, router };

    const vm = new DriftClientVM();
    const node = vm.execute(App, { scope: { router, RouterView, RouterLink, RouterContext }, document }) as HTMLElement;
    container.appendChild(node);

    expect(container.querySelector('.home')).not.toBeNull();

    // 1. Navigate to /docs/intro
    const mainDocs = container.querySelector('.main-link-docs') as HTMLElement;
    mainDocs.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.docs-layout')).not.toBeNull();
    expect(container.querySelector('.docs-intro')).not.toBeNull();

    // 2. Navigate to /docs/vm
    const linkDocsVm = container.querySelector('.link-docs-vm') as HTMLElement;
    linkDocsVm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.docs-layout')).not.toBeNull();
    expect(container.querySelector('.docs-vm')).not.toBeNull();
    expect(container.querySelector('.docs-intro')).toBeNull();

    // 3. Navigate to /pioneers
    const mainPioneers = container.querySelector('.main-link-pioneers') as HTMLElement;
    mainPioneers.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.pioneers-list')).not.toBeNull();
    expect(container.querySelector('.docs-layout')).toBeNull();

    // 4. Navigate back to /docs/intro
    const mainDocsAgain = container.querySelector('.main-link-docs') as HTMLElement;
    mainDocsAgain.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.docs-layout')).not.toBeNull();
    expect(container.querySelector('.docs-intro')).not.toBeNull();

    // 5. Navigate to Home
    const mainHome = container.querySelector('.main-link-home') as HTMLElement;
    mainHome.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.home')).not.toBeNull();
    expect(container.querySelector('.docs-layout')).toBeNull();
  });

  it('BUG-19 [Memory / Lifecycle]: RouterView unsubscribes from router when unmounted', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: [
        { path: '/', component: Home },
        { path: '/about', component: About },
      ],
    });
    await router.isReady();

    let subCount = 0;
    const originalSubscribe = router.subscribe.bind(router);
    router.subscribe = (cb: any) => {
      subCount++;
      const unsub = originalSubscribe(cb);
      return () => {
        subCount--;
        unsub();
      };
    };

    const vm = new DriftClientVM();
    vm.contextMap.set(RouterContext.id, router);
    const node = vm.execute(RouterView, { scope: { router, RouterContext }, document }) as HTMLElement;
    if (node) container.appendChild(node);

    expect(subCount).toBe(1);

    // Unmount VM
    vm.unmount();
    expect(subCount).toBe(0);
  });
});
