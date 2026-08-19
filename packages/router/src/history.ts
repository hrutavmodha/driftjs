import type {
  RouterHistory,
  HistoryState,
  NavigationCallback,
  NavigationInformation,
  NavigationDirection,
} from '../types/index.js';

/**
 * Normalizes a base URL to ensure consistent leading and no redundant trailing slashes.
 */
export function normalizeBase(base?: string): string {
  if (!base) return '';
  let normalized = base.trim();
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized === '/' ? '' : normalized;
}

/**
 * Strips the base path from the beginning of a pathname.
 */
export function stripBase(pathname: string, base: string): string {
  if (!base) return pathname;
  if (pathname.startsWith(base)) {
    const stripped = pathname.slice(base.length);
    return stripped.startsWith('/') ? stripped : '/' + stripped;
  }
  return pathname;
}

/**
 * Constructs a full URL href by combining the base path with the location.
 */
export function createHref(base: string, location: string): string {
  const normLoc = location.startsWith('/') ? location : '/' + location;
  return base ? base + normLoc : normLoc;
}

/**
 * Creates an HTML5 History API driver (BrowserHistory).
 */
export function createWebHistory(base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base);
  const listeners: NavigationCallback[] = [];

  const getFullLocation = (): string => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname + window.location.search + window.location.hash;
  };

  const getLocation = (): string => {
    return stripBase(getFullLocation(), normalizedBase) || '/';
  };

  let currentLocation = getLocation();
  let currentState: HistoryState = (typeof window !== 'undefined' && window.history.state) || null;

  const popstateListener = (_event: PopStateEvent) => {
    const from = currentLocation;
    const to = getLocation();
    currentLocation = to;
    currentState = (typeof window !== 'undefined' && window.history.state) || null;

    const info: NavigationInformation = {
      direction: 'unknown',
      delta: 0,
      type: 'pop',
    };

    for (const listener of listeners) {
      listener(to, from, info);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', popstateListener);
  }

  return {
    get base(): string {
      return normalizedBase;
    },
    get location(): string {
      return getLocation();
    },
    get state(): HistoryState {
      return currentState;
    },
    listen(callback: NavigationCallback): () => void {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    push(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = createHref(normalizedBase, to);
      const stateObj = data || {};
      window.history.pushState(stateObj, '', href);
      currentLocation = to;
      currentState = stateObj;
    },
    replace(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = createHref(normalizedBase, to);
      const stateObj = data || {};
      window.history.replaceState(stateObj, '', href);
      currentLocation = to;
      currentState = stateObj;
    },
    go(delta: number): void {
      if (typeof window !== 'undefined') {
        window.history.go(delta);
      }
    },
    destroy(): void {
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', popstateListener);
      }
      listeners.length = 0;
    },
  };
}

/**
 * Creates a Hash history driver (HashHistory).
 */
export function createWebHashHistory(base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base);
  const listeners: NavigationCallback[] = [];

  const getHashLocation = (): string => {
    if (typeof window === 'undefined') return '/';
    const hash = window.location.hash;
    if (!hash || hash === '#') return '/';
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    return raw.startsWith('/') ? raw : '/' + raw;
  };

  let currentLocation = getHashLocation();
  let currentState: HistoryState = (typeof window !== 'undefined' && window.history.state) || null;

  const changeListener = (_event: Event) => {
    const to = getHashLocation();
    if (to === currentLocation) return;
    const from = currentLocation;
    currentLocation = to;
    currentState = (typeof window !== 'undefined' && window.history.state) || null;

    const info: NavigationInformation = {
      direction: 'unknown',
      delta: 0,
      type: 'pop',
    };

    for (const listener of listeners) {
      listener(to, from, info);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', changeListener);
    window.addEventListener('hashchange', changeListener);
  }

  const formatHashHref = (location: string): string => {
    const cleanLoc = location.startsWith('/') ? location : '/' + location;
    return (normalizedBase ? normalizedBase : '') + '#' + cleanLoc;
  };

  return {
    get base(): string {
      return normalizedBase;
    },
    get location(): string {
      return getHashLocation();
    },
    get state(): HistoryState {
      return currentState;
    },
    listen(callback: NavigationCallback): () => void {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    push(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = formatHashHref(to);
      const stateObj = data || {};
      window.history.pushState(stateObj, '', href);
      currentLocation = to;
      currentState = stateObj;
    },
    replace(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = formatHashHref(to);
      const stateObj = data || {};
      window.history.replaceState(stateObj, '', href);
      currentLocation = to;
      currentState = stateObj;
    },
    go(delta: number): void {
      if (typeof window !== 'undefined') {
        window.history.go(delta);
      }
    },
    destroy(): void {
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', changeListener);
        window.removeEventListener('hashchange', changeListener);
      }
      listeners.length = 0;
    },
  };
}

/**
 * Creates an in-memory history driver (MemoryHistory) for headless, SSR, and unit test environments.
 */
export function createMemoryHistory(initialLocation: string = '/', base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base);
  const entries: string[] = [initialLocation.startsWith('/') ? initialLocation : '/' + initialLocation];
  const states: HistoryState[] = [null];
  let index = 0;
  const listeners: NavigationCallback[] = [];

  return {
    get base(): string {
      return normalizedBase;
    },
    get location(): string {
      return entries[index] ?? '/';
    },
    get state(): HistoryState {
      return states[index] ?? null;
    },
    listen(callback: NavigationCallback): () => void {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    push(to: string, data?: HistoryState): void {
      const normTo = to.startsWith('/') ? to : '/' + to;
      // Truncate any forward history
      entries.splice(index + 1);
      states.splice(index + 1);
      entries.push(normTo);
      states.push(data || null);
      index++;
    },
    replace(to: string, data?: HistoryState): void {
      const normTo = to.startsWith('/') ? to : '/' + to;
      entries[index] = normTo;
      states[index] = data || null;
    },
    go(delta: number): void {
      const from = entries[index] ?? '/';
      const targetIndex = index + delta;
      if (targetIndex >= 0 && targetIndex < entries.length) {
        index = targetIndex;
        const to = entries[index] ?? '/';
        const direction: NavigationDirection = delta > 0 ? 'forward' : delta < 0 ? 'back' : 'unknown';
        const info: NavigationInformation = {
          direction,
          delta,
          type: 'pop',
        };
        for (const listener of listeners) {
          listener(to, from, info);
        }
      }
    },
    destroy(): void {
      listeners.length = 0;
      entries.length = 0;
      states.length = 0;
      index = 0;
    },
  };
}
