import type { CompiledModule } from 'driftjs-compiler';
import type {
  HydrationStrategy,
  IdleHydrationOptions,
  VisibleHydrationOptions,
  InteractionHydrationOptions,
  MediaHydrationOptions,
  SelectiveHydrationOptions,
  SelectiveHydrationController,
  IslandHydrationOptions,
  IslandHydrationResult,
  BaseHydrationOptions,
} from '../types/index.js';
import { DriftClientVM, hydrate } from './index.js';

const DEFAULT_INTERACTION_EVENTS: readonly string[] = [
  'pointerenter',
  'pointerover',
  'click',
  'focusin',
  'touchstart',
  'keydown',
];

/**
 * Hydrates an SSR-rendered component during browser idle periods using requestIdleCallback.
 */
export function hydrateOnIdle(
  component: CompiledModule,
  container: HTMLElement,
  options: IdleHydrationOptions = {}
): SelectiveHydrationController<DriftClientVM> {
  let vmInstance: DriftClientVM | null = null;
  let isHydrated = false;
  let idleId: any = null;
  let timerId: any = null;
  let resolveReady: (vm: DriftClientVM) => void;
  const ready = new Promise<DriftClientVM>((resolve) => {
    resolveReady = resolve;
  });

  const cleanupPending = () => {
    if (idleId !== null && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleId);
      idleId = null;
    }
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const doHydrate = (): DriftClientVM => {
    if (isHydrated && vmInstance) {
      return vmInstance;
    }
    cleanupPending();
    isHydrated = true;
    vmInstance = hydrate(component, container, options);
    resolveReady(vmInstance);
    return vmInstance;
  };

  const timeout = options.timeout ?? 2000;

  if (typeof requestIdleCallback !== 'undefined') {
    idleId = requestIdleCallback(
      () => {
        idleId = null;
        doHydrate();
      },
      { timeout }
    );
  } else {
    timerId = setTimeout(() => {
      timerId = null;
      doHydrate();
    }, Math.min(timeout, 50));
  }

  return {
    get vm() {
      return vmInstance;
    },
    get isHydrated() {
      return isHydrated;
    },
    ready,
    hydrateNow: doHydrate,
    cancel: () => {
      cleanupPending();
    },
    unmount: () => {
      cleanupPending();
      if (vmInstance) {
        vmInstance.unmount();
        vmInstance = null;
        isHydrated = false;
      }
    },
  };
}

/**
 * Defers subtree hydration until the container element enters the viewport using IntersectionObserver.
 */
export function hydrateWhenVisible(
  component: CompiledModule,
  container: HTMLElement,
  options: VisibleHydrationOptions = {}
): SelectiveHydrationController<DriftClientVM> {
  let vmInstance: DriftClientVM | null = null;
  let isHydrated = false;
  let observer: IntersectionObserver | null = null;
  let timerId: any = null;
  let resolveReady: (vm: DriftClientVM) => void;
  const ready = new Promise<DriftClientVM>((resolve) => {
    resolveReady = resolve;
  });

  const cleanupPending = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const doHydrate = (): DriftClientVM => {
    if (isHydrated && vmInstance) {
      return vmInstance;
    }
    cleanupPending();
    isHydrated = true;
    vmInstance = hydrate(component, container, options);
    resolveReady(vmInstance);
    return vmInstance;
  };

  if (typeof IntersectionObserver !== 'undefined') {
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              cleanupPending();
              doHydrate();
              break;
            }
          }
        },
        {
          root: options.root ?? null,
          rootMargin: options.rootMargin ?? '0px',
          threshold: options.threshold ?? 0,
        }
      );
      observer.observe(container);
    } catch {
      // Fallback if observer initialization fails
      timerId = setTimeout(() => {
        timerId = null;
        doHydrate();
      }, 0);
    }
  } else {
    // Fallback in environments without IntersectionObserver
    timerId = setTimeout(() => {
      timerId = null;
      doHydrate();
    }, 0);
  }

  return {
    get vm() {
      return vmInstance;
    },
    get isHydrated() {
      return isHydrated;
    },
    ready,
    hydrateNow: doHydrate,
    cancel: () => {
      cleanupPending();
    },
    unmount: () => {
      cleanupPending();
      if (vmInstance) {
        vmInstance.unmount();
        vmInstance = null;
        isHydrated = false;
      }
    },
  };
}

/**
 * Defers hydration until the user first interacts with the container (hover, click, touch, focus, keydown).
 * Once the user interacts, the container is hydrated in capture phase so the in-flight event
 * naturally reaches the newly attached DriftJS event handlers.
 */
export function hydrateOnInteraction(
  component: CompiledModule,
  container: HTMLElement,
  options: InteractionHydrationOptions = {}
): SelectiveHydrationController<DriftClientVM> {
  let vmInstance: DriftClientVM | null = null;
  let isHydrated = false;
  let timerId: any = null;
  let resolveReady: (vm: DriftClientVM) => void;
  const ready = new Promise<DriftClientVM>((resolve) => {
    resolveReady = resolve;
  });

  const events = options.events ?? DEFAULT_INTERACTION_EVENTS;

  const removeListeners = () => {
    for (const evtName of events) {
      container.removeEventListener(evtName, handleInteraction, true);
    }
  };

  const cleanupPending = () => {
    removeListeners();
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const doHydrate = (): DriftClientVM => {
    if (isHydrated && vmInstance) {
      return vmInstance;
    }
    cleanupPending();
    isHydrated = true;
    vmInstance = hydrate(component, container, options);
    resolveReady(vmInstance);
    return vmInstance;
  };

  function handleInteraction(e: Event): void {
    if ((e as any).__drift_replayed__) {
      return;
    }

    cleanupPending();
    doHydrate();
  }

  for (const evtName of events) {
    container.addEventListener(evtName, handleInteraction, { capture: true, passive: true });
  }

  if (options.timeout && options.timeout > 0) {
    timerId = setTimeout(() => {
      timerId = null;
      doHydrate();
    }, options.timeout);
  }

  return {
    get vm() {
      return vmInstance;
    },
    get isHydrated() {
      return isHydrated;
    },
    ready,
    hydrateNow: doHydrate,
    cancel: () => {
      cleanupPending();
    },
    unmount: () => {
      cleanupPending();
      if (vmInstance) {
        vmInstance.unmount();
        vmInstance = null;
        isHydrated = false;
      }
    },
  };
}

/**
 * Hydrates when a CSS media query matches (e.g. '(min-width: 768px)').
 */
export function hydrateOnMedia(
  component: CompiledModule,
  container: HTMLElement,
  query: string,
  options: BaseHydrationOptions = {}
): SelectiveHydrationController<DriftClientVM> {
  let vmInstance: DriftClientVM | null = null;
  let isHydrated = false;
  let mql: MediaQueryList | null = null;
  let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
  let resolveReady: (vm: DriftClientVM) => void;
  const ready = new Promise<DriftClientVM>((resolve) => {
    resolveReady = resolve;
  });

  const cleanupPending = () => {
    if (mql && mediaListener) {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', mediaListener);
      } else if (typeof (mql as any).removeListener === 'function') {
        (mql as any).removeListener(mediaListener);
      }
      mediaListener = null;
      mql = null;
    }
  };

  const doHydrate = (): DriftClientVM => {
    if (isHydrated && vmInstance) {
      return vmInstance;
    }
    cleanupPending();
    isHydrated = true;
    vmInstance = hydrate(component, container, options);
    resolveReady(vmInstance);
    return vmInstance;
  };

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mql = window.matchMedia(query);
    if (mql.matches) {
      doHydrate();
    } else {
      mediaListener = (e: MediaQueryListEvent) => {
        if (e.matches) {
          cleanupPending();
          doHydrate();
        }
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', mediaListener);
      } else if (typeof (mql as any).addListener === 'function') {
        (mql as any).addListener(mediaListener);
      }
    }
  } else {
    // Fallback: hydrate immediately if matchMedia is unavailable
    doHydrate();
  }

  return {
    get vm() {
      return vmInstance;
    },
    get isHydrated() {
      return isHydrated;
    },
    ready,
    hydrateNow: doHydrate,
    cancel: () => {
      cleanupPending();
    },
    unmount: () => {
      cleanupPending();
      if (vmInstance) {
        vmInstance.unmount();
        vmInstance = null;
        isHydrated = false;
      }
    },
  };
}

/**
 * Universal Selective Hydration entry point. Dispatches to the chosen trigger strategy.
 */
export function hydrateSelectively(
  component: CompiledModule,
  container: HTMLElement,
  options: SelectiveHydrationOptions = {}
): SelectiveHydrationController<DriftClientVM> {
  const trigger = options.trigger ?? 'eager';

  if (typeof trigger === 'function') {
    let vmInstance: DriftClientVM | null = null;
    let isHydrated = false;
    let resolveReady: (vm: DriftClientVM) => void;
    const ready = new Promise<DriftClientVM>((resolve) => {
      resolveReady = resolve;
    });

    const doHydrate = (): DriftClientVM => {
      if (isHydrated && vmInstance) {
        return vmInstance;
      }
      isHydrated = true;
      vmInstance = hydrate(component, container, options);
      resolveReady(vmInstance);
      return vmInstance;
    };

    const cleanup = trigger(doHydrate);

    return {
      get vm() {
        return vmInstance;
      },
      get isHydrated() {
        return isHydrated;
      },
      ready,
      hydrateNow: doHydrate,
      cancel: () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      },
      unmount: () => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
        if (vmInstance) {
          vmInstance.unmount();
          vmInstance = null;
          isHydrated = false;
        }
      },
    };
  }

  switch (trigger) {
    case 'idle':
      return hydrateOnIdle(component, container, {
        ...options,
        timeout: options.idleTimeout ?? options.timeout,
      });
    case 'visible':
      return hydrateWhenVisible(component, container, {
        ...options,
        rootMargin: options.rootMargin,
        threshold: options.threshold,
        root: options.root,
      });
    case 'interaction':
      return hydrateOnInteraction(component, container, {
        ...options,
        events: options.events,
        replayEvent: options.replayEvent,
        timeout: options.timeout,
      });
    case 'media':
      return hydrateOnMedia(
        component,
        container,
        options.media ?? '(min-width: 0px)',
        options
      );
    case 'eager':
    default: {
      let isHydrated = true;
      let vmInstance: DriftClientVM | null = hydrate(component, container, options);
      return {
        get vm() {
          return vmInstance;
        },
        get isHydrated() {
          return isHydrated;
        },
        ready: Promise.resolve(vmInstance),
        hydrateNow: () => vmInstance ?? hydrate(component, container, options),
        cancel: () => {},
        unmount: () => {
          isHydrated = false;
          if (vmInstance) {
            vmInstance.unmount();
            vmInstance = null;
          }
        },
      };
    }
  }
}

/**
 * Scans a DOM container or document for islands matching [data-drift-island]
 * and hydra-gates them with their specified selective hydration triggers.
 */
export function hydrateIslands(
  root: HTMLElement | Document = typeof document !== 'undefined' ? document : (null as any),
  components: Record<string, CompiledModule>,
  options: IslandHydrationOptions = {}
): IslandHydrationResult<DriftClientVM> {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return {
      controllers: [],
      hydrateAll: async () => [],
      cancelAll: () => {},
    };
  }

  const islandElements = root.querySelectorAll<HTMLElement>('[data-drift-island]');
  const controllers: SelectiveHydrationController<DriftClientVM>[] = [];

  for (let i = 0; i < islandElements.length; i++) {
    const el = islandElements[i]!;
    const name = el.getAttribute('data-drift-island');
    if (!name) continue;

    const comp = components[name];
    if (!comp) {
      console.warn(`[DriftJS] No compiled component found for island "${name}"`);
      continue;
    }

    const triggerAttr = el.getAttribute('data-drift-trigger') as HydrationStrategy | null;
    const trigger: HydrationStrategy = triggerAttr ?? options.defaultTrigger ?? 'idle';

    let props: Record<string, any> = {};
    const rawProps = el.getAttribute('data-drift-props');
    if (rawProps) {
      try {
        props = JSON.parse(rawProps);
      } catch (err) {
        console.warn(`[DriftJS] Failed to parse data-drift-props for island "${name}":`, err);
      }
    }

    const rawTimeout = el.getAttribute('data-drift-timeout');
    const timeout = rawTimeout ? parseInt(rawTimeout, 10) : undefined;
    const media = el.getAttribute('data-drift-media') ?? undefined;
    const rootMargin = el.getAttribute('data-drift-root-margin') ?? undefined;

    const controller = hydrateSelectively(comp, el, {
      trigger,
      idleTimeout: timeout,
      timeout,
      media,
      rootMargin,
      scope: { ...options.globalScope, props, ...props },
    });

    controllers.push(controller);
  }

  return {
    controllers,
    hydrateAll: async () => {
      return controllers.map((ctrl) => ctrl.hydrateNow());
    },
    cancelAll: () => {
      for (const ctrl of controllers) {
        ctrl.cancel();
      }
    },
  };
}
