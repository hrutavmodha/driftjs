import type { DriftJSComponent } from '@driftjs/runtime';

/**
 * A component reference accepted by a route: either an already-compiled
 * DriftJSComponent module, or a lazy loader returning one (dynamic `import()`).
 */
export type RouteComponent =
  | DriftJSComponent
  | (() => Promise<DriftJSComponent | { default: DriftJSComponent }>);

/** Parsed key/value maps produced while resolving a URL against the route tree. */
export type RouteParams = Record<string, string>;
export type RouteQuery = Record<string, string>;

/** Result a `beforeEnter` guard may return. */
export type GuardResult = boolean | string | RouteLocationInput | void;

export interface RouteLocationInput {
  path: string;
  query?: RouteQuery;
  hash?: string;
  replace?: boolean;
}

export type RouteGuard = (
  to: RouteLocation,
  from: RouteLocation | null
) => GuardResult | Promise<GuardResult>;

/**
 * Public shape used to declare a route when calling `createRouter()`.
 */
export interface RouteDefinition {
  path: string;
  name?: string | undefined;
  component?: RouteComponent | undefined;
  redirect?: string | ((to: RouteLocation) => string) | undefined;
  children?: RouteDefinition[];
  beforeEnter?: RouteGuard | undefined;
  meta?: Record<string, unknown>;
}

/**
 * Internal, normalized representation of a `RouteDefinition` produced by
 * `normalizeRoutes()`. Adds tree-linking (`parent`) used to walk chains and
 * a stable per-node id used as an identity key when diffing mounted segments.
 */
export interface RouteRecord {
  id: number;
  path: string;
  name?: string | undefined;
  component?: RouteComponent | undefined;
  redirect?: string | ((to: RouteLocation) => string) | undefined;
  children: RouteRecord[];
  beforeEnter?: RouteGuard | undefined;
  meta: Record<string, unknown>;
  parent: RouteRecord | null;
}

/** Result of matching a pathname's segments against the route tree. */
export interface MatchResult {
  chain: RouteRecord[];
  params: RouteParams;
}

/**
 * Fully resolved location, passed into guards and exposed as `router.currentRoute`.
 */
export interface RouteLocation {
  path: string;
  fullPath: string;
  params: RouteParams;
  query: RouteQuery;
  hash: string;
  matched: RouteRecord[];
  name?: string | undefined;
}

export type RoutingMode = 'history' | 'hash';

export type ScrollPosition = { left: number; top: number };
export type ScrollBehaviorHandler = (
  to: RouteLocation,
  from: RouteLocation | null,
  savedPosition: ScrollPosition | null
) => ScrollPosition | void;

export interface RouterOptions {
  routes: RouteDefinition[];
  /** Root element (or selector) the top-level route is mounted into. Defaults to `#app`. */
  root?: HTMLElement | string;
  /** History strategy. Defaults to `'history'` (pushState/popstate). */
  mode?: RoutingMode;
  /** Base path prefix stripped from/prepended to all URLs, e.g. `/app`. */
  base?: string;
  /** Route rendered when no other route matches. Overrides a `path: '*'` route if both exist. */
  notFound?: RouteDefinition;
  /** `'auto'` restores saved position on back/forward and scrolls to top on push; `'manual'` disables it. */
  scrollBehavior?: 'auto' | 'manual' | ScrollBehaviorHandler;
  /** Automatically intercept clicks on `[data-drift-link]` anchors. Defaults to `true`. */
  linkInterception?: boolean;
}

export interface NavigationOptions {
  replace?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __driftRoute: RouteLocation | undefined;
}
