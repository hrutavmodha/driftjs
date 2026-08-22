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
  let currentPos = (typeof window !== 'undefined' && window.history.state && typeof window.history.state.__drift_pos === 'number')
    ? window.history.state.__drift_pos
    : 0;

  if (typeof window !== 'undefined' && (window.history.state == null || typeof window.history.state.__drift_pos !== 'number')) {
    const existing = window.history.state || {};
    window.history.replaceState({ ...existing, __drift_pos: currentPos }, '', createHref(normalizedBase, currentLocation));
  }

  const popstateListener = (event: PopStateEvent) => {
    const from = currentLocation;
    const to = getLocation();
    currentLocation = to;

    const state = (typeof window !== 'undefined' && window.history.state) || event.state || null;
    const newPos = (state && typeof state.__drift_pos === 'number') ? state.__drift_pos : currentPos;
    const delta = newPos - currentPos;
    currentPos = newPos;

    const direction: NavigationDirection = delta > 0 ? 'forward' : delta < 0 ? 'back' : 'unknown';

    const info: NavigationInformation = {
      direction,
      delta,
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
      if (typeof window === 'undefined') return null;
      const s = window.history.state;
      if (!s || typeof s !== 'object') return s ?? null;
      const { __drift_pos, __drift_has_data, ...rest } = s;
      return (Object.keys(rest).length > 0 || __drift_has_data) ? rest : null;
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
      currentPos++;
      const href = createHref(normalizedBase, to);
      const stateObj = { ...(data || {}), __drift_pos: currentPos, ...(data !== undefined ? { __drift_has_data: true } : {}) };
      window.history.pushState(stateObj, '', href);
      currentLocation = to;
    },
    replace(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = createHref(normalizedBase, to);
      const stateObj = { ...(data || {}), __drift_pos: currentPos, ...(data !== undefined ? { __drift_has_data: true } : {}) };
      window.history.replaceState(stateObj, '', href);
      currentLocation = to;
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

  const formatHashHref = (location: string): string => {
    const cleanLoc = location.startsWith('/') ? location : '/' + location;
    return (normalizedBase ? normalizedBase : '') + '#' + cleanLoc;
  };

  let currentLocation = getHashLocation();
  let currentPos = (typeof window !== 'undefined' && window.history.state && typeof window.history.state.__drift_pos === 'number')
    ? window.history.state.__drift_pos
    : 0;

  if (typeof window !== 'undefined' && (window.history.state == null || typeof window.history.state.__drift_pos !== 'number')) {
    const existing = window.history.state || {};
    window.history.replaceState({ ...existing, __drift_pos: currentPos }, '', formatHashHref(currentLocation));
  }

  const changeListener = (_event: Event) => {
    const to = getHashLocation();
    if (to === currentLocation) return;
    const from = currentLocation;
    currentLocation = to;

    const state = (typeof window !== 'undefined' && window.history.state) || null;
    const newPos = (state && typeof state.__drift_pos === 'number') ? state.__drift_pos : currentPos;
    const delta = newPos - currentPos;
    currentPos = newPos;

    const direction: NavigationDirection = delta > 0 ? 'forward' : delta < 0 ? 'back' : 'unknown';

    const info: NavigationInformation = {
      direction,
      delta,
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

  return {
    get base(): string {
      return normalizedBase;
    },
    get location(): string {
      return getHashLocation();
    },
    get state(): HistoryState {
      if (typeof window === 'undefined') return null;
      const s = window.history.state;
      if (!s || typeof s !== 'object') return s ?? null;
      const { __drift_pos, __drift_has_data, ...rest } = s;
      return (Object.keys(rest).length > 0 || __drift_has_data) ? rest : null;
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
      currentPos++;
      const href = formatHashHref(to);
      const stateObj = { ...(data || {}), __drift_pos: currentPos, ...(data !== undefined ? { __drift_has_data: true } : {}) };
      window.history.pushState(stateObj, '', href);
      currentLocation = to;
    },
    replace(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = formatHashHref(to);
      const stateObj = { ...(data || {}), __drift_pos: currentPos, ...(data !== undefined ? { __drift_has_data: true } : {}) };
      window.history.replaceState(stateObj, '', href);
      currentLocation = to;
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
  const rawInitial = initialLocation.startsWith('/') ? initialLocation : '/' + initialLocation;
  const initial = stripBase(rawInitial, normalizedBase) || '/';
  const entries: string[] = [initial];
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
