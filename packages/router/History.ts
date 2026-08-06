import type { RoutingMode, ScrollPosition } from './types.js';

export interface HistoryLocation {
  path: string;
  search: string;
  hash: string;
}

export type NavigationAction = 'push' | 'replace' | 'pop';
export type HistoryListener = (location: HistoryLocation, action: NavigationAction) => void;

interface DriftHistoryState {
  __driftKey: number;
}

let keySeq = 0;

/**
 * Wraps the browser History API (or `location.hash` in hash mode) behind a small,
 * mode-agnostic surface. Owns scroll-position bookkeeping keyed by history entry so
 * back/forward navigations can restore scroll without the router knowing about it.
 */
export class DriftHistory {
  private readonly scrollPositions = new Map<number, ScrollPosition>();
  private listeners = new Set<HistoryListener>();
  private currentKey: number;
  private readonly popHandler = (): void => this.handlePop();

  constructor(
    private readonly mode: RoutingMode = 'history',
    private readonly base: string = ''
  ) {
    this.currentKey = this.readKey() ?? this.nextKey();
    if (typeof window !== 'undefined') {
      window.addEventListener(
        this.mode === 'hash' ? 'hashchange' : 'popstate',
        this.popHandler
      );
    }
  }

  /** Returns the current path (with query/hash stripped), search string, and hash. */
  public current(): HistoryLocation {
    if (typeof window === 'undefined') {
      return { path: '/', search: '', hash: '' };
    }
    if (this.mode === 'hash') {
      const raw = window.location.hash.slice(1) || '/';
      const hashIdx = raw.indexOf('#');
      const withoutInnerHash = hashIdx === -1 ? raw : raw.slice(0, hashIdx);
      const [pathAndSearch] = [withoutInnerHash];
      const searchIdx = pathAndSearch.indexOf('?');
      const path = searchIdx === -1 ? pathAndSearch : pathAndSearch.slice(0, searchIdx);
      const search = searchIdx === -1 ? '' : pathAndSearch.slice(searchIdx);
      return { path: this.stripBase(path || '/'), search, hash: '' };
    }
    return {
      path: this.stripBase(window.location.pathname),
      search: window.location.search,
      hash: window.location.hash
    };
  }

  /** Pushes a new history entry, updating the URL without a page reload. */
  public push(path: string, search = '', hash = ''): void {
    const key = this.nextKey();
    const url = this.buildUrl(path, search, hash);
    if (this.mode === 'hash') {
      window.location.hash = url.slice(1);
    } else {
      window.history.pushState({ __driftKey: key } satisfies DriftHistoryState, '', url);
    }
    this.currentKey = key;
    this.emit(this.current(), 'push');
  }

  /** Replaces the current history entry in place. */
  public replace(path: string, search = '', hash = ''): void {
    const key = this.currentKey;
    const url = this.buildUrl(path, search, hash);
    if (this.mode === 'hash') {
      const full = window.location.href.split('#')[0] + url;
      window.history.replaceState({ __driftKey: key } satisfies DriftHistoryState, '', full);
    } else {
      window.history.replaceState({ __driftKey: key } satisfies DriftHistoryState, '', url);
    }
    this.emit(this.current(), 'replace');
  }

  public back(): void {
    window.history.back();
  }

  public forward(): void {
    window.history.forward();
  }

  public go(delta: number): void {
    window.history.go(delta);
  }

  /** Subscribes to navigation events (pushState/replaceState calls and popstate/hashchange). */
  public listen(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public saveScroll(position: ScrollPosition): void {
    this.scrollPositions.set(this.currentKey, position);
  }

  public getSavedScroll(): ScrollPosition | null {
    return this.scrollPositions.get(this.currentKey) ?? null;
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener(this.mode === 'hash' ? 'hashchange' : 'popstate', this.popHandler);
    }
    this.listeners.clear();
  }

  private handlePop(): void {
    this.currentKey = this.readKey() ?? this.nextKey();
    this.emit(this.current(), 'pop');
  }

  private emit(location: HistoryLocation, action: NavigationAction): void {
    for (const listener of this.listeners) listener(location, action);
  }

  private nextKey(): number {
    return ++keySeq;
  }

  private readKey(): number | null {
    if (typeof window === 'undefined') return null;
    const state = window.history.state as DriftHistoryState | null;
    return state?.__driftKey ?? null;
  }

  private buildUrl(path: string, search: string, hash: string): string {
    const full = this.applyBase(path.startsWith('/') ? path : `/${path}`);
    return this.mode === 'hash' ? `#${full}${search}${hash}` : `${full}${search}${hash}`;
  }

  private applyBase(path: string): string {
    if (!this.base) return path;
    return path === '/' ? this.base : `${this.base}${path}`;
  }

  private stripBase(path: string): string {
    if (!this.base || !path.startsWith(this.base)) return path;
    const stripped = path.slice(this.base.length);
    return stripped === '' ? '/' : stripped;
  }
}
