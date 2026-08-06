export { DriftRouter, createRouter } from './Router.js';
export { DriftHistory } from './History.js';
export type { HistoryLocation, NavigationAction, HistoryListener } from './History.js';
export { matchRoute, normalizeRoutes, parseQuery, stringifyQuery } from './Matcher.js';
export { resolveComponent, prefetchComponent, buildLocation, resolveRedirect } from './Route.js';
export { installLinkInterception, shouldIntercept, isExternal } from './Link.js';
export type {
  RouteComponent,
  RouteParams,
  RouteQuery,
  GuardResult,
  RouteLocationInput,
  RouteGuard,
  RouteDefinition,
  RouteRecord,
  MatchResult,
  RouteLocation,
  RoutingMode,
  ScrollPosition,
  ScrollBehaviorHandler,
  RouterOptions,
  NavigationOptions
} from './types.js';
