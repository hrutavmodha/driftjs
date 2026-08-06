# @driftjs/router — Architecture & API

`@driftjs/router` is a native client-side router for DriftJS. It has no virtual DOM, no
independent rendering pipeline, and no dependency on any other framework's router. It is a thin
orchestration layer: it matches a URL to a chain of route records, resolves each record's
compiled `.drift` module, and hands off to the *existing* runtime — `mount()` /
`DriftJSClientVM` — for every segment. All actual DOM work (creating nodes, patching text,
delegating events) still happens inside the register VM and its existing reconciler.

```
        URL
         │
         ▼
   ┌─────────────┐
   │   Matcher    │   pathname -> RouteRecord[] chain + params  (Matcher.ts)
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │    Route     │   resolve component (sync or lazy import)   (Route.ts)
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │   Router     │   guards, redirects, diff vs. active chain   (Router.ts)
   └──────┬──────┘
          │  mount(component, targetElement)
          ▼
   ┌─────────────┐
   │ @driftjs/runtime │  DriftJSClientVM.execute() — existing VM + reconciler
   └─────────────┘
```

## Why there's no `<Router>` / `<Route>` component

DriftJS components are compiled `.drift` SFCs, not functions returning a tree the router could
wrap or intercept — templates are compiled ahead-of-time straight to bytecode. So instead of a
component-based router, `@driftjs/router` works at the level DriftJS already works at:

- **Route matching** produces a plain `RouteRecord[]` chain, not JSX.
- **Rendering** is just calling the existing `mount()` on a plain `HTMLElement` — the same
  function `main.js` already calls for a single-page app.
- **Nested routes / layouts** use an `Outlet` *placeholder*, not an `Outlet` *component*: a
  layout's own `.drift` template includes a plain `<div data-drift-outlet></div>`, and the
  router finds it in the layout's real, already-mounted DOM (via `querySelector`) to mount the
  child route into. No virtual node, no extra abstraction — just a DOM query against output the
  VM already produced.
- **`<Link>`** is a plain `<a data-drift-link href="...">`. The router installs one delegated
  `click` listener (the same pattern `BIND_EVENT` uses inside the VM) that intercepts clicks on
  any such anchor.

## Package layout

```
packages/router/
├── Router.ts    DriftRouter class + createRouter() — orchestration, guards, mount/unmount
├── History.ts   DriftHistory — pushState/replaceState/back/forward/popstate, scroll bookkeeping
├── Matcher.ts   normalizeRoutes(), matchRoute() — segment-based path matching
├── Route.ts     resolveComponent() (incl. lazy import), buildLocation(), resolveRedirect()
├── Link.ts      installLinkInterception(), shouldIntercept() — <a data-drift-link> handling
├── types.ts     Public + internal type definitions
├── index.ts     Barrel export
└── tests/       matcher.test.ts, router.test.ts, link.test.ts
```

## Route matching

Routes are matched **segment by segment**, recursively, against the route tree — not by
building one giant regex. This is what makes nested routes and layouts fall out naturally: a
parent route consumes its own path segments, then delegates whatever's left to its `children`.

| Pattern | Matches | Params |
| :--- | :--- | :--- |
| `/` | `/` | `{}` |
| `/about` | `/about` | `{}` |
| `/user/:id` | `/user/42` | `{ id: "42" }` |
| `/post/:id/comment/:commentId` | `/post/7/comment/9` | `{ id: "7", commentId: "9" }` |
| `/files/*` | `/files/a/b/c.png` | `{ "*": "a/b/c.png" }` |

An empty `path: ''` child is an **index route** — it matches when its parent has consumed the
whole URL and nothing is left over. A route with `path: '*'` at the top level (or the router's
dedicated `notFound` option) acts as a catch-all 404.

Query strings and hashes are parsed separately from the path and never participate in matching:
`/products?page=2&sort=price` matches the `/products` route and yields
`query: { page: "2", sort: "price" }`.

## API

```ts
import { createRouter } from '@driftjs/router';

const router = createRouter({
  root: '#app',                 // defaults to '#app'
  mode: 'history',               // 'history' | 'hash'
  scrollBehavior: 'auto',        // 'auto' | 'manual' | (to, from, saved) => ({left, top})
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: () => import('./pages/About.drift') },
    { path: '/user/:id', component: User },
    {
      path: '/dashboard',
      component: DashboardLayout,     // renders <div data-drift-outlet></div>
      children: [
        { path: '', component: DashboardOverview },
        {
          path: 'settings',
          component: DashboardSettings,
          beforeEnter: (to, from) => isLoggedIn() || '/login'
        }
      ]
    }
  ],
  notFound: { path: '*', component: NotFound }
});

router.push('/about');
router.replace('/login');
router.back();
router.forward();

router.beforeEach((to, from) => { /* return true | false | '/redirect' */ });
router.afterEach((to, from) => { /* analytics, etc. */ });

router.resolve('/user/9?tab=info');   // -> RouteLocation, doesn't navigate
router.prefetch('/about');             // warms the lazy-import cache
```

### `RouterOptions`

| Option | Default | Description |
| :--- | :--- | :--- |
| `routes` | — | Route tree (required) |
| `root` | `'#app'` | Element (or selector) the top-level route mounts into |
| `mode` | `'history'` | `pushState`/`popstate` or `location.hash`/`hashchange` |
| `base` | `''` | Prefix stripped from/prepended to every URL |
| `notFound` | — | Route rendered when nothing else matches |
| `scrollBehavior` | `'auto'` | `'auto'` restores saved scroll on back/forward and scrolls to top on push; `'manual'` disables it; or a custom function |
| `linkInterception` | `true` | Auto-install the `data-drift-link` click handler |

### Guards

`beforeEnter(to, from)` (per-route) and `router.beforeEach(guard)` (global) run in order — global
guards first, then each matched route's own guard, root to leaf — before a navigation commits.
A guard may return:

- `true` / `undefined` — allow, continue to the next guard.
- `false` — cancel the navigation; the URL and DOM stay as they were.
- `'/some/path'` or `{ path, query?, hash?, replace? }` — redirect there instead.

### Component resolution & lazy loading

```ts
{ path: '/about', component: () => import('./pages/About.drift') }
```

A lazy loader is invoked once; its promise is cached on the route record, so revisiting the
route or calling `router.prefetch()` ahead of time never re-imports the module.

### Route params inside a component

DriftJS's compiler statically assigns registers to a component's top-level `<script>` state —
there's no runtime channel for the compiler to thread router params through as if they were
props. Instead, the router sets a plain global right before mounting each segment:

```html
<script>
  let id = window.__driftRoute.params.id;
</script>
```

This works unmodified under the existing compiler: `window.__driftRoute.params.id` is a member
expression, not a bare identifier, so the analyzer's reactive-register rewriting (which only
rewrites *declared state variables*) leaves it alone.

### Nested routes & layouts

A layout is just a normal `.drift` component with a `<div data-drift-outlet></div>`
placeholder somewhere in its template. When the router mounts a route chain
`[Layout, ChildA]`, it:

1. Mounts `Layout` into the router's root element via the existing `mount()`.
2. Finds `[data-drift-outlet]` inside `Layout`'s now-rendered DOM.
3. Mounts `ChildA` into that element.

Navigating to a sibling (`ChildA` -> `ChildB` under the same `Layout`) diffs the new chain
against the currently-active one: the shared `Layout` prefix is left mounted (its VM instance
and DOM untouched), and only `ChildB` is mounted in place of `ChildA`.

### `<Link>`

There's no `<Link>` component — anchors opt into client-side navigation with an attribute:

```html
<a href="/about" data-drift-link>About</a>
<a href="/login" data-drift-link data-drift-replace>Log in</a>
```

`installLinkInterception()` (run automatically unless `linkInterception: false`) adds one
delegated `click` listener that calls `router.push()`/`router.replace()` for matching anchors,
while leaving the browser's default behavior alone for modifier-clicks, middle-clicks,
`target="_blank"`, `download` links, and cross-origin URLs.

### Scroll restoration

Scroll position is saved (keyed to the history entry being left) right before every `push`, and
restored on `popstate` if `scrollBehavior` is `'auto'` (the default). A forward `push`/`replace`
scrolls to `(0, 0)` unless `scrollBehavior` is `'manual'` or a custom function.
