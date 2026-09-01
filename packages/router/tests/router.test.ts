import { describe, it, expect, vi } from 'vitest';
import {
  createRouter,
  createMemoryHistory,
  RouterContext,
  RouteContext,
  RouterDepthContext,
  isNavigationFailure,
} from '../src/index.js';
import { NavigationFailureType, type RouteRecordRaw } from '../types/index.js';
import { DriftClientVM } from 'driftjs-dom';
import { compile } from 'driftjs-compiler';

describe('Router Core & Lifecycle Engine (driftjs-router)', () => {
  const dummyComp = { bytecode: new Uint32Array(), constants: [] };

  const baseRoutes: RouteRecordRaw[] = [
    { path: '/', name: 'home', component: dummyComp },
    { path: '/about', name: 'about', component: dummyComp },
    { path: '/login', name: 'login', component: dummyComp },
    {
      path: '/admin',
      name: 'admin',
      component: dummyComp,
      beforeEnter: (to, from) => {
        if (to.query.auth !== 'true') {
          return '/login';
        }
        return true;
      },
    },
    {
      path: '/old-home',
      redirect: '/',
    },
  ];

  it('initializes router and settles isReady() promise', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: baseRoutes,
    });

    await router.isReady();
    expect(router.currentRoute.path).toBe('/');
    expect(router.currentRoute.name).toBe('home');
  });

  it('navigates via router.push() and router.replace()', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    await router.push('/about');
    expect(router.currentRoute.path).toBe('/about');
    expect(router.currentRoute.name).toBe('about');

    await router.replace('/login');
    expect(router.currentRoute.path).toBe('/login');
  });

  it('returns duplicated failure when navigating to identical location', async () => {
    const history = createMemoryHistory('/about');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    const failure = await router.push('/about');
    expect(isNavigationFailure(failure, NavigationFailureType.duplicated)).toBe(true);
  });

  it('executes beforeEach guards to allow or abort navigation', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    let allowNav = true;
    router.beforeEach((to, from) => {
      if (!allowNav) {
        return false; // Abort
      }
      return true;
    });

    await router.push('/about');
    expect(router.currentRoute.path).toBe('/about');

    allowNav = false;
    const failure = await router.push('/login');
    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true);
    expect(router.currentRoute.path).toBe('/about'); // Still at /about
  });

  it('executes beforeEach guards to redirect navigation', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    router.beforeEach((to) => {
      if (to.path === '/secret') {
        return '/login';
      }
    });

    router.addRoute({ path: '/secret', name: 'secret', component: dummyComp });

    await router.push('/secret');
    expect(router.currentRoute.path).toBe('/login');
  });

  it('supports async beforeEach guards returning promises', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    router.beforeEach(async (to, from) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return true;
    });

    await router.push('/about');
    expect(router.currentRoute.path).toBe('/about');
  });

  it('executes route-specific beforeEnter guards', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    // /admin without auth query -> redirects to /login
    await router.push('/admin');
    expect(router.currentRoute.path).toBe('/login');

    // /admin with ?auth=true -> allowed
    await router.push('/admin?auth=true');
    expect(router.currentRoute.path).toBe('/admin');
  });

  it('handles route record level redirect option', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    await router.push('/old-home');
    expect(router.currentRoute.path).toBe('/');
  });

  it('resolves async lazy component modules', async () => {
    const history = createMemoryHistory('/');
    const asyncCompLoader = vi.fn().mockResolvedValue({ default: dummyComp });

    const routesWithAsync: RouteRecordRaw[] = [
      { path: '/', component: dummyComp },
      { path: '/lazy', component: asyncCompLoader },
    ];

    const router = createRouter({ history, routes: routesWithAsync });
    await router.isReady();

    await router.push('/lazy');
    expect(asyncCompLoader).toHaveBeenCalled();
    expect(router.currentRoute.path).toBe('/lazy');
  });

  it('cancels older navigation when a newer navigation is dispatched concurrently', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    router.beforeEach(async (to) => {
      if (to.path === '/slow') {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return true;
    });

    router.addRoute({ path: '/slow', component: dummyComp });

    const nav1Promise = router.push('/slow');
    const nav2Promise = router.push('/about');

    const [res1, res2] = await Promise.all([nav1Promise, nav2Promise]);

    expect(isNavigationFailure(res1, NavigationFailureType.cancelled)).toBe(true);
    expect(res2).toBeUndefined();
    expect(router.currentRoute.path).toBe('/about');
  });

  it('triggers afterEach hooks and subscribers on navigation commit', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });
    await router.isReady();

    const afterHook = vi.fn();
    const subscriber = vi.fn();

    router.afterEach(afterHook);
    router.subscribe(subscriber);

    await router.push('/about');

    expect(afterHook).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0]?.[0]?.path).toBe('/about');
  });

  it('provides and injects RouterContext and RouteContext via DriftJS Context API', () => {
    const history = createMemoryHistory('/');
    const router = createRouter({ history, routes: baseRoutes });

    const parentSrc = `
      <script>
        import { RouterContext } from '../src/router.js';
        RouterContext.provide(router);
      </script>
      <div><Child /></div>
    `;
    const childSrc = `
      <script>
        import { RouterContext } from '../src/router.js';
        let r = RouterContext.inject();
        let path = r ? r.currentRoute.path : '';
      </script>
      <span>{path}</span>
    `;

    const childMod = compile(childSrc);
    (childMod as any).scope = { RouterContext };

    const parentMod = compile(parentSrc);
    (parentMod as any).scope = { RouterContext, Child: childMod };

    const vm = new DriftClientVM();
    const node = vm.execute(parentMod, { scope: { router, Child: childMod, RouterContext }, document }) as HTMLElement;
    expect(node).toBeDefined();
    expect(node.querySelector('span')?.textContent).toBe('/');
  });
});

