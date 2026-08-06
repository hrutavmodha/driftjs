// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouter } from '../Router.js';
import type { RouteLocation } from '../types.js';
import {
  HomePage,
  AboutPage,
  NotFoundPage,
  LayoutPage,
  DashboardOverview,
  DashboardSettings,
  compileComponent
} from './fixtures.js';

/** Waits for the router's in-flight async transition (guards + lazy import + render) to settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function resetDom(): void {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.replaceState(null, '', 'http://localhost:3000/');
}

describe('DriftRouter', () => {
  beforeEach(() => {
    resetDom();
  });

  describe('static navigation', () => {
    it('should mount the matching route component into the root element on boot', async () => {
      const router = createRouter({ routes: [{ path: '/', component: HomePage }] });
      await flush();

      expect(document.querySelector('#app')?.innerHTML).toContain('Home');
      router.destroy();
    });

    it('should navigate via push(), updating both the DOM and the URL', async () => {
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage }
        ]
      });
      await flush();

      await router.push('/about');
      await flush();

      expect(document.querySelector('#app')?.innerHTML).toContain('About');
      expect(window.location.pathname).toBe('/about');
      router.destroy();
    });

    it('should navigate via replace() without adding a new history entry', async () => {
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage }
        ]
      });
      await flush();
      const startLength = window.history.length;

      await router.replace('/about');
      await flush();

      expect(window.location.pathname).toBe('/about');
      expect(window.history.length).toBe(startLength);
      router.destroy();
    });
  });

  describe('dynamic params and query parsing', () => {
    it('should expose route params on currentRoute for /user/:id', async () => {
      const UserPage = compileComponent('<h1>User</h1>');
      const router = createRouter({ routes: [{ path: '/user/:id', component: UserPage }] });
      await router.push('/user/42');
      await flush();

      expect(router.currentRoute?.params).toEqual({ id: '42' });
      router.destroy();
    });

    it('should parse query params separately from path params', async () => {
      const ProductsPage = compileComponent('<h1>Products</h1>');
      const router = createRouter({ routes: [{ path: '/products', component: ProductsPage }] });
      await router.push('/products?page=2&sort=price');
      await flush();

      expect(router.currentRoute?.query).toEqual({ page: '2', sort: 'price' });
      router.destroy();
    });
  });

  describe('nested routes and layouts', () => {
    it('should mount a layout once and render children into its [data-drift-outlet]', async () => {
      const router = createRouter({
        routes: [
          {
            path: '/dashboard',
            component: LayoutPage,
            children: [
              { path: '', component: DashboardOverview },
              { path: 'settings', component: DashboardSettings }
            ]
          }
        ]
      });
      await router.push('/dashboard');
      await flush();

      const app = document.querySelector('#app')!;
      expect(app.querySelector('nav')?.textContent).toBe('Layout Nav');
      expect(app.querySelector('[data-drift-outlet]')?.textContent).toContain('Overview');
      router.destroy();
    });

    it('should reuse the layout VM (not remount it) when navigating between sibling children', async () => {
      const router = createRouter({
        routes: [
          {
            path: '/dashboard',
            component: LayoutPage,
            children: [
              { path: '', component: DashboardOverview },
              { path: 'settings', component: DashboardSettings }
            ]
          }
        ]
      });
      await router.push('/dashboard');
      await flush();
      const layoutNavBefore = document.querySelector('#app nav');

      await router.push('/dashboard/settings');
      await flush();

      const app = document.querySelector('#app')!;
      expect(app.querySelector('nav')).toBe(layoutNavBefore); // same DOM node instance, not remounted
      expect(app.querySelector('[data-drift-outlet]')?.textContent).toContain('Settings');
      router.destroy();
    });
  });

  describe('redirects and 404', () => {
    it('should follow a static redirect to its target route', async () => {
      const router = createRouter({
        routes: [
          { path: '/old', redirect: '/new' },
          { path: '/new', component: AboutPage }
        ]
      });
      await router.push('/old');
      await flush();

      expect(window.location.pathname).toBe('/new');
      expect(document.querySelector('#app')?.innerHTML).toContain('About');
      router.destroy();
    });

    it('should render the notFound route for an unmatched path', async () => {
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
        notFound: { path: '*', component: NotFoundPage }
      });
      await router.push('/nowhere');
      await flush();

      expect(document.querySelector('#app')?.innerHTML).toContain('Not Found');
      router.destroy();
    });
  });

  describe('route guards', () => {
    it('should block navigation when beforeEnter returns false', async () => {
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/private', component: AboutPage, beforeEnter: () => false }
        ]
      });
      await flush();

      await router.push('/private');
      await flush();

      expect(window.location.pathname).toBe('/');
      expect(document.querySelector('#app')?.innerHTML).toContain('Home');
      router.destroy();
    });

    it('should redirect when beforeEnter returns a path string', async () => {
      const router = createRouter({
        routes: [
          { path: '/login', component: AboutPage },
          { path: '/private', component: HomePage, beforeEnter: () => '/login' }
        ]
      });
      await router.push('/private');
      await flush();

      expect(window.location.pathname).toBe('/login');
      router.destroy();
    });

    it('should run global beforeEach guards before per-route beforeEnter', async () => {
      const order: string[] = [];
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          {
            path: '/guarded',
            component: AboutPage,
            beforeEnter: () => {
              order.push('route');
              return true;
            }
          }
        ]
      });
      router.beforeEach((to: RouteLocation) => {
        order.push('global');
        return true;
      });
      await flush();

      await router.push('/guarded');
      await flush();

      expect(order).toEqual(['global', 'route']);
      router.destroy();
    });

    it('should invoke afterEach hooks once navigation commits', async () => {
      const spy = vi.fn();
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage }
        ]
      });
      router.afterEach(spy);
      await flush();

      await router.push('/about');
      await flush();

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[spy.mock.calls.length - 1]![0].path).toBe('/about');
      router.destroy();
    });
  });

  describe('lazy loading', () => {
    it('should mount a component from a lazy () => import()-style loader', async () => {
      const LazyPage = compileComponent('<h1>Lazy Loaded</h1>');
      const loader = vi.fn(async () => ({ default: LazyPage }));

      const router = createRouter({
        routes: [{ path: '/lazy', component: loader }]
      });
      await router.push('/lazy');
      await flush();

      expect(loader).toHaveBeenCalledTimes(1);
      expect(document.querySelector('#app')?.innerHTML).toContain('Lazy Loaded');
      router.destroy();
    });

    it('should only invoke a lazy loader once across repeated visits (cached)', async () => {
      const LazyPage = compileComponent('<h1>Cached</h1>');
      const loader = vi.fn(async () => ({ default: LazyPage }));

      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/lazy', component: loader }
        ]
      });
      await flush();

      await router.push('/lazy');
      await flush();
      await router.push('/');
      await flush();
      await router.push('/lazy');
      await flush();

      expect(loader).toHaveBeenCalledTimes(1);
      router.destroy();
    });

    it('should warm the loader cache via prefetch() without mounting', async () => {
      const LazyPage = compileComponent('<h1>Prefetched</h1>');
      const loader = vi.fn(async () => ({ default: LazyPage }));

      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/lazy', component: loader }
        ]
      });
      await flush();

      router.prefetch('/lazy');
      await flush();

      expect(loader).toHaveBeenCalledTimes(1);
      expect(document.querySelector('#app')?.innerHTML).toContain('Home'); // not mounted yet
      router.destroy();
    });
  });

  describe('resolve()', () => {
    it('should resolve a path to a RouteLocation without navigating', async () => {
      const router = createRouter({ routes: [{ path: '/user/:id', component: HomePage }] });
      await flush();

      const location = router.resolve('/user/9?tab=info');
      expect(location?.params).toEqual({ id: '9' });
      expect(location?.query).toEqual({ tab: 'info' });
      expect(window.location.pathname).toBe('/'); // unaffected
      router.destroy();
    });
  });

  describe('scroll restoration', () => {
    it('should scroll to top on a forward push navigation by default', async () => {
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage }
        ]
      });
      await flush();
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

      await router.push('/about');
      await flush();

      expect(scrollSpy).toHaveBeenCalledWith(0, 0);
      scrollSpy.mockRestore();
      router.destroy();
    });

    it('should skip scrolling entirely when scrollBehavior is "manual"', async () => {
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage }
        ],
        scrollBehavior: 'manual'
      });
      await flush();
      const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

      await router.push('/about');
      await flush();

      expect(scrollSpy).not.toHaveBeenCalled();
      scrollSpy.mockRestore();
      router.destroy();
    });
  });

  describe('browser history integration', () => {
    it('should navigate back to the previous route on popstate after back()', async () => {
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage }
        ]
      });
      await flush();

      await router.push('/about');
      await flush();
      expect(window.location.pathname).toBe('/about');

      router.back();
      await flush();
      await flush();

      expect(window.location.pathname).toBe('/');
      expect(document.querySelector('#app')?.innerHTML).toContain('Home');
      router.destroy();
    });
  });
});
