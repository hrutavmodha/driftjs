# 🐛 DriftJS Bug Tracker & Defect Audit

This document tracks identified bugs, duplication defects, native runtime re-inventions, architecture violations, and correctness issues across the DriftJS monorepo.

---

## 📊 Summary Matrix

| Bug ID | Title & Summary | Category | Severity | Target Package | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| [`BUG-001`](#bug-001-triplicate-dom-element-attribute-patching--normalization-in-driftclientvm) | Triplicate DOM Element Attribute Patching (`execute`, `updateAt`, and `patchItemAttributes`) | Duplication / Maintenance | **High** | `driftjs-dom` | **Resolved** |
| [`BUG-002`](#bug-002-duplicated-3-step-node-claiming--lookahead-in-hydrationcursor) | Duplicated 3-Step Node Claiming & Lookahead across `claimElement`, `claimText`, `claimComment` | Duplication / Clean Code | **Medium** | `driftjs-dom` | **Resolved** |
| [`BUG-003`](#bug-003-incomplete-constant-literal-serialization-in-driftjs-vite-plugin) | Incomplete Constant Literal Serialization in `serializeValueToJS` (`RegExp`, `Date`, `Set`, `Map` serialize to `{}`) | Correctness / Runtime Bug | **High** | `driftjs-vite-plugin` | **Resolved** |
| [`BUG-004`](#bug-004-brittle-string-based-destructuring--default-value-parsing-in-populateitemscope) | Brittle String-Based Destructuring & Default Value Parsing in `populateItemScope` | Correctness / Edge Cases | **Medium** | `driftjs-shared` | **Resolved** |
| [`BUG-005`](#bug-005-duplicate-history-state-wrapping--listener-management-in-historyts) | Duplicate History State Wrapping & Listener Management across `createWebHistory` and `createWebHashHistory` | Duplication / Architecture | **Low** | `driftjs-router` | **Resolved** |
| [`BUG-006`](#bug-006-redundant-function-calls-in-linkdrift-sfc-template) | Redundant Function Calls in `Link.drift` template instead of direct reactive bindings | Performance / Clean Code | **Low** | `driftjs-router` | **Resolved** |
| [`BUG-007`](#bug-007-ad-hoc-ascii-whitespace-checker-in-drifttransformer) | Ad-hoc ASCII Whitespace Checker in `DriftTransformer` (manual character code loops vs native regex/trim) | Re-invented Wheel | **Low** | `driftjs-compiler` | **Resolved** |
| [`BUG-008`](#bug-008-keyed-list-reconciler-fails-to-move-elements-to-list-end-when-refnode-is-null) | Keyed List Reconciler Fails to Move Elements to List End When `refNode` is Null | Correctness / Runtime Bug | **High** | `driftjs-dom` | **Resolved** |
| [`BUG-009`](#bug-009-catch-clause-ast-to-js-generator-evaluates-destructuring-parameter-defaults-with-outer-locals) | Catch Clause Ast-to-JS Generator Evaluates Destructuring Parameter Defaults with Outer Locals | Correctness / AST Codegen | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-010`](#bug-010-documentfragment-child-vms-retain-orphaned-references-in-weakmap-on-partial-subtree-unmounting) | DocumentFragment Child VMs Retain Orphaned References in WeakMap on Partial Subtree Unmounting | Lifecycle / Memory Leak | **Medium** | `driftjs-dom` | **Resolved** |
| [`BUG-011`](#bug-011-type-interface-and-enum-declarations-defined-directly-inside-src-files) | Type, Interface, and Enum Declarations Defined Directly Inside `src/` Files (Violating Monorepo Architecture Rule 1) | Architecture / Strict Typing | **Medium** | `driftjs-compiler` / `driftjs-router` | **Resolved** |

---

## 🔍 Detailed Bug Findings & Resolutions

### `BUG-001`: Triplicate DOM Element Attribute Patching & Normalization in `DriftClientVM`

- **Package:** `driftjs-dom`
- **Severity:** High
- **Category:** Code Duplication & Maintenance
- **Location:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L458-L546), [`lines 1025-1049`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L1025-L1049), [`lines 1139-1230`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L1139-L1230)
- **Description:** ~90 lines of DOM attribute setting and patching logic were duplicated across 3 separate execution paths (`execute()`, `updateAt()`, and `patchItemAttributes()`).
- **Resolution:** Extracted unified `applyDOMAttribute(elem, attrName, val, scope)` method on `DriftClientVM` and reused across all 3 execution paths.
- **Status:** **Resolved**

---

### `BUG-002`: Duplicated 3-Step Node Claiming & Lookahead in `HydrationCursor`

- **Package:** `driftjs-dom`
- **Severity:** Medium
- **Category:** Code Duplication & Clean Code
- **Location:** [`packages/dom/src/hydration.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/hydration.ts#L21-L134)
- **Description:** `claimElement()`, `claimText()`, and `claimComment()` each implemented identical 3-step search/lookahead algorithms.
- **Resolution:** Consolidated into a generic `claimNode<T extends Node>(predicate: (n: Node) => boolean, fallback: () => T): T` method.
- **Status:** **Resolved**

---

### `BUG-003`: Incomplete Constant Literal Serialization in `driftjs-vite-plugin`

- **Package:** `driftjs-vite-plugin`
- **Severity:** High
- **Category:** Correctness & Runtime Bug
- **Location:** [`packages/vite-plugin/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vite-plugin/src/index.ts#L17-L42)
- **Description:** `serializeValueToJS()` converted non-POJO objects into `{}` because it lacked explicit handlers for built-ins.
- **Resolution:** Added serialization handlers for `RegExp` (`val.toString()`), `Date` (`new Date(...)`), `Set` (`new Set(...)`), `Map` (`new Map(...)`), and TypedArrays (`new Uint8Array(...)`, `new Uint32Array(...)`).
- **Status:** **Resolved**

---

### `BUG-004`: Brittle String-Based Destructuring & Default Value Parsing in `populateItemScope`

- **Package:** `driftjs-shared`
- **Severity:** Medium
- **Category:** Correctness & Edge Cases
- **Location:** [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L170-L190)
- **Description:** `populateItemScope()` failed when destructuring default values contained dynamic expressions or function calls (e.g. `getFallbackName()`).
- **Resolution:** Enhanced `parseDefaultValue()` to evaluate dynamic expressions against scope keys and lookup valid scope variables without `with` statements.
- **Status:** **Resolved**

---

### `BUG-005`: Duplicate History State Wrapping & Listener Management in `history.ts`

- **Package:** `driftjs-router`
- **Severity:** Low
- **Category:** Code Duplication & Architecture
- **Location:** [`packages/router/src/history.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L75-L122), [`lines 180-227`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L180-L227)
- **Description:** Both `createWebHistory()` and `createWebHashHistory()` duplicated subscription management and state packing/unpacking.
- **Resolution:** Extracted shared helpers `createHistoryListeners()`, `extractHistoryState()`, and `buildHistoryState()`.
- **Status:** **Resolved**

---

### `BUG-006`: Redundant Function Calls in `Link.drift` SFC Template

- **Package:** `driftjs-router`
- **Severity:** Low
- **Category:** Performance & Clean Code
- **Location:** [`packages/router/src/components/Link.drift`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/Link.drift#L90-L98)
- **Description:** Cleaned up redundant local variable caching and ensured reactive attribute bindings connect directly with route changes.
- **Resolution:** Refactored `<script>` state and unified template expressions to bind directly to reactive variables.
- **Status:** **Resolved**

---

### `BUG-007`: Ad-hoc ASCII Whitespace Checker in `DriftTransformer`

- **Package:** `driftjs-compiler`
- **Severity:** Low
- **Category:** Re-invented Wheel
- **Location:** [`packages/compiler/src/transformer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L495-L504)
- **Description:** `isWhitespaceOnly()` in `DriftTransformer` used a manual char-code loop.
- **Resolution:** Replaced with standard `/^\s*$/.test(text)`.
- **Status:** **Resolved**

---

### `BUG-008`: Keyed List Reconciler Fails to Move Elements to List End When `refNode` is Null

- **Package:** `driftjs-dom`
- **Severity:** High
- **Category:** Correctness & Runtime Bug
- **Location:** [`packages/dom/src/reconciler.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/reconciler.ts#L201-L208)
- **Description:** When an item was moved to the tail of a keyed list, `refNode` was `null` and `insertBefore()` was skipped entirely, stranding the element in its old DOM position.
- **Resolution:** Added fallback to `parent.insertBefore(n, null)` when `refNode` is null. Added regression test verifying head-to-tail item reordering.
- **Status:** **Resolved**

---

### `BUG-009`: Catch Clause Ast-to-JS Generator Evaluates Destructuring Parameter Defaults with Outer Locals

- **Package:** `driftjs-compiler`
- **Severity:** Medium
- **Category:** Correctness & AST Codegen
- **Location:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L943-L953)
- **Description:** In `astToJS()` under `case 'CatchClause'`, `paramToJS(node.param, locals)` passed outer `locals` instead of `newLocals`.
- **Resolution:** Passed `newLocals` to `paramToJS(node.param, newLocals)`. Added compiler regression test for catch clause destructuring.
- **Status:** **Resolved**

---

### `BUG-010`: DocumentFragment Child VMs Retain Orphaned References in WeakMap on Partial Subtree Unmounting

- **Package:** `driftjs-dom`
- **Severity:** Medium
- **Category:** Lifecycle & Memory Leak
- **Location:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L407-L411), [`lines 102-113`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L102-L113)
- **Description:** Multi-root child component nodes left orphaned sibling entries in `childVMs` when unmounted individually.
- **Resolution:** Tracked all sibling nodes in `childEntry.nodes` and cleaned up all mapped nodes when `childVM.unmount()` executes.
- **Status:** **Resolved**

---

### `BUG-011`: Type, Interface, and Enum Declarations Defined Directly Inside `src/` Files

- **Package:** `driftjs-compiler` / `driftjs-router`
- **Severity:** Medium
- **Category:** Architecture & Strict Typing
- **Location:**
  - `packages/compiler/types/lexer-state.ts`: `ExprTokenKind`
  - `packages/compiler/types/ast.ts`: `TemplateASTVisitor`
  - `packages/router/types/index.ts`: `PathTokens`, `RouteMatcher`
- **Description:** Rule 1 of `AGENTS.md` mandates that all types, interfaces, and enums reside exclusively in `types/`.
- **Resolution:** Moved `ExprTokenKind`, `TemplateASTVisitor`, `PathTokens`, and `RouteMatcher` into their respective `types/` directories and updated barrel exports.
- **Status:** **Resolved**
