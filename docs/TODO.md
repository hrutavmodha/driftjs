# 📋 DriftJS Feature Implementation Roadmap (TODO)

This document tracks upcoming core architectural features, reactivity primitives, and developer ergonomics planned for DriftJS.

---

## ✅ Completed: Derived & Computed State (`derive()`)

### Overview

In Single File Components (`.drift`), derived reactive state is authored via `derive(expr)` or `derive(() => { ... })`:

```drift
<script>
  let count = 0;

  // Direct expression form:
  let double = derive(count * 2);
  let quad = derive(double * 2);

  // Function block form:
  let status = derive(() => {
    return count > 0 ? 'Positive' : 'ZeroOrNegative';
  });

  function increment() {
    count++; // `double`, `quad`, and `status` automatically recompute!
  }
</script>

<p>Count: {count}</p>
<p>Double: {double}</p>
<p>Quad: {quad}</p>
<p>Status: {status}</p>
```

### Compiler & VM Implementation

1. **Compiler AST Analysis & Codegen (`driftjs-compiler`):**
   - Detects `derive(...)` calls in `<script>` variable declarations.
   - Statically extracts variable dependencies (e.g. `count`) from expression AST.
   - Compiles the expression/body to constant pool functions and emits `CompiledModule.derived: DerivedBinding[]`.
   - Filters `derive(...)` declarations from `EXEC_SCRIPT` statements so they don't shadow scope getters.
2. **Runtime VM Evaluation & Caching (`driftjs-dom` & `driftjs-ssr`):**
   - Configures lazy cached getters on `scope` via `Object.defineProperty`.
   - Builds `depToDerived` reverse mapping at mount time.
   - `markDirty(varName)` invalidates dirty caches and cascades to dependent/chained derived state.
   - Tested across Client VM, SSR, and Compiler test suites (`packages/dom/tests/derived.test.ts`, `packages/compiler/tests/generator.test.ts`, `packages/ssr/tests/ssr.test.ts`).
   - Ensure template bytecode instructions referencing `{double}` re-evaluate and patch the DOM seamlessly.

---

## 🌊 Priority 1 (Next Up): Streaming SSR (`renderToReadableStream` / `pipeToNodeStream`)

### Overview

Enable progressive HTML streaming for DriftJS server-side rendering, allowing initial shells to reach the browser immediately while asynchronous data/components resolve concurrently.

### Architecture & Design

1. **Web Streams & Node.js Stream Adapters (`driftjs-ssr`):**
   - `renderToReadableStream(component, options)`: Returns a Web Standard `ReadableStream` for Edge runtimes (Cloudflare Workers, Deno, Bun).
   - `renderToPipeableStream(component, options)`: Exposes Node.js stream integration (`pipe(res)`) with `onShellReady`, `onAllReady`, and `onError` lifecycle hooks.
2. **Async Boundaries & Out-of-Order Streaming:**
   - Stream high-priority layout and static HTML chunks immediately (TTFB optimization).
   - Anchor asynchronous sub-trees with placeholder comment markers (`<!--drift-async:id-->`).
   - Emit resolved asynchronous chunks inline as `<template id="drift-async:id">...</template>` followed by lightweight replacement script snippets that swap content into place before hydration.

---

## ⚡ Priority 2: Selective & Progressive Hydration

### Overview

Upgrade `driftjs-dom` hydration from a monolithic full-page scan to fine-grained, non-blocking selective hydration of independent component subtrees.

### Architecture & Design

1. **Partial / Island Hydration Triggers:**
   - **`hydrateOnIdle`**: Hydrates interactive subtrees during browser idle periods (`requestIdleCallback`).
   - **`hydrateWhenVisible`**: Defers subtree hydration until the component enters the viewport (`IntersectionObserver`).
   - **`hydrateOnInteraction`**: Defers event listener attachment and VM instantiation until the user hovers, touches, or clicks the element.
2. **TreeWalker Hydration Cursor Integration:**
   - Uses existing `HydrationCursor` comment anchors (`<!--if-->`, `<!--for-->`, `<!--comp:name-->`) to claim DOM sub-trees on-demand without reconstructing or resetting state.

---

## 🔄 Priority 3: Reactive Side-Effects & Watchers (`$effect` / `watch`)

### Proposed Design

Allow developers to execute asynchronous or synchronous side-effects whenever targeted dependencies change:

```drift
<script>
  let userId = 1;
  let userData = null;

  $effect(() => {
    fetch(`/api/users/${userId}`).then(res => res.json()).then(data => {
      userData = data;
    });
  });
</script>
```

---

## 🔀 Priority 4: Two-Way Form Binding (`@bind` / `bind:value`)

### Proposed Design

Eliminate manual `value={val} oninput={(e) => val = e.target.value}` boilerplate with native compiler transformation:

```drift
<!-- Inputs, Textareas, Selects -->
<input @bind value={username} />
<input @bind checked={rememberMe} type="checkbox" />
```

### Compiler Implementation

- Automatically expands `@bind value={x}` into:
  - `SET_ATTR` for `value` bound to `x`.
  - Global delegated `input` / `change` event handler dispatching `setScopeValue(scope, 'x', event.target.value)`.

---

---

## ✅ Completed: Custom Component Children (`{children}`)

### Overview

In DriftJS, custom components can receive child elements/nodes, mounted in the component template via `{children}` and accessible as the independent `children` variable in `<script>`:

```drift
<!-- Card.drift -->
<script>
  let hasChildren = derive(() => Boolean(children));
</script>

<div class="card">
  <h3>{title}</h3>
  @if hasChildren {
    <div class="card-body">
      {children}
    </div>
  }
</div>
```

```drift
<!-- Parent.drift -->
<Card title="Dashboard">
  <p class="stats">Live user count: {userCount}</p>
</Card>
```

### Key Architectural Characteristics

- **Separation of Props and Children:** `props` strictly contains explicit attributes (e.g. `props.title`). `children` is an independent first-class scope entity.
- **Compiler Sub-Module Generation:** Children passed between `<CustomComponent>...</CustomComponent>` are compiled into an isolated sub-module and passed via `propsSpec.__drift_children__`.
- **Client & SSR Parity:** Evaluates in parent's reactive scope and mounts seamlessly via `INTERPOLATE_TEXT` in both DOM (`DriftClientVM`) and Server (`DriftServerVM`).

---

## 📌 Priority 5: DOM Element References (`ref`)

### Proposed Design

Directly bind mounted DOM elements or component instances to `<script>` variables:

```drift
<script>
  import { onMount } from 'driftjs-dom';

  let inputEl;

  onMount(() => {
    if (inputEl) inputEl.focus();
  });
</script>

<input ref={inputEl} />
```

---

## 🎨 Priority 6: Component Scoped CSS (`<style scoped>`)

### Proposed Design

Post-process `<style scoped>` blocks in `driftjs-compiler` / `driftjs-vite-plugin` by appending unique component hashes (e.g. `[data-drift-v-ab12cd]`) to CSS selectors and template elements to prevent global style leakage.

---

## ⏱️ Priority 7: `nextTick()` / `tick()` Microtask Helper

### Proposed Design

Expose a promise-based helper to wait for scheduled VM batch DOM updates to flush:

```ts
import { nextTick } from 'driftjs-dom';

count++;
await nextTick();
// DOM is guaranteed to be updated in-place here
```
