import type { DriftJSComponent } from '@driftjs/runtime';
import type { MatchResult, RouteLocation, RouteRecord } from './types.js';

const resolvedCache = new WeakMap<RouteRecord, Promise<DriftJSComponent>>();

/**
 * Resolves a route record's `component` into a `DriftJSComponent`, transparently
 * awaiting lazy `() => import('./Page.drift')` loaders exactly once per record
 * (the resulting promise is cached so repeated visits/prefetches are free).
 */
export function resolveComponent(record: RouteRecord): Promise<DriftJSComponent> | null {
  if (!record.component) return null;

  const cached = resolvedCache.get(record);
  if (cached) return cached;

  const promise = (async (): Promise<DriftJSComponent> => {
    const comp = record.component!;
    const loaded = typeof comp === 'function' ? await comp() : comp;
    return 'default' in loaded ? loaded.default : loaded;
  })();

  resolvedCache.set(record, promise);
  return promise;
}

/** Eagerly kicks off (and caches) a lazy component's import without mounting it. */
export function prefetchComponent(record: RouteRecord): void {
  void resolveComponent(record);
}

/** Builds the fully-resolved `RouteLocation` handed to guards and exposed as `router.currentRoute`. */
export function buildLocation(
  path: string,
  search: string,
  hash: string,
  match: MatchResult
): RouteLocation {
  const leaf = match.chain[match.chain.length - 1];
  return {
    path,
    fullPath: `${path}${search}${hash}`,
    params: match.params,
    query: Object.fromEntries(new URLSearchParams(search)),
    hash,
    matched: match.chain,
    name: leaf?.name
  };
}

/** Resolves a redirect target, which may be a static string or a function of the destination. */
export function resolveRedirect(
  redirect: string | ((to: RouteLocation) => string),
  to: RouteLocation
): string {
  return typeof redirect === 'function' ? redirect(to) : redirect;
}
