import { describe, it, expect, vi } from 'vitest';
import { createRouter, createMemoryHistory, createMatcher } from '../src/index.js';
import type { RouteRecordRaw } from '../types/index.js';

describe('DriftJS Router - Reproduction Test Cases for Identified Bugs', () => {
  // BUG-13: Rebuilding route index after adding nested routes erases dynamically added top-level routes
  it('BUG-13 [Correctness]: addRoute(parent, route) does not erase previously added dynamic top-level routes', () => {
    const initialRoutes: RouteRecordRaw[] = [
      { path: '/', name: 'home', component: { bytecode: [], constants: [] } },
    ];

    const router = createRouter({
      history: createMemoryHistory('/'),
      routes: initialRoutes,
    });

    // 1. Add a dynamic top-level route
    router.addRoute({
      path: '/about',
      name: 'about',
      component: { bytecode: [], constants: [] },
    });

    expect(router.hasRoute('about')).toBe(true);

    // 2. Add a dynamic nested route to 'about' (this invokes rebuildIndex())
    router.addRoute('about', {
      path: 'team',
      name: 'about-team',
      component: { bytecode: [], constants: [] },
    });

    // Expected true behavior: 'about' is still in the router
    // Buggy current behavior: rebuildIndex() clears nameMap and only rebuilds from initial `routes`,
    // so 'about' is deleted from nameMap!
    expect(router.hasRoute('about')).toBe(true);
    expect(router.hasRoute('about-team')).toBe(true);
  });

  // BUG-14: Router navigation abort with history.go on popstate
  it('BUG-14 [Correctness]: popstate navigation abort provides non-zero delta to revert history', async () => {
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

    // Add a guard that blocks leaving /protected
    router.beforeEach((to, from) => {
      if (to.path === '/') {
        return false; // Abort navigation
      }
    });

    // Simulate clicking back button
    router.back();

    // Expected true behavior: navigation is aborted and router stays on /protected
    expect(router.currentRoute.path).toBe('/protected');
  });
});
