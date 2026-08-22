import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory, createMatcher, RouterLink, RouterContext } from '../src/index.js';
import type { RouteRecordRaw } from '../types/index.js';
import { DriftClientVM } from 'driftjs-dom';

describe('DriftJS Router - Reproduction Test Cases', () => {
  it('addRoute(parent, route) does not erase previously added dynamic top-level routes', () => {
    const initialRoutes: RouteRecordRaw[] = [
      { path: '/', name: 'home', component: { bytecode: [], constants: [] } },
    ];

    const router = createRouter({
      history: createMemoryHistory('/'),
      routes: initialRoutes,
    });

    router.addRoute({
      path: '/about',
      name: 'about',
      component: { bytecode: [], constants: [] },
    });

    expect(router.hasRoute('about')).toBe(true);

    router.addRoute('about', {
      path: 'team',
      name: 'about-team',
      component: { bytecode: [], constants: [] },
    });

    expect(router.hasRoute('about')).toBe(true);
    expect(router.hasRoute('about-team')).toBe(true);
  });

  it('popstate navigation abort provides non-zero delta to revert history', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: [
        { path: '/', name: 'home', component: { bytecode: [], constants: [] } },
        { path: '/protected', name: 'protected', component: { bytecode: [], constants: [] } },
      ],
    });

    await router.push('/protected');
    expect(router.currentRoute.path).toBe('/protected');

    router.beforeEach((to, from) => {
      if (to.path === '/') {
        return false;
      }
    });

    router.back();
    expect(router.currentRoute.path).toBe('/protected');
  });

  it('RouterLink does not apply active class when route path is merely a substring prefix', async () => {
    const history = createMemoryHistory('/users');
    const router = createRouter({
      history,
      routes: [
        { path: '/user', name: 'user', component: { bytecode: [], constants: [] } },
        { path: '/users', name: 'users', component: { bytecode: [], constants: [] } },
      ],
    });
    await router.isReady();

    const container = document.createElement('div');
    const vm = new DriftClientVM();
    vm.contextMap.set(RouterContext.id, router);

    const node = vm.execute(RouterLink, {
      scope: {
        router,
        RouterContext,
        props: { to: '/user', label: 'User Profile' },
      },
      document,
    }) as HTMLElement;
    container.appendChild(node);

    const link = container.querySelector('a')!;
    expect(link.classList.contains('router-link-active')).toBe(false);

    vm.unmount();
  });

  it('resolve() interpolates named route params without corrupting regex constraint tokens', () => {
    const matcher = createMatcher([
      {
        path: '/user/:id(\\d+)',
        name: 'user-detail',
        component: { bytecode: [], constants: [] },
      },
    ]);

    const resolved = matcher.resolve({
      name: 'user-detail',
      params: { id: '123' },
    });

    expect(resolved.path).toBe('/user/123');
  });

  it('RouterLink updates active class when route changes after initial render', async () => {
    const history = createMemoryHistory('/');
    const router = createRouter({
      history,
      routes: [
        { path: '/', name: 'home', component: { bytecode: [], constants: [] } },
        { path: '/about', name: 'about', component: { bytecode: [], constants: [] } },
      ],
    });
    await router.isReady();

    const container = document.createElement('div');
    const vm = new DriftClientVM();
    vm.contextMap.set(RouterContext.id, router);

    const node = vm.execute(RouterLink, {
      scope: {
        router,
        RouterContext,
        props: { to: '/about', label: 'About Page' },
      },
      document,
    }) as HTMLElement;
    container.appendChild(node);

    const link = container.querySelector('a')!;
    expect(link.classList.contains('router-link-active')).toBe(false);

    // Navigate to /about
    await router.push('/about');

    expect(link.classList.contains('router-link-active')).toBe(true);

    vm.unmount();
  });

  it('createMemoryHistory strips normalized base from initialLocation', () => {
    const history = createMemoryHistory('/app/dashboard', '/app');
    expect(history.location).toBe('/dashboard');
  });

  it('resolve() correctly interpolates route params with nested regex groups', () => {
    const matcher = createMatcher([
      {
        path: '/order/:id((a|b)+)',
        name: 'order-detail',
        component: { bytecode: [], constants: [] },
      },
    ]);

    const resolved = matcher.resolve({
      name: 'order-detail',
      params: { id: 'aba' },
    });

    expect(resolved.path).toBe('/order/aba');
  });
});
