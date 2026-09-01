# 🐛 DriftJS Bug Tracker & Defect Audit

This document tracks identified bugs, duplication defects, native runtime re-inventions, architecture violations, and correctness issues across the DriftJS monorepo.

> **Last full audit:** 2026-08-31 — Full codebase re-read across all 8 packages.
> **Status:** ✅ All confirmed defects resolved and verified with 414 passing tests.

---

## 📊 Summary Matrix

| Bug ID | Title & Summary | Category | Severity | Target Package | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| — | *No open defects. All identified bugs resolved.* | — | — | — | **Resolved** |

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
| **Navigation guards (`beforeEach`, `afterEach`, redirect loop guard)** | ✅ Correct. Pure return-based guards `(to, from)` with token cancellation and 20-redirect limit. |
| **`renderToString` HTML escaping** | ✅ Correct. All 5 characters (`&`, `<`, `>`, `"`, `'`) escaped. |
| **`serializeNode` attribute sanitization** | ✅ Correct. `VALID_ATTR_NAME_REGEX` and `VALID_TAG_NAME_REGEX` applied. |
| **`renderToStream` out-of-order streaming shell** | ✅ Correct. Template/script swap mechanism functions correctly. |
| **`hydrateSelectively` dispatch** | ✅ Correct. All 5 strategies plus custom callback correctly dispatched; unmount nullifies VM reference. |
| **`reconcileKeyedList` prefix/suffix fast-path** | ✅ Correct. Prefix and suffix sync loops correctly update and reuse records. |
| **`DriftClientVM` microtask batching** | ✅ Correct. `queueMicrotask` used, `MAX_FLUSH_ITERATIONS` guard prevents infinite loops. |
| **Event delegation with `NON_BUBBLING_EVENTS` capture** | ✅ Correct. Zero-allocation event handlers with synchronous updates. |
| **`$derived` lazy caching** | ✅ Correct. `isDirty` flag used; cache invalidated on dependency change. |
| **`vite-plugin` HMR invalidation** | ✅ Correct. Module graph invalidated, full-reload triggered. |
| **`scanBalancedDelimiters` / `scanner.ts`** | ✅ Clean. Full awareness of quotes, template literals, comments, regex, and nesting. Shared by `scope.ts` and `lexer.ts`. |
