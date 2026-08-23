/**
 * Type definitions for driftjs-router.
 */

export type RouteParams = Record<string, string | string[]>;
export type RouteQuery = Record<string, string | null | (string | null)[] | undefined>;


export interface ScrollPositionCoordinates {
  left?: number | undefined;
  top?: number | undefined;
  behavior?: ScrollBehavior | undefined;
}

export interface ScrollPositionElement {
  el: string | Element;
  behavior?: ScrollBehavior | undefined;
}

export type ScrollPosition = ScrollPositionCoordinates | ScrollPositionElement;

export type RouterScrollBehavior = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  savedPosition: ScrollPositionCoordinates | null
) => ScrollPosition | Promise<ScrollPosition> | false | void | null;

export type RouteComponent = any; // CompiledModule | (() => Promise<any>)

export interface RouteRecordRaw {
  path: string;
  name?: string | undefined;
  component?: RouteComponent | undefined;
  components?: Record<string, RouteComponent> | undefined;
  redirect?: string | RouteLocationRaw | ((to: RouteLocation) => string | RouteLocationRaw) | undefined;
  children?: RouteRecordRaw[] | undefined;
  meta?: Record<string | number | symbol, any> | undefined;
  beforeEnter?: NavigationGuard | NavigationGuard[] | undefined;
  props?: boolean | Record<string, any> | ((route: RouteLocationNormalized) => Record<string, any>) | undefined;
}

export interface RouteRecordNormalized {
  path: string;
  name?: string | undefined;
  components: Record<string, RouteComponent>;
  children: RouteRecordNormalized[];
  meta: Record<string | number | symbol, any>;
  beforeEnter?: NavigationGuard[] | undefined;
  props: Record<string, boolean | Record<string, any> | ((route: RouteLocationNormalized) => Record<string, any>)>;
  parent?: RouteRecordNormalized | undefined;
  regex: RegExp;
  paramNames: string[];
  score?: number | undefined;
  redirect?: string | RouteLocationRaw | ((to: RouteLocation) => string | RouteLocationRaw) | undefined;
}

export type MatchedRoute = RouteRecordNormalized;

export interface RouteLocation {
  path: string;
  fullPath: string;
  query: RouteQuery;
  hash: string;
  params: RouteParams;
  name?: string | undefined;
  matched: RouteRecordNormalized[];
  meta: Record<string | number | symbol, any>;
  redirectedFrom?: RouteLocation | undefined;
}

export interface RouteLocationNormalized extends RouteLocation {
  href: string;
}

export interface RouteLocationOptions {
  path?: string | undefined;
  name?: string | undefined;
  params?: RouteParams | undefined;
  query?: RouteQuery | undefined;
  hash?: string | undefined;
  replace?: boolean | undefined;
  state?: HistoryState | undefined;
  force?: boolean | undefined;
}

export type RouteLocationRaw = string | RouteLocationOptions;

export type HistoryState = Record<string, any> | null;

export type NavigationDirection = 'forward' | 'back' | 'unknown';

export interface NavigationInformation {
  direction: NavigationDirection;
  delta: number;
  type: 'pop' | 'push' | 'replace';
}

export type NavigationCallback = (to: string, from: string, information: NavigationInformation) => void;

export interface RouterHistory {
  readonly base: string;
  readonly location: string;
  readonly state: HistoryState;
  listen(callback: NavigationCallback): () => void;
  push(to: string, data?: HistoryState): void;
  replace(to: string, data?: HistoryState): void;
  go(delta: number): void;
  destroy(): void;
}

export type HistoryLocation = string;

export enum NavigationFailureType {
  aborted = 4,
  cancelled = 8,
  duplicated = 16,
}

export interface NavigationFailure extends Error {
  type: NavigationFailureType;
  from: RouteLocationNormalized;
  to: RouteLocationNormalized;
}

export type NavigationGuardReturn = void | boolean | string | RouteLocationRaw | Error;

export type NavigationGuardNext = (valid?: boolean | string | RouteLocationRaw | Error) => void;

export type NavigationGuard = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  next: NavigationGuardNext
) => NavigationGuardReturn | Promise<NavigationGuardReturn>;

export type NavigationHookAfter = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  failure?: NavigationFailure | void
) => any;

export interface RouterOptions {
  history: RouterHistory;
  routes: readonly RouteRecordRaw[];
  scrollBehavior?: RouterScrollBehavior | undefined;
  linkActiveClass?: string | undefined;
  linkExactActiveClass?: string | undefined;
}

export interface Router {
  readonly currentRoute: RouteLocationNormalized;
  readonly options: RouterOptions;
  push(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined>;
  replace(to: RouteLocationRaw): Promise<NavigationFailure | void | undefined>;
  go(delta: number): void;
  back(): void;
  forward(): void;
  beforeEach(guard: NavigationGuard): () => void;
  beforeResolve(guard: NavigationGuard): () => void;
  afterEach(hook: NavigationHookAfter): () => void;
  onError(handler: (error: any) => void): () => void;
  isReady(): Promise<void>;
  resolve(to: RouteLocationRaw, currentLocation?: RouteLocationNormalized): RouteLocationNormalized;
  addRoute(parentOrRoute: string | RouteRecordRaw, route?: RouteRecordRaw): () => void;
  removeRoute(name: string): void;
  hasRoute(name: string): boolean;
  getRoutes(): RouteRecordNormalized[];
  subscribe(callback: (to: RouteLocationNormalized, from: RouteLocationNormalized) => void): () => void;
  destroy(): void;
}

export interface RouterViewProps {
  name?: string | undefined;
  route?: RouteLocationNormalized | undefined;
}

export interface RouterLinkProps {
  to: RouteLocationRaw;
  replace?: boolean | undefined;
  activeClass?: string | undefined;
  exactActiveClass?: string | undefined;
  custom?: boolean | undefined;
  target?: string | undefined;
  rel?: string | undefined;
  class?: string | undefined;
}
