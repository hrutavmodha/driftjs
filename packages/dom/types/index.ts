export * from '../../compiler/types/opcodes.js';

export enum VMMode {
  MOUNT = 0,
  UPDATE = 1,
}

export interface VMExecutionOptions {
  readonly scope?: Record<string, any> | undefined;
  readonly document?: Document | undefined;
  readonly container?: HTMLElement | undefined;
  readonly hydrate?: boolean | undefined;
  readonly cursor?: any | undefined;
}

/** A self-contained reactive region that re-renders its DOM subtree when deps change. */
export interface ReactiveRegion {
  readonly deps: ReadonlySet<string>;
  readonly reRender: () => void;
  childRegions?: ReactiveRegion[] | undefined;
  parentNode?: Node | undefined;
  startAnchor?: Node | undefined;
  endAnchor?: Node | undefined;
}

/** Describes an active running side-effect instance tracked by DriftClientVM. */
export interface RunningEffect {
  readonly deps: readonly string[];
  readonly exprConst?: any;
  readonly rawFn?: (() => void | (() => void) | Promise<any>) | undefined;
  cleanup?: (() => void) | void | undefined;
  isDirty: boolean;
  isMountOnly?: boolean | undefined;
}

export type HydrationStrategy = 'eager' | 'idle' | 'visible' | 'interaction' | 'media';

export interface BaseHydrationOptions extends VMExecutionOptions {
  readonly document?: Document | undefined;
  readonly scope?: Record<string, any> | undefined;
}

export interface IdleHydrationOptions extends BaseHydrationOptions {
  /** Maximum wait time in milliseconds before forcing hydration (default: 2000) */
  readonly timeout?: number | undefined;
}

export interface VisibleHydrationOptions extends BaseHydrationOptions {
  /** Viewport margin around root (e.g. '200px') */
  readonly rootMargin?: string | undefined;
  /** Intersection threshold (0.0 to 1.0) */
  readonly threshold?: number | number[] | undefined;
  /** Optional root container for IntersectionObserver */
  readonly root?: Element | Document | null | undefined;
}

export interface InteractionHydrationOptions extends BaseHydrationOptions {
  /** Event names that trigger hydration (default: ['pointerenter', 'pointerover', 'click', 'focusin', 'touchstart', 'keydown']) */
  readonly events?: readonly string[] | undefined;
  /** Whether to replay the triggering user interaction on the hydrated element (default: true) */
  readonly replayEvent?: boolean | undefined;
  /** Optional fallback timeout in milliseconds */
  readonly timeout?: number | undefined;
}

export interface MediaHydrationOptions extends BaseHydrationOptions {
  /** CSS media query string (e.g. '(min-width: 768px)') */
  readonly mediaQuery?: string | undefined;
}

export interface SelectiveHydrationOptions extends BaseHydrationOptions {
  /** Hydration trigger strategy or custom hydration trigger callback */
  readonly trigger?: HydrationStrategy | ((hydrateFn: () => any) => (() => void) | void) | undefined;
  /** Idle timeout in ms (for 'idle' trigger) */
  readonly idleTimeout?: number | undefined;
  /** Visible options (for 'visible' trigger) */
  readonly rootMargin?: string | undefined;
  readonly threshold?: number | number[] | undefined;
  readonly root?: Element | Document | null | undefined;
  /** Interaction options (for 'interaction' trigger) */
  readonly events?: readonly string[] | undefined;
  readonly replayEvent?: boolean | undefined;
  /** Timeout in ms (for 'interaction' or fallback) */
  readonly timeout?: number | undefined;
  /** Media query string (for 'media' trigger) */
  readonly media?: string | undefined;
}

export interface SelectiveHydrationController<TVM = any> {
  /** The hydrated VM instance, or null if not yet hydrated */
  readonly vm: TVM | null;
  /** Whether hydration has completed */
  readonly isHydrated: boolean;
  /** Promise resolving to the VM instance once hydration completes */
  readonly ready: Promise<TVM>;
  /** Forces immediate hydration, cancelling any pending triggers */
  readonly hydrateNow: () => TVM;
  /** Cancels pending scheduled hydration trigger */
  readonly cancel: () => void;
  /** Unmounts the VM and cleans up any observers or listeners */
  readonly unmount: () => void;
}

export interface IslandHydrationOptions {
  /** Root container to search for island elements (default: document) */
  readonly root?: HTMLElement | Document | undefined;
  /** Fallback trigger strategy if not specified on island attribute (default: 'idle') */
  readonly defaultTrigger?: HydrationStrategy | undefined;
  /** Additional global scope variables passed into all island VMs */
  readonly globalScope?: Record<string, any> | undefined;
}

export interface IslandHydrationResult<TVM = any> {
  /** List of all initialized island controllers */
  readonly controllers: readonly SelectiveHydrationController<TVM>[];
  /** Hydrate all remaining pending islands immediately */
  readonly hydrateAll: () => Promise<TVM[]>;
  /** Cancel all pending island triggers and unmount active island VMs */
  readonly cancelAll: () => void;
}
