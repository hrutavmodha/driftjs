import type { DriftJSComponent } from '@driftjs/runtime';
import { mount } from '@driftjs/runtime';
import { DriftHistory } from './History.js';
import { matchRoute, normalizeRoutes } from './Matcher.js';
import { buildLocation, resolveComponent, resolveRedirect } from './Route.js';
import { installLinkInterception } from './Link.js';
import type {
  MatchResult,
  NavigationOptions,
  RouteGuard,
  RouteLocation,
  RouteRecord,
  RouterOptions
} from './types.js';

interface ActiveSegment {
  record: RouteRecord;
  vm: { unmount(): void };
  /** Container this segment's VM was mounted into. */
  element: HTMLElement;
  /** This segment's own `[data-drift-outlet]`, if any — where its child segment mounts. */
  outletElement: HTMLElement | null;
}

interface TransitionOptions {
  replace?: boolean;
  initial?: boolean;
  fromPop?: boolean;
}

/**
 * Orchestrates client-side navigation. Never touches the DOM itself for
 * rendering: it matches a URL to a chain of `RouteRecord`s, resolves each
 * one's compiled Drift module, and hands off to the existing runtime
 * (`mount()` -> `DriftJSClientVM` -> the existing reconciler) for every
 * segment. Nested routes render into `[data-drift-outlet]` elements found
 * inside the parent segment's freshly-mounted DOM, so layouts are ordinary
 * `.drift` components with an outlet placeholder in their template.
 */
export class DriftRouter {
  private readonly records: RouteRecord[];
  private readonly notFoundRecord: RouteRecord | null;
  private readonly history: DriftHistory;
  private readonly root: HTMLElement;
  private readonly scrollBehavior: RouterOptions['scrollBehavior'];
  private readonly beforeEachGuards: RouteGuard[] = [];
  private readonly afterEachHooks: Array<(to: RouteLocation, from: RouteLocation | null) => void> = [];

  private active: ActiveSegment[] = [];
  private location: RouteLocation | null = null;
  private navId = 0;
  private readonly unlistenHistory: () => void;
  private readonly uninstallLinks: (() => void) | null;

  constructor(private readonly options: RouterOptions) {
    this.records = normalizeRoutes(options.routes);
    this.notFoundRecord = options.notFound ? normalizeRoutes([options.notFound])[0]! : null;
    this.history = new DriftHistory(options.mode ?? 'history', options.base ?? '');
    this.root = resolveRoot(options.root);
    this.scrollBehavior = options.scrollBehavior ?? 'auto';

    this.unlistenHistory = this.history.listen((loc, action) => {
      if (action === 'pop') {
        void this.transition(loc.path, loc.search, loc.hash, { fromPop: true });
      }
    });

    this.uninstallLinks = options.linkInterception !== false ? installLinkInterception(this) : null;

    const initial = this.history.current();
    void this.transition(initial.path, initial.search, initial.hash, { initial: true });
  }

  /** The currently active resolved location, or `null` before the first navigation settles. */
  public get currentRoute(): RouteLocation | null {
    return this.location;
  }

  /** Navigates to `to`, pushing a new history entry (unless `replace` is set). */
  public push(to: string, opts: NavigationOptions = {}): Promise<void> {
    const { path, search, hash } = splitUrl(to);
    return this.transition(path, search, hash, { replace: opts.replace ?? false });
  }

  /** Navigates to `to`, replacing the current history entry in place. */
  public replace(to: string): Promise<void> {
    return this.push(to, { replace: true });
  }

  public back(): void {
    this.history.back();
  }

  public forward(): void {
    this.history.forward();
  }

  public go(delta: number): void {
    this.history.go(delta);
  }

  /** Registers a global guard run before every navigation, root guards first. Returns an unregister fn. */
  public beforeEach(guard: RouteGuard): () => void {
    this.beforeEachGuards.push(guard);
    return () => {
      const i = this.beforeEachGuards.indexOf(guard);
      if (i !== -1) this.beforeEachGuards.splice(i, 1);
    };
  }

  /** Registers a hook run after a navigation has committed. Returns an unregister fn. */
  public afterEach(hook: (to: RouteLocation, from: RouteLocation | null) => void): () => void {
    this.afterEachHooks.push(hook);
    return () => {
      const i = this.afterEachHooks.indexOf(hook);
      if (i !== -1) this.afterEachHooks.splice(i, 1);
    };
  }

  /** Resolves `to` against the route tree without navigating. */
  public resolve(to: string): RouteLocation | null {
    const { path, search, hash } = splitUrl(to);
    const match = matchRoute(this.records, path) ?? this.matchNotFound();
    return match ? buildLocation(path, search, hash, match) : null;
  }

  /** Warms the lazy-loader cache for `to` without mounting anything. */
  public prefetch(to: string): void {
    const { path } = splitUrl(to);
    const match = matchRoute(this.records, path) ?? this.matchNotFound();
    match?.chain.forEach((record) => void resolveComponent(record));
  }

  /** Tears down history listeners, link interception, and unmounts every active segment. */
  public destroy(): void {
    this.unlistenHistory();
    this.uninstallLinks?.();
    this.unmountFrom(0);
  }

  private matchNotFound(): MatchResult | null {
    return this.notFoundRecord ? { chain: [this.notFoundRecord], params: {} } : null;
  }

  private async transition(
    path: string,
    search: string,
    hash: string,
    opts: TransitionOptions = {}
  ): Promise<void> {
    const myNav = ++this.navId;
    const match = matchRoute(this.records, path) ?? this.matchNotFound();
    if (!match) return; // No route and no 404 configured: leave the current view as-is.

    const to = buildLocation(path, search, hash, match);
    const from = this.location;

    const guards: RouteGuard[] = [
      ...this.beforeEachGuards,
      ...match.chain.filter((r): r is RouteRecord & { beforeEnter: RouteGuard } => !!r.beforeEnter).map((r) => r.beforeEnter)
    ];
    for (const guard of guards) {
      const result = await guard(to, from);
      if (myNav !== this.navId) return; // A newer navigation started while we awaited.
      if (result === false) return;
      if (typeof result === 'string') return void this.push(result, { replace: true });
      if (result && typeof result === 'object') {
        return void this.push(result.path, { replace: result.replace ?? true });
      }
    }

    const redirecting = match.chain.find((r) => r.redirect);
    if (redirecting) {
      return void this.push(resolveRedirect(redirecting.redirect!, to), { replace: true });
    }

    const components = await Promise.all(
      match.chain.map((record) => resolveComponent(record) ?? Promise.resolve(null))
    );
    if (myNav !== this.navId) return;

    if (!opts.initial && !opts.fromPop) {
      this.saveScroll();
      if (opts.replace) this.history.replace(path, search, hash);
      else this.history.push(path, search, hash);
    }

    // Exposed so a mounting component's <script> can read route params/query during its own
    // init code (e.g. `let id = window.__driftRoute.params.id;`) — a plain global member access,
    // not a bare identifier, so the compiler's reactive-register rewriting leaves it untouched.
    (globalThis as { __driftRoute?: RouteLocation }).__driftRoute = to;

    this.render(match.chain, components);
    this.location = to;
    for (const hook of this.afterEachHooks) hook(to, from);
    this.applyScroll(to, from, opts.fromPop ?? false);
  }

  /**
   * Mounts only the segments of `chain` that changed since the last render,
   * reusing existing VM instances (and their DOM) for the unchanged prefix —
   * e.g. navigating between two children of the same layout leaves the
   * layout's VM instance untouched.
   */
  private render(chain: RouteRecord[], components: Array<DriftJSComponent | null>): void {
    let divergeAt = 0;
    while (
      divergeAt < this.active.length &&
      divergeAt < chain.length &&
      this.active[divergeAt]!.record === chain[divergeAt]
    ) {
      divergeAt++;
    }
    this.unmountFrom(divergeAt);

    let parentElement =
      divergeAt === 0
        ? this.root
        : (this.active[divergeAt - 1]!.outletElement ?? this.active[divergeAt - 1]!.element);

    for (let i = divergeAt; i < chain.length; i++) {
      const record = chain[i]!;
      const component = components[i];
      if (!component) continue;

      const vm = mount(component, parentElement);
      const outletElement = parentElement.querySelector<HTMLElement>('[data-drift-outlet]');
      this.active.push({ record, vm, element: parentElement, outletElement });

      parentElement = outletElement ?? parentElement;
    }
  }

  private unmountFrom(index: number): void {
    for (let i = this.active.length - 1; i >= index; i--) {
      this.active[i]!.vm.unmount();
    }
    this.active.length = index;
  }

  private saveScroll(): void {
    if (typeof window !== 'undefined') {
      this.history.saveScroll({ left: window.scrollX, top: window.scrollY });
    }
  }

  private applyScroll(to: RouteLocation, from: RouteLocation | null, isPop: boolean): void {
    if (this.scrollBehavior === 'manual' || typeof window === 'undefined') return;

    if (typeof this.scrollBehavior === 'function') {
      const pos = this.scrollBehavior(to, from, isPop ? this.history.getSavedScroll() : null);
      if (pos) window.scrollTo(pos.left, pos.top);
      return;
    }

    if (isPop) {
      const saved = this.history.getSavedScroll();
      if (saved) {
        window.scrollTo(saved.left, saved.top);
        return;
      }
    }
    window.scrollTo(0, 0);
  }
}

function resolveRoot(root: RouterOptions['root']): HTMLElement {
  if (root instanceof HTMLElement) return root;
  const selector = root ?? '#app';
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`DriftJS Router: root element "${selector}" not found.`);
  return el;
}

function splitUrl(to: string): { path: string; search: string; hash: string } {
  const hashIdx = to.indexOf('#');
  const hash = hashIdx === -1 ? '' : to.slice(hashIdx);
  const withoutHash = hashIdx === -1 ? to : to.slice(0, hashIdx);
  const searchIdx = withoutHash.indexOf('?');
  const search = searchIdx === -1 ? '' : withoutHash.slice(searchIdx);
  const path = searchIdx === -1 ? withoutHash : withoutHash.slice(0, searchIdx);
  return { path: path || '/', search, hash };
}

/** Creates and boots a `DriftRouter`, performing the initial navigation for the current URL. */
export function createRouter(options: RouterOptions): DriftRouter {
  return new DriftRouter(options);
}
