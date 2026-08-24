import type {
  RouterHistory,
  HistoryState,
  NavigationCallback,
  NavigationInformation,
  NavigationDirection,
} from '../types/index.js';
import {
  normalizeBase,
  stripBase,
  createHref,
  formatHashHref,
} from './path.js';

export {
  normalizeBase,
  stripBase,
  createHref,
  formatHashHref,
};

/**
 * Creates a centralized history listener registry.
 */
export function createHistoryListeners() {
  const listeners: NavigationCallback[] = [];
  return {
    get list(): NavigationCallback[] {
      return listeners;
    },
    listen(callback: NavigationCallback): () => void {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    notify(to: string, from: string, info: NavigationInformation): void {
      for (const listener of listeners) {
        listener(to, from, info);
      }
    },
    clear(): void {
      listeners.length = 0;
    },
  };
}

/**
 * Extracts clean user state from raw history state, stripping internal __drift tracking keys.
 */
export function extractHistoryState(rawState: any): HistoryState {
  if (typeof window === 'undefined') return null;
  const s = rawState ?? window.history.state;
  if (!s || typeof s !== 'object') return s ?? null;
  const { __drift_pos, __drift_has_data, ...rest } = s;
  return (Object.keys(rest).length > 0 || __drift_has_data) ? rest : null;
}

/**
 * Packs user data with internal position tracking keys for window.history.
 */
export function buildHistoryState(data: HistoryState | undefined, pos: number): Record<string, any> {
  return {
    ...(data || {}),
    __drift_pos: pos,
    ...(data !== undefined ? { __drift_has_data: true } : {}),
  };
}

/**
 * Creates an HTML5 History API driver (BrowserHistory).
 */
export function createWebHistory(base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base);
  const listenerRegistry = createHistoryListeners();

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

    listenerRegistry.notify(to, from, info);
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
      return extractHistoryState(window.history.state);
    },
    listen(callback: NavigationCallback): () => void {
      return listenerRegistry.listen(callback);
    },
    push(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      currentPos++;
      const href = createHref(normalizedBase, to);
      const stateObj = buildHistoryState(data, currentPos);
      window.history.pushState(stateObj, '', href);
      currentLocation = to;
    },
    replace(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = createHref(normalizedBase, to);
      const stateObj = buildHistoryState(data, currentPos);
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
      listenerRegistry.clear();
    },
  };
}

/**
 * Creates a Hash history driver (HashHistory).
 */
export function createWebHashHistory(base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base);
  const listenerRegistry = createHistoryListeners();

  const getHashLocation = (): string => {
    if (typeof window === 'undefined') return '/';
    const hash = window.location.hash;
    if (!hash || hash === '#') return '/';
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    return raw.startsWith('/') ? raw : '/' + raw;
  };

  let currentLocation = getHashLocation();
  let currentPos = (typeof window !== 'undefined' && window.history.state && typeof window.history.state.__drift_pos === 'number')
    ? window.history.state.__drift_pos
    : 0;

  if (typeof window !== 'undefined' && (window.history.state == null || typeof window.history.state.__drift_pos !== 'number')) {
    const existing = window.history.state || {};
    window.history.replaceState({ ...existing, __drift_pos: currentPos }, '', formatHashHref(normalizedBase, currentLocation));
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

    listenerRegistry.notify(to, from, info);
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
      return extractHistoryState(window.history.state);
    },
    listen(callback: NavigationCallback): () => void {
      return listenerRegistry.listen(callback);
    },
    push(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      currentPos++;
      const href = formatHashHref(normalizedBase, to);
      const stateObj = buildHistoryState(data, currentPos);
      window.history.pushState(stateObj, '', href);
      currentLocation = to;
    },
    replace(to: string, data?: HistoryState): void {
      if (typeof window === 'undefined') return;
      const href = formatHashHref(normalizedBase, to);
      const stateObj = buildHistoryState(data, currentPos);
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
      listenerRegistry.clear();
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
