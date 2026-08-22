# DriftJS Codebase Bug Audit & Defect Report

This document provides a comprehensive, rigorous defect audit of the **DriftJS** codebase across all monorepo packages (`compiler`, `dom`, `ssr`, `router`, `utils`, `vite-plugin`, `cli`, and `vscode-plugin`).

All identified defects are evaluated across three core criteria:
1. **Correctness:** Logic errors, broken reactivity, event propagation anomalies, lifecycle failures, and routing bugs.
2. **Security:** Cross-Site Scripting (XSS), prototype pollution, global scope exposure, and unsafe string parsing.
3. **Efficiency:** Algorithmic bottlenecks, redundant traversals, and uncollected memory/event handlers.

---

## 📊 Defect Summary Matrix

| ID | Category | Package / Subsystem | File & Location | Severity | Summary |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **BUG-01** | Correctness | `driftjs-compiler` | [`packages/compiler/src/generator.ts:491`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L491-L493) | **High** | Computed `MemberExpression` dynamic index identifiers omitted from reactive bindings & deps. |
| **BUG-02** | Correctness | `driftjs-dom` | [`packages/dom/src/index.ts:255`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L248-L260) | **High** | Delegated event listener loop stops on first match (`break`), breaking standard DOM event bubbling. |
| **BUG-03** | Correctness | `driftjs-dom` | [`packages/dom/src/index.ts:726`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L726-L741) | **High** | Fast-path element reuse in list reconciler discards updated event handler mappings on root elements. |
| **BUG-04** | Correctness | `driftjs-router` | [`packages/router/src/components/RouterLink.drift:1`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/RouterLink.drift#L1-L49) | **Medium** | `RouterLink` missing router navigation subscription, causing active link CSS classes to stay frozen. |
| **BUG-05** | Correctness | `driftjs-router` | [`packages/router/src/history.ts:262`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L260-L265) | **Medium** | `createMemoryHistory` fails to strip base path on `initialLocation`. |
| **BUG-06** | Correctness | `driftjs-router` | [`packages/router/src/matcher.ts:338`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L338) | **Medium** | Custom regex route parameters with nested parentheses corrupt resolved URL paths. |
| **BUG-07** | Correctness | `driftjs-compiler` | [`packages/compiler/src/generator.ts:1164`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1164) | **Medium** | Object pattern destructuring defaults check `in` operator instead of `undefined`, overriding defaults. |
| **BUG-08** | Correctness | `driftjs-compiler` | [`packages/compiler/src/generator.ts:1154`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1154-L1164) | **Medium** | Destructuring computed property names in variable declarations treats code string as a literal key. |
| **BUG-09** | Correctness | `driftjs-compiler` | [`packages/compiler/src/transformer.ts:189`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L189-L215) | **High** | `@switch` transformation with dynamic discriminants leaves alternate branches with untracked deps. |
| **BUG-10** | Correctness | `driftjs-ssr` | [`packages/ssr/src/index.ts:261`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L261) | **Medium** | Server VM executes sub-modules with shared scope object instead of prototypal scope isolation. |
| **BUG-11** | Security | `driftjs-ssr` | [`packages/ssr/src/index.ts:337`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L337) | **Critical** | Unescaped `-->` in HTML comment serialization permits arbitrary script injection & SSR XSS. |
| **BUG-12** | Security | `driftjs-shared` | [`packages/utils/src/scope.ts:79`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L79-L82) | **Medium** | `getScopeValue` walks `Object.prototype` via `name in globalThis`, leaking standard prototypes. |
| **BUG-13** | Security | `driftjs-compiler` | [`packages/compiler/src/generator.ts:790`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L790-L802) | **Low** | ArrayPattern destructuring assignment indexes directly without iterable resolution. |
| **BUG-14** | Efficiency | `driftjs-dom` | [`packages/dom/src/index.ts:1074`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L1073-L1077) | **Medium** | $O(N)$ linear array search in `triggerUpdates` candidate region verification. |
| **BUG-15** | Efficiency | `driftjs-dom` | [`packages/dom/src/index.ts:194`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L194-L200) | **Low** | `markDirty` lacks unmount check, allowing unmounted VMs to schedule redundant microtasks. |

---

## 🔍 Detailed Defect Analysis

### 1. Correctness

#### `BUG-01`: Computed `MemberExpression` Identifier Extraction Omission in Generator
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L491-L493)
- **Severity:** High
- **Description:**
  In `DriftGenerator.extractIdentifiers(node)`, handling for `MemberExpression` only traverses `node.object`:
  ```typescript
  case 'MemberExpression':
    for (const id of this.extractIdentifiers(node.object)) ids.add(id);
    break;
  ```
  When an expression uses computed indexing (e.g. `items[selectedKey]` or `matrix[row][col]`), `node.property` contains an identifier (`selectedKey`, `row`, `col`). Because `node.property` is ignored when `node.computed === true`, `selectedKey` is never added to `ids`.
- **Impact:**
  The compiler fails to emit `ReactiveBinding` entries or include the variable in sub-module `deps`. Mutating `selectedKey` does not trigger DOM updates for `{items[selectedKey]}` or `@if items[selectedKey]`.
- **Suggested Fix:**
  ```typescript
  case 'MemberExpression':
    for (const id of this.extractIdentifiers(node.object)) ids.add(id);
    if (node.computed && node.property) {
      for (const id of this.extractIdentifiers(node.property)) ids.add(id);
    }
    break;
  ```

---

#### `BUG-02`: Delegated Event Listener Stops Traversal on First Handler (`break`), Breaking DOM Bubbling
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L248-L260)
- **Severity:** High
- **Description:**
  `DriftClientVM.ensureEventDelegated()` registers a document-level listener that traverses up from `e.target`:
  ```typescript
  const listener = (e: Event) => {
    let curr = e.target as Node | null;
    while (curr && curr !== root) {
      if (curr.nodeType === 1) {
        const handlers = DriftClientVM.eventHandlersMap.get(curr);
        if (handlers && handlers[eventName]) {
          handlers[eventName].call(curr, e);
          break; // <-- Terminates event dispatch immediately
        }
      }
      curr = curr.parentNode;
    }
  };
  ```
- **Impact:**
  Standard DOM event bubbling is completely broken for nested components/elements with event handlers. If a child element (`<button onclick={onBtnClick}>`) is clicked inside a container (`<div onclick={onContainerClick}>`), `onContainerClick` is never executed because `break;` aborts the ancestor traversal after `onBtnClick`.
- **Suggested Fix:**
  Traverse the ancestor chain and execute each matched handler unless `e.cancelBubble` or `e.defaultPrevented` / stopped flag is set.

---

#### `BUG-03`: Reconciler List Element Fast-Path Re-render Drops Updated Event Handlers
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L726-L741)
- **Severity:** High
- **Description:**
  When a list row in `@for` is re-rendered (due to item data change or index change), lines 726–740 execute `vm.runSubModule(bodyMod, childScope)`, which produces a fresh `DocumentFragment` containing `newElem`. `SET_ATTR` attaches new event listeners to `newElem` in `DriftClientVM.eventHandlersMap`.
  The reconciler then copies attributes and children from `newElem` onto the existing `elem` (`record.nodes[0]`) and discards `newElem`. However, `elem`'s entry in `DriftClientVM.eventHandlersMap` is not updated with `newElem`'s handlers.
- **Impact:**
  The reused root DOM element of the row retains the stale closure from its previous render. Event triggers invoke obsolete handlers or operate against old scope state.
- **Suggested Fix:**
  Copy/re-assign the handler mapping from `newElem` to `elem` in `DriftClientVM.eventHandlersMap` before discarding `newElem`.

---

#### `BUG-04`: `RouterLink` Single File Component Missing Router Change Subscription
- **Package:** `driftjs-router`
- **File:** [`packages/router/src/components/RouterLink.drift`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/RouterLink.drift#L1-L49)
- **Severity:** Medium
- **Description:**
  `RouterLink.drift` evaluates `computeHref()` and `computeClass()` upon initialization, but unlike `RouterView.drift`, it does not subscribe to `router.subscribe()`.
- **Impact:**
  When navigation occurs (e.g. `router.push('/about')`), `RouterLink` instances on the page are never informed of route changes. The active CSS classes (`router-link-active`, `router-link-exact-active`) remain frozen in their initial state.
- **Suggested Fix:**
  Subscribe to `router.subscribe()` inside `<script>` and mark component state dirty or update active status on route transitions.

---

#### `BUG-05`: Memory History Driver Fails to Strip Base Path on `initialLocation`
- **Package:** `driftjs-router`
- **File:** [`packages/router/src/history.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L260-L265)
- **Severity:** Medium
- **Description:**
  `createMemoryHistory(initialLocation = '/', base = '')` initializes its history stack using:
  ```typescript
  const entries: string[] = [initialLocation.startsWith('/') ? initialLocation : '/' + initialLocation];
  ```
  It does not apply `stripBase(initialLocation, normalizedBase)`.
- **Impact:**
  When initialized as `createMemoryHistory('/app/dashboard', '/app')`, `history.location` returns `'/app/dashboard'` instead of `'/dashboard'`, leading to route resolution mismatch in SSR and unit tests.
- **Suggested Fix:**
  Apply `stripBase(initialLocation, normalizedBase)` when initializing `entries`.

---

#### `BUG-06`: Custom Regex Route Param Substitution Corrupted by Nested Parentheses in `resolve()`
- **Package:** `driftjs-router`
- **File:** [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L338)
- **Severity:** Medium
- **Description:**
  `RouteMatcher.resolve()` performs parameter substitution in named paths using:
  ```typescript
  targetPath = targetPath.replace(/:([a-zA-Z0-9_]+)(?:\([^)]*\))?[?*+]?/g, ...);
  ```
  The pattern `(?:\([^)]*\))` does not support nested parentheses in custom regex constraints (e.g. `:id((a|b)+)` or `:code([0-9]{2,4}(?:-[a-z]+)?)`).
- **Impact:**
  Matching stops at the first closing parenthesis `)` and leaves residual regex tokens (e.g. `)+`) in the resulting URL string.

---

#### `BUG-07`: Object Pattern Destructuring Defaults Check `in` Operator Instead of `undefined`
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1164)
- **Severity:** Medium
- **Description:**
  In `astToJS` for `VariableDeclaration` with `ObjectPattern`, property extraction emits:
  ```typescript
  const expr = `((_obj && (${JSON.stringify(propKey)} in _obj)) ? _obj[${JSON.stringify(propKey)}] : ${defaultValJS ?? 'undefined'})`;
  ```
- **Impact:**
  In JavaScript destructuring (`const { a = 10 } = { a: undefined }`), default values apply whenever `_obj[key] === undefined`. Because Drift checks `propKey in _obj`, `{ a: undefined }` assigns `undefined` instead of `10`.
- **Suggested Fix:**
  Check `_obj[propKey] !== undefined` rather than `propKey in _obj`.

---

#### `BUG-08`: Destructuring Computed Properties in Variable Declarations Treats Code String as Literal Key
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1154-L1164)
- **Severity:** Medium
- **Description:**
  When destructuring with computed keys (e.g. `const { [key]: value } = obj`), `propKey` is transpiled as an expression string (`_get(scope, "key")`), but then wrapped in `JSON.stringify(propKey)`:
  ```typescript
  _obj[${JSON.stringify(propKey)}]
  ```
- **Impact:**
  Emits `_obj["(typeof _get === 'function' ? ...)"]` rather than evaluating `_obj[_get(scope, "key")]`.

---

#### `BUG-09`: `@switch` Transformation with Dynamic Discriminants Leaves Alternate Branches with Untracked Dependencies
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/transformer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L189-L215)
- **Severity:** High
- **Description:**
  When transforming `@switch (expr)` with non-trivial expressions (e.g. `state.status`), `DriftTransformer` transforms Case 1 into `(__drift_sw_0 = state.status) === val1` and subsequent cases into `__drift_sw_0 === val2`.
  Because `__drift_sw_0` is an internal synthetic variable not present in `declaredVars`, `DriftGenerator` extracts zero dependencies for subsequent `@case` sub-modules.
- **Impact:**
  Alternate `@case` branches fail to re-render when `state.status` changes because their sub-modules have empty dependency sets (`deps: []`).

---

#### `BUG-10`: Headless Server VM Executes Sub-modules Without Prototypal Scope Isolation
- **Package:** `driftjs-ssr`
- **File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L261)
- **Severity:** Medium
- **Description:**
  In `DriftServerVM.execute()`, `REACTIVE_IF` executes sub-modules passing `{ scope: this.scope }`. The sub-VM directly assigns `this.scope = options.scope` rather than wrapping it in `Object.create(this.scope)`.
- **Impact:**
  Sub-module scope mutations leak into the parent scope during SSR, causing scope pollution across rendered fragments.

---

### 2. Security

#### `BUG-11`: HTML Comment Injection & Cross-Site Scripting (XSS) in Server-Side Rendering
- **Package:** `driftjs-ssr`
- **File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L337)
- **Severity:** Critical
- **Description:**
  In `serializeNode()`, comment nodes are serialized directly without escaping or checking for comment closing sequences:
  ```typescript
  if (node.type === 'comment') return `<!--${node.content ?? ''}-->`;
  ```
- **Impact:**
  If user-controlled content is rendered in a comment (e.g. `<!-- ${userInput} -->`), input containing `--> <script>alert(document.cookie)</script> <!--` terminates the HTML comment boundary and executes arbitrary scripts in the client browser during SSR.
- **Suggested Fix:**
  Sanitize or escape `-->` sequences (e.g., replacing `-->` with `-- >` or `&#45;&#45;&gt;`) in `serializeNode()`.

---

#### `BUG-12`: Prototype Chain & Global Scope Exposure in Scope Evaluator (`_get` / `getScopeValue`)
- **Package:** `driftjs-shared`
- **File:** [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L79-L82)
- **Severity:** Medium
- **Description:**
  In `getScopeValue(scope, name)`:
  ```typescript
  if (typeof globalThis !== 'undefined' && globalThis && name in globalThis) {
    return (globalThis as any)[name];
  }
  ```
  The `in` operator inspects `Object.prototype` on `globalThis`.
- **Impact:**
  Accessing undeclared template variables matching prototype keys (such as `{constructor}`, `{valueOf}`, `{toString}`, `{isPrototypeOf}`) resolves to global prototype functions instead of `undefined`.
- **Suggested Fix:**
  Use `Object.prototype.hasOwnProperty.call(globalThis, name)` or an explicit global allowlist rather than `name in globalThis`.

---

#### `BUG-13`: Array Pattern Destructuring Assignment Without Iterable Resolution
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L790-L802)
- **Severity:** Low
- **Description:**
  In `astToJS` for `AssignmentExpression` with `ArrayPattern`, the RHS value `_val` is indexed directly (`_val[0]`, `_val[1]`) without wrapping in `resolveIterable(_val)`.
- **Impact:**
  Destructuring custom iterables, Sets, or Maps assigns `undefined` to all target variables, corrupting component state.

---

### 3. Efficiency

#### `BUG-14`: $O(N)$ Linear Array Search in `DriftClientVM.triggerUpdates`
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L1073-L1077)
- **Severity:** Medium
- **Description:**
  In `DriftClientVM.triggerUpdates()`:
  ```typescript
  for (const region of candidateRegions) {
    if (this.reactiveRegions.includes(region)) {
      region.reRender();
    }
  }
  ```
  `this.reactiveRegions` is stored as an array `ReactiveRegion[]`.
- **Impact:**
  Calling `this.reactiveRegions.includes(region)` inside the candidate loop results in $O(N \cdot M)$ time complexity. In templates with hundreds of nested `@if` or `@for` blocks, microtask flushes incur unnecessary overhead.
- **Suggested Fix:**
  Maintain `this.reactiveRegions` as a `Set<ReactiveRegion>` for $O(1)$ membership checks.

---

#### `BUG-15`: `markDirty` Lacks Unmount Guard Leading to Redundant Scheduled Microtasks
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L194-L200)
- **Severity:** Low
- **Description:**
  `DriftClientVM.markDirty(varName)` queues a microtask without verifying whether `this.module` is null or the VM has been unmounted.
- **Impact:**
  Asynchronous timers or promises completing after VM destruction schedule redundant microtasks that perform no-op flushes against emptied registers.
- **Suggested Fix:**
  Guard `markDirty()` with `if (!this.module) return;`.

---

## 📋 Recommended Action Plan

1. **Immediate Security Patches:**
   - Sanitize `-->` comment closing sequences in `DriftServerVM.serializeNode()`.
   - Prevent prototype chain lookups in `getScopeValue()` by replacing `name in globalThis` with `Object.prototype.hasOwnProperty.call(globalThis, name)`.
2. **Reactivity & Event Handling Corrections:**
   - Update `DriftGenerator.extractIdentifiers()` to traverse `node.property` for computed `MemberExpression`s.
   - Fix delegated event listener in `DriftClientVM` to continue traversing ancestors unless propagation is stopped.
   - Sync `WeakMap` event handlers on root elements when reusing DOM nodes in `reconcileKeyedList`.
3. **Router Synchronizations:**
   - Add `router.subscribe()` to `RouterLink.drift`.
   - Apply `stripBase` in `createMemoryHistory`.
   - Improve regex parameter substitution in `RouteMatcher.resolve()` to support nested parentheses.
4. **Performance Improvements:**
   - Convert `DriftClientVM.reactiveRegions` from `ReactiveRegion[]` to `Set<ReactiveRegion>`.
