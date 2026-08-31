# 🐛 DriftJS Bug Tracker & Defect Audit

This document tracks identified bugs, duplication defects, native runtime re-inventions, architecture violations, and correctness issues across the DriftJS monorepo.

> **Last full audit:** 2026-08-31 — Full codebase re-read across all 8 packages.

---

## 📊 Summary Matrix

| Bug ID | Title & Summary | Category | Severity | Target Package | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| [`BUG-001`](#bug-001-ssr-reactive_if-opcode-reads-only-4-operands-but-the-isa-emits-5) | SSR `REACTIVE_IF` Opcode Reads 4 Operands but ISA Emits 5 (Operand Alignment) | Correctness / Code Quality | **Low** | `driftjs-ssr` | **Open** |
| [`BUG-002`](#bug-002-scopets-mutates-globalthis_get-at-module-load-time-as-a-side-effect) | `scope.ts` Mutates `globalThis._get` at Module Load Time as a Side Effect | Architecture / Portability | **Medium** | `driftjs-shared` | **Open** |
| [`BUG-003`](#bug-003-driftclientvm-event-handler-scope-snapshotdiff-on-every-dom-event) | `DriftClientVM` Event Handler Scope Snapshot+Diff Optimization | Performance | **Medium** | `driftjs-dom` | **Open** |
| [`BUG-004`](#bug-004-hydrateselectively-eager-case-unmount-breaks-vm--ishydrated-invariant) | `hydrateSelectively` Eager Case `unmount()` Breaks `.vm` / `.isHydrated` Invariant | Correctness / API Contract | **Low** | `driftjs-dom` | **Open** |
| [`BUG-005`](#bug-005-router-runguardqueue-guard-arity-detection-via-guardlength-is-unreliable-after-transpilation) | Router `runGuardQueue` Guard Arity Detection via `guard.length` Is Unreliable | Correctness | **Medium** | `driftjs-router` | **Open** |
| [`BUG-006`](#bug-006-addconstant-duck-type-detection-of-acorn-nodes-via-type-string-incorrectly-converts-heterogeneous-arrays) | `addConstant` Duck-Type Detection of Acorn Nodes via `.type` String | Correctness / Runtime Bug | **High** | `driftjs-compiler` | **Open** |
| [`BUG-007`](#bug-007-getdynamicpcs-bytecode-scanner-missing-reactive_async-opcode-case--scan-aborts-early) | `getDynamicPcs` Bytecode Scanner Missing `REACTIVE_ASYNC` Opcode Case | Correctness / Runtime Bug | **High** | `driftjs-dom` | **Open** |

---

## 🔍 Detailed Bug Findings & Resolutions

### `BUG-001`: SSR `REACTIVE_IF` Opcode Reads Only 4 Operands but the ISA Emits 5

- **Package:** `driftjs-ssr`
- **Severity:** Low
- **Category:** Correctness / Code Quality
- **Location:** [`packages/ssr/src/index.ts` L289–L313](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L289-L313)
- **Description:** In `DriftServerVM.execute()`, `case Opcode.REACTIVE_IF` reads operands at `pc+1` through `pc+4` (4 operands) then advances `pc += 6`. However, the generator emits `REACTIVE_IF` with **5 operands**:

  ```
  REACTIVE_IF  parentReg  condIdx  consIdx  altIdx  depsIdx   ← 5 operands, 6 total words
  ```

  The 5th operand `depsIdx` at `bytecode[pc + 5]` is silently skipped — this is intentional since SSR has no reactive engine, but it is undocumented. The operand should be explicitly named `const _depsIdx = bytecode[pc + 5];` with documentation.
- **Fix:** Read but discard the `depsIdx` operand with documentation:

  ```ts
  const parentReg = bytecode[pc + 1]!;
  const condIdx   = bytecode[pc + 2]!;
  const consIdx   = bytecode[pc + 3]!;
  const altIdx    = bytecode[pc + 4]!;
  const _depsIdx  = bytecode[pc + 5]!; // Unused in SSR (no reactive engine)
  pc += 6;
  ```
- **Status:** **Open**

---

### `BUG-002`: `scope.ts` Mutates `globalThis._get` at Module Load Time as a Side Effect

- **Package:** `driftjs-shared`
- **Severity:** Medium
- **Category:** Architecture / Portability / Side Effects
- **Location:** [`packages/utils/src/scope.ts` L99–L101](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L99-L101)
- **Description:** Lines 99–101 unconditionally write a property to `globalThis` at module import time:

  ```ts
  if (typeof globalThis !== 'undefined' && !(globalThis as any)._get) {
    (globalThis as any)._get = getScopeValue;
  }
  ```

  This is a **global side effect** that pollutes the host environment. In a multi-tenant Edge runtime (Cloudflare Workers, Vercel Edge), multiple isolates sharing the same `globalThis` could conflict over `_get`. The `_get` function is already injected as the 6th closure parameter of every generated `__drift_fn__` closure, so the global assignment is completely redundant.
- **Fix:** Remove lines 99–101 entirely.
- **Status:** **Open**

---

### `BUG-003`: `DriftClientVM` Event Handler Scope Snapshot+Diff Optimization

- **Package:** `driftjs-dom`
- **Severity:** Medium
- **Category:** Performance
- **Location:** [`packages/dom/src/index.ts` L149–L173](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L149-L173)
- **Description:** The wrapped event handler (`wrappedHandler`) performs a full O(d) scope snapshot via `new Map()` on every single DOM event. On high-frequency events (like `onmousemove` or `onscroll`), creating `new Map()` instances on every frame causes garbage collection churn.
- **Fix:** Skip snapshotting when `targetVM.declaredVars` is empty, and replace `new Map()` with lightweight record snapshots to eliminate allocation overhead.
- **Status:** **Open**

---

### `BUG-004`: `hydrateSelectively` Eager Case `unmount()` Breaks `.vm` / `.isHydrated` Invariant

- **Package:** `driftjs-dom`
- **Severity:** Low
- **Category:** Correctness / API Contract
- **Location:** [`packages/dom/src/selective.ts` L449–L468](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/selective.ts#L449-L468)
- **Description:** The eager case `unmount` handler sets `isHydrated = false` but the `vm` getter still returns the (now unmounted) `vmInstance`. After calling `ctrl.unmount()`, `ctrl.isHydrated` returns `false` while `ctrl.vm` returns a non-null dead VM — inconsistent with all other strategies where both become falsy after unmount.
- **Fix:** After `vmInstance.unmount()`, null out the local `vmInstance` variable so `.vm` also returns `null`.
- **Status:** **Open**

---

### `BUG-005`: Router `runGuardQueue` Guard Arity Detection via `guard.length` Is Unreliable After Transpilation

- **Package:** `driftjs-router`
- **Severity:** Medium
- **Category:** Correctness
- **Location:** [`packages/router/src/router.ts` L107–L153](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L107-L153)
- **Description:** `runGuardQueue` uses `guard.length >= 3` to detect callback-style (`next`-based) navigation guards. `Function.length` is unreliable when functions use default parameters `(to, from, next = () => {}) => {}` or rest parameters `(...args) => {}`.
- **Fix:** Always provide a tracking `next` function and resolve immediately if either `next()` is called or a non-undefined value is returned/resolved.
- **Status:** **Open**

---

### `BUG-006`: `addConstant` Duck-Type Detection of Acorn Nodes via `.type` String

- **Package:** `driftjs-compiler`
- **Severity:** High
- **Category:** Correctness / Runtime Bug
- **Location:** [`packages/compiler/src/generator.ts` L684–L700](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L684-L700)
- **Description:** `addConstant()` uses duck-typing to detect Acorn AST nodes by checking `typeof value[0] === 'object' && value[0]?.type`. This only checks the first element of an array, which could misidentify heterogeneous arrays.
- **Fix:** Add strict validation or explicit AST wrappers to ensure only valid Acorn AST statement/expression nodes are transpiled.
- **Status:** **Open**

---

### `BUG-007`: `getDynamicPcs` Bytecode Scanner Missing `REACTIVE_ASYNC` Opcode Case — Scan Aborts Early

- **Package:** `driftjs-dom`
- **Severity:** High
- **Category:** Correctness / Runtime Bug
- **Location:** [`packages/dom/src/index.ts` L616–L670](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L616-L670)
- **Description:** `getDynamicPcs()` scans bytecode to locate all dynamic instruction positions for `updateRowRegisters`. The switch handles `REACTIVE_IF` (+6), `REACTIVE_FOR` (+8), `RETURN` (+1), etc. — but has **no case for `REACTIVE_ASYNC`**, which the generator emits with **8 words**. The `default` branch sets `pc = bytecode.length`, terminating the scan immediately. Any module containing an `@async` block will return an incomplete `dynamicPcs` list, causing `updateRowRegisters` to silently skip all `INTERPOLATE_TEXT` and dynamic `SET_ATTR` instructions that appear **after** the async boundary.
- **Fix:**
  ```ts
  case Opcode.REACTIVE_ASYNC:
    pc += 8;  // parentReg + promiseIdx + aliasIdx + bodyIdx + fallbackIdx + catchIdx + depsIdx
    break;
  ```
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
