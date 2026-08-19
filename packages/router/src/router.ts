import { createContext, type Context } from 'driftjs-shared';
import type {
  Router,
  RouterOptions,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteRecordRaw,
  RouteRecordNormalized,
  NavigationGuard,
  NavigationGuardReturn,
  NavigationHookAfter,
  NavigationFailure,
  RouterHistory,
  ScrollPosition,
} from '../types/index.js';
import { NavigationFailureType } from '../types/index.js';
import { createMatcher, type RouteMatcher } from './matcher.js';
import { createHref } from './history.js';

/**
 * Native DriftJS Context tokens for router and route injection.
 */
export const RouterContext: Context<Router> = createContext<Router>(undefined, 'DriftRouter');
export const RouteContext: Context<() => RouteLocationNormalized> = createContext<() => RouteLocationNormalized>(
  undefined,
  'DriftRoute'
);
export const RouterDepthContext: Context<number> = createContext<number>(0, 'DriftRouterDepth');

export const START_LOCATION_NORMALIZED: RouteLocationNormalized = Object.freeze({
  path: '/',
  fullPath: '/',
  query: {},
  hash: '',
  params: {},
  name: undefined,
  matched: [],
  meta: {},
  href: '/',
});

/**
 * Creates a custom NavigationFailure error.
 */
export function createNavigationFailure(
  type: NavigationFailureType,
  from: RouteLocationNormalized,
  to: RouteLocationNormalized,
  message?: string
): NavigationFailure {
  let defaultMsg = 'Navigation failed';
  if (type === NavigationFailureType.aborted) {
    defaultMsg = `Navigation aborted from "${from.fullPath}" to "${to.fullPath}" via a navigation guard.`;
  } else if (type === NavigationFailureType.cancelled) {
    defaultMsg = `Navigation cancelled from "${from.fullPath}" to "${to.fullPath}" with a newer navigation.`;
  } else if (type === NavigationFailureType.duplicated) {
    defaultMsg = `Avoided redundant navigation to current location: "${to.fullPath}".`;
  }

  const err = new Error(message || defaultMsg) as NavigationFailure;
  err.name = 'NavigationFailure';
  err.type = type;
  err.from = from;
  err.to = to;
  return err;
}

/**
 * Determines if a value is a NavigationFailure.
 */
export function isNavigationFailure(error: any, type?: NavigationFailureType): error is NavigationFailure {
  if (!error || typeof error !== 'object') return false;
  if (error.name !== 'NavigationFailure' || typeof error.type !== 'number') return false;
  if (type !== undefined) return error.type === type;
  return true;
}

/**
 * Resolves async component modules if defined as `() => import(...)`.
 */
async function resolveAsyncComponents(matched: RouteLocationNormalized['matched']): Promise<void> {
  for (const record of matched) {
    for (const key of Object.keys(record.components)) {
      const comp = record.components[key];
      if (typeof comp === 'function' && !('__drift_fn__' in comp) && !comp.bytecode) {
        try {
          const resolved = await comp();
          record.components[key] = resolved?.default || resolved;
        } catch (e) {
          // Keep raw or log error
        }
      }
    }
  }
}

/**
 * Executes a sequence of navigation guards.
 */
async function runGuardQueue(
  guards: NavigationGuard[],
  to: RouteLocationNormalized,
  from: RouteLocationNormalized
): Promise<NavigationGuardReturn> {
  for (const guard of guards) {
    let guardRes: NavigationGuardReturn;
    let nextCalled = false;
    let nextResult: NavigationGuardReturn = undefined;

    const next = (res?: boolean | string | RouteLocationRaw | Error) => {
      nextCalled = true;
      nextResult = res;
    };

    try {
      const returned = guard(to, from, next);
      if (returned instanceof Promise) {
        guardRes = await returned;
      } else {
        guardRes = returned;
      }
    } catch (err: any) {
      return err instanceof Error ? err : new Error(String(err));
    }

    if (nextCalled) {
      if (nextResult !== undefined && nextResult !== true) {
        return nextResult;
      }
    } else if (guardRes !== undefined && guardRes !== true) {
      return guardRes;
    }
  }
  return true;
}

/**
 * Creates the client-side SPA router instance.
 */
export function createRouter(options: RouterOptions): Router {
  const { history, routes, scrollBehavior, linkActiveClass, linkExactActiveClass } = options;
  const matcher: RouteMatcher = createMatcher(routes);

  const beforeEachGuards: NavigationGuard[] = [];
  const beforeResolveGuards: NavigationGuard[] = [];
  const afterEachHooks: NavigationHookAfter[] = [];
  const errorHandlers: ((error: any) => void)[] = [];
  const subscribers: ((to: RouteLocationNormalized, from: RouteLocationNormalized) => void)[] = [];

  let currentRoute: RouteLocationNormalized = START_LOCATION_NORMALIZED;
  let isReadyPromise: Promise<void> | null = null;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((err: any) => void) | null = null;

  isReadyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  let navigationToken = 0;

  function triggerError(err: any): void {
    if (errorHandlers.length > 0) {
      for (const handler of errorHandlers) {
        handler(err);
      }
    } else {
      // Unhandled router error
    }
  }

  function handleScroll(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    savedPosition: any
  ): void {
    if (typeof window === 'undefined' || !scrollBehavior) return;

    try {
      const pos = scrollBehavior(to, from, savedPosition);
      if (!pos) return;

      const applyPos = (scrollPos: ScrollPosition) => {
        if ('el' in scrollPos) {
          const el = typeof scrollPos.el === 'string' ? document.querySelector(scrollPos.el) : scrollPos.el;
          if (el) {
            el.scrollIntoView({ behavior: scrollPos.behavior || 'auto' });
          }
        } else {
          window.scrollTo({
            left: scrollPos.left ?? window.scrollX,
            top: scrollPos.top ?? window.scrollY,
            behavior: scrollPos.behavior || 'auto',
          });
        }
      };

      if (pos instanceof Promise) {
        pos.then((resolvedPos) => {
          if (resolvedPos) applyPos(resolvedPos);
        });
      } else {
        applyPos(pos);
      }
    } catch (e) {
      // Ignore scroll errors
    }
  }

  async function pushWithGuards(
    to: RouteLocationRaw,
    isReplace: boolean = false,
    isPop: boolean = false
  ): Promise<NavigationFailure | void | undefined> {
    const targetRoute = matcher.resolve(to, currentRoute);
    const fromRoute = currentRoute;

    // Handle Route Redirects
    if (targetRoute.matched.length > 0) {
      const leaf = targetRoute.matched[targetRoute.matched.length - 1]!;
      if (leaf.redirect) {
        const redirectTarget =
          typeof leaf.redirect === 'function' ? leaf.redirect(targetRoute) : leaf.redirect;
        return pushWithGuards(redirectTarget, true, isPop);
      }
    }

    // Check for redundant navigation
    if (fromRoute.fullPath === targetRoute.fullPath && fromRoute !== START_LOCATION_NORMALIZED) {
      const failure = createNavigationFailure(NavigationFailureType.duplicated, fromRoute, targetRoute);
      return failure;
    }

    const currentNavToken = ++navigationToken;

    // 1. Collect guards
    const guards: NavigationGuard[] = [...beforeEachGuards];

    // Matched route beforeEnter guards
    for (const record of targetRoute.matched) {
      if (record.beforeEnter) {
        guards.push(...record.beforeEnter);
      }
    }

    // 2. Run beforeEach & beforeEnter guards
    const guardRes = await runGuardQueue(guards, targetRoute, fromRoute);

    if (currentNavToken !== navigationToken) {
      return createNavigationFailure(NavigationFailureType.cancelled, fromRoute, targetRoute);
    }

    if (guardRes === false) {
      return createNavigationFailure(NavigationFailureType.aborted, fromRoute, targetRoute);
    }

    if (guardRes instanceof Error) {
      triggerError(guardRes);
      return createNavigationFailure(NavigationFailureType.aborted, fromRoute, targetRoute, guardRes.message);
    }

    if (typeof guardRes === 'string' || (typeof guardRes === 'object' && guardRes !== null)) {
      return pushWithGuards(guardRes, isReplace, isPop);
    }

    // 3. Resolve async components
    try {
      await resolveAsyncComponents(targetRoute.matched);
    } catch (err) {
      triggerError(err);
      return createNavigationFailure(NavigationFailureType.aborted, fromRoute, targetRoute, String(err));
    }

    if (currentNavToken !== navigationToken) {
      return createNavigationFailure(NavigationFailureType.cancelled, fromRoute, targetRoute);
    }

    // 4. Run beforeResolve guards
    if (beforeResolveGuards.length > 0) {
      const resolveGuardRes = await runGuardQueue(beforeResolveGuards, targetRoute, fromRoute);
      if (currentNavToken !== navigationToken) {
        return createNavigationFailure(NavigationFailureType.cancelled, fromRoute, targetRoute);
      }
      if (resolveGuardRes === false) {
        return createNavigationFailure(NavigationFailureType.aborted, fromRoute, targetRoute);
      }
      if (resolveGuardRes instanceof Error) {
        triggerError(resolveGuardRes);
        return createNavigationFailure(NavigationFailureType.aborted, fromRoute, targetRoute, resolveGuardRes.message);
      }
      if (typeof resolveGuardRes === 'string' || (typeof resolveGuardRes === 'object' && resolveGuardRes !== null)) {
        return pushWithGuards(resolveGuardRes, isReplace, isPop);
      }
    }

    // 5. Commit navigation
    if (!isPop) {
      if (isReplace) {
        history.replace(targetRoute.fullPath);
      } else {
        history.push(targetRoute.fullPath);
      }
    }

    const prevRoute = currentRoute;
    currentRoute = Object.freeze(targetRoute);

    // 6. Scroll restoration
    handleScroll(currentRoute, prevRoute, history.state);

    // 7. afterEach hooks
    for (const hook of afterEachHooks) {
      try {
        hook(currentRoute, prevRoute);
      } catch (err) {
        triggerError(err);
      }
    }

    // 8. Notify subscribers
    for (const subscriber of subscribers) {
      try {
        subscriber(currentRoute, prevRoute);
      } catch (err) {
        triggerError(err);
      }
    }

    return undefined;
  }

  // Synchronize history popstate / back / forward events
  const unlistenHistory = history.listen(async (to, _from, info) => {
    const isPop = info.type === 'pop';
    const failure = await pushWithGuards(to, false, isPop);
    if (failure && isNavigationFailure(failure, NavigationFailureType.aborted)) {
      // Revert history position if aborted
      if (info.delta) {
        history.go(-info.delta);
      }
    }
  });

  // Initial navigation
  const initialLoc = history.location || '/';
  pushWithGuards(initialLoc, true, true)
    .then(() => {
      if (readyResolve) readyResolve();
    })
    .catch((err) => {
      if (readyReject) readyReject(err);
      triggerError(err);
    });

  const router: Router = {
    get currentRoute(): RouteLocationNormalized {
      return currentRoute;
    },
    get options(): RouterOptions {
      return options;
    },
    push(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined> {
      return pushWithGuards(to, false);
    },
    replace(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined> {
      return pushWithGuards(to, true);
    },
    go(delta: number): void {
      history.go(delta);
    },
    back(): void {
      history.go(-1);
    },
    forward(): void {
      history.go(1);
    },
    beforeEach(guard: NavigationGuard): () => void {
      beforeEachGuards.push(guard);
      return () => {
        const idx = beforeEachGuards.indexOf(guard);
        if (idx !== -1) beforeEachGuards.splice(idx, 1);
      };
    },
    beforeResolve(guard: NavigationGuard): () => void {
      beforeResolveGuards.push(guard);
      return () => {
        const idx = beforeResolveGuards.indexOf(guard);
        if (idx !== -1) beforeResolveGuards.splice(idx, 1);
      };
    },
    afterEach(hook: NavigationHookAfter): () => void {
      afterEachHooks.push(hook);
      return () => {
        const idx = afterEachHooks.indexOf(hook);
        if (idx !== -1) afterEachHooks.splice(idx, 1);
      };
    },
    onError(handler: (error: any) => void): () => void {
      errorHandlers.push(handler);
      return () => {
        const idx = errorHandlers.indexOf(handler);
        if (idx !== -1) errorHandlers.splice(idx, 1);
      };
    },
    isReady(): Promise<void> {
      return isReadyPromise!;
    },
    resolve(to: RouteLocationRaw, currentLocation?: RouteLocationNormalized): RouteLocationNormalized {
      return matcher.resolve(to, currentLocation || currentRoute);
    },
    addRoute(parentOrRoute: string | RouteRecordRaw, route?: RouteRecordRaw): () => void {
      return matcher.addRoute(parentOrRoute, route);
    },
    removeRoute(name: string): void {
      matcher.removeRoute(name);
    },
    hasRoute(name: string): boolean {
      return matcher.hasRoute(name);
    },
    getRoutes(): RouteRecordNormalized[] {
      return matcher.getRoutes();
    },
    subscribe(callback: (to: RouteLocationNormalized, from: RouteLocationNormalized) => void): () => void {
      subscribers.push(callback);
      return () => {
        const idx = subscribers.indexOf(callback);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    },
    destroy(): void {
      unlistenHistory();
      beforeEachGuards.length = 0;
      beforeResolveGuards.length = 0;
      afterEachHooks.length = 0;
      errorHandlers.length = 0;
      subscribers.length = 0;
      history.destroy();
    },
  };

  return router;
}
