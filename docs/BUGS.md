# 🐛 DriftJS Bug Tracker & Defect Audit

This document tracks identified bugs, duplication defects, native runtime re-inventions, architecture violations, and correctness issues across the DriftJS monorepo.

> **Last full audit:** 2026-08-31 — Full codebase re-read across all 8 packages.

---

## 📊 Summary Matrix

| Bug ID | Title & Summary | Category | Severity | Target Package | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| [`BUG-001`](#bug-001-driftclientvm-event-handler-scope-snapshotdiff-on-every-dom-event) | `DriftClientVM` Event Handler Scope Snapshot+Diff Optimization | Performance | **Medium** | `driftjs-dom` | **Open** |
| [`BUG-002`](#bug-002-router-runguardqueue-guard-arity-detection-via-guardlength-is-unreliable-after-transpilation) | Router `runGuardQueue` Guard Arity Detection via `guard.length` Is Unreliable | Correctness | **Medium** | `driftjs-router` | **Open** |
| [`BUG-003`](#bug-003-addconstant-duck-type-detection-of-acorn-nodes-via-type-string-incorrectly-converts-heterogeneous-arrays) | `addConstant` Duck-Type Detection of Acorn Nodes via `.type` String | Correctness / Runtime Bug | **High** | `driftjs-compiler` | **Open** |

---

## 🔍 Detailed Bug Findings & Resolutions

### `BUG-001`: `DriftClientVM` Event Handler Scope Snapshot+Diff Optimization

- **Package:** `driftjs-dom`
- **Severity:** Medium
- **Category:** Performance
- **Location:** [`packages/dom/src/index.ts` L149–L173](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L149-L173)
- **Description:** The wrapped event handler (`wrappedHandler`) performs a full O(d) scope snapshot via `new Map()` on every single DOM event. On high-frequency events (like `onmousemove` or `onscroll`), creating `new Map()` instances on every frame causes garbage collection churn.
- **Fix:** Skip snapshotting when `targetVM.declaredVars` is empty, and replace `new Map()` with lightweight record snapshots to eliminate allocation overhead.
- **Status:** **Open**

---

### `BUG-002`: Router `runGuardQueue` Guard Arity Detection via `guard.length` Is Unreliable After Transpilation

- **Package:** `driftjs-router`
- **Severity:** Medium
- **Category:** Correctness
- **Location:** [`packages/router/src/router.ts` L107–L153](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L107-L153)
- **Description:** `runGuardQueue` uses `guard.length >= 3` to detect callback-style (`next`-based) navigation guards. `Function.length` is unreliable when functions use default parameters `(to, from, next = () => {}) => {}` or rest parameters `(...args) => {}`.
- **Fix:** Always provide a tracking `next` function and resolve immediately if either `next()` is called or a non-undefined value is returned/resolved.
- **Status:** **Open**

---

### `BUG-003`: `addConstant` Duck-Type Detection of Acorn Nodes via `.type` String

- **Package:** `driftjs-compiler`
- **Severity:** High
- **Category:** Correctness / Runtime Bug
- **Location:** [`packages/compiler/src/generator.ts` L684–L700](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L684-L700)
- **Description:** `addConstant()` uses duck-typing to detect Acorn AST nodes by checking `typeof value[0] === 'object' && value[0]?.type`. This only checks the first element of an array, which could misidentify heterogeneous arrays.
- **Fix:** Add strict validation or explicit AST wrappers to ensure only valid Acorn AST statement/expression nodes are transpiled.
- **Status:** **Open**

---

## 📋 Audit Notes — Feature Areas Audited & Verified Clean

The following feature areas were audited and found to be correct and production-grade:

| Feature Area | Verdict |
| :--- | :--- |
| **`HydrationCursor`** (`claimNode` generic, TreeWalker-based) | ✅ Clean. Generic helper correctly implemented. |
| **LIS `getSequence`** (`packages/dom/src/reconciler.ts`) | ✅ Correct. Implements optimal patience-sorting LIS algorithm. |
| **Lexer Char-Code Scanning** (`packages/compiler/src/lexer.ts`) | ✅ Correct. Optimized ASCII char-code scanning with hyphen support. |
| **Context API** (`createContext`, `provideContext`, `injectContext`) | ✅ Correct. Uses `Symbol` keys, walks `parentVM` chain. |
| **`effect`, `onMount`, `onUnmount` lifecycle** | ✅ Correct. Uses active VM stack for registration. |
| **`DriftTransformer` AST visitor pattern** | ✅ Clean. Visitor correctly recurses all 7 node types including `AsyncNode`. |
| **`@switch` lowering to `@if` chains** | ✅ Correct. Uses `structuredClone` for discriminant, handles `@default` as `true` literal. |
| **`parseQuery` / `stringifyQuery` using `URLSearchParams`** | ✅ Correct. Native API used. Prototype pollution guards present. |
| **Route scoring and `path-to-regexp` integration** | ✅ Correct. Score computed per-segment, sorted descending. |
| **Navigation guards (`beforeEach`, `afterEach`, redirect loop guard)** | ✅ Correct. Token-based cancellation, 20-redirect limit. |
| **`renderToString` HTML escaping** | ✅ Correct. All 5 characters (`&`, `<`, `>`, `"`, `'`) escaped. |
| **`serializeNode` attribute sanitization** | ✅ Correct. `VALID_ATTR_NAME_REGEX` and `VALID_TAG_NAME_REGEX` applied. |
| **`renderToStream` out-of-order streaming shell** | ✅ Correct. Template/script swap mechanism functions correctly. |
| **`hydrateSelectively` dispatch** | ✅ Correct. All 5 strategies plus custom callback correctly dispatched. |
| **`reconcileKeyedList` prefix/suffix fast-path** | ✅ Correct. Prefix and suffix sync loops correctly update and reuse records. |
| **`DriftClientVM` microtask batching** | ✅ Correct. `queueMicrotask` used, `MAX_FLUSH_ITERATIONS` guard prevents infinite loops. |
| **Event delegation with `NON_BUBBLING_EVENTS` capture** | ✅ Correct. Capture mode used for focus/blur/scroll/pointer-enter/leave. |
| **`$derived` lazy caching** | ✅ Correct. `isDirty` flag used; cache invalidated on dependency change. |
| **`vite-plugin` HMR invalidation** | ✅ Correct. Module graph invalidated, full-reload triggered. |
| **`scanBalancedDelimiters` / `scanner.ts`** | ✅ Clean. Full awareness of quotes, template literals, comments, regex, and nesting. Shared by `scope.ts` and `lexer.ts`. |
