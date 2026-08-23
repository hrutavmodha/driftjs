# DriftJS Bug Audit & Defect Report

This document records the comprehensive defect audit of the **DriftJS** codebase across all monorepo packages (`driftjs-compiler`, `driftjs-dom`, `driftjs-ssr`, `driftjs-shared`, `driftjs-router`, `driftjs-vite-plugin`, `create-drift`, and `drift-vscode`).

Every bug is evaluated and categorized under three primary criteria:
1. **Correctness** (runtime logic errors, edge cases, state synchronization, specification non-conformance)
2. **Security** (XSS, prototype pollution, state contamination, path traversal, ReDoS)
3. **Efficiency** (redundant microtask dispatching, memory leaks, uncollected regions, unneeded DOM thrashing)

All Bug IDs are maintained in strict serial order (`BUG-001` through `BUG-017`).

---

## 📊 Summary Matrix

| Bug ID | Title | Category | Severity | Affected Package / Subsystem | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| [`BUG-001`](#bug-001-typeerror-crash-in-serializenode-on-null--undefined-children) | `TypeError` Crash in `serializeNode` on Null / Undefined Children | Correctness | **High** | `driftjs-ssr` | **Resolved** |
| [`BUG-002`](#bug-002-cross-request-state-contamination-via-optionsscope-mutation) | Cross-Request State Contamination via `options.scope` Mutation | Security / Correctness | **High** | `driftjs-ssr` | **Resolved** |
| [`BUG-003`](#bug-003-missing-break-in-sequenceexpression-ast-identifier-extraction) | Missing `break;` in `SequenceExpression` AST Identifier Extraction | Correctness | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-004`](#bug-004-nested-objectarray-pattern-destructuring-generates-invalid-scope-variables) | Nested Object/Array Pattern Destructuring Generates Invalid Scope Variables | Correctness | **High** | `driftjs-compiler` | Open |
| [`BUG-005`](#bug-005-function-parameter-defaults-use-outer-locals-breaking-inter-parameter-references) | Function Parameter Defaults Use Outer Locals Breaking Inter-Parameter References | Correctness | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-006`](#bug-006-switch-transformation-pollutes-scope-with-synthetic-discriminant-variables) | `@switch` Transformation Pollutes Scope with Synthetic Discriminant Variables | Efficiency / Correctness | **Medium** | `driftjs-compiler` | Open |
| [`BUG-007`](#bug-007-dynamic-event-handlers-updating-to-nullundefined-fail-to-detach-listeners) | Dynamic Event Handlers Updating to `null`/`undefined` Fail to Detach Listeners | Correctness | **High** | `driftjs-dom` | **Resolved** |
| [`BUG-008`](#bug-008-unmountsubtree-fails-to-unregister-active-reactiveregions) | `unmountSubtree` Fails to Unregister Active `ReactiveRegion`s | Efficiency / Memory Leak | **Medium** | `driftjs-dom` | Open |
| [`BUG-009`](#bug-009-out-of-bounds-negative-index-access-in-lis-reconciler-getsequence) | Out-of-Bounds Negative Index Access in LIS Reconciler `getSequence` | Correctness | **Low** | `driftjs-dom` | **Resolved** |
| [`BUG-010`](#bug-010-hydrationcursor-permanently-discards-intermediate-nodes-on-type-mismatch) | `HydrationCursor` Permanently Discards Intermediate Nodes on Type Mismatch | Correctness | **High** | `driftjs-dom` | Open |
| [`BUG-011`](#bug-011-prototype-pollution-vulnerability-in-evaluatepropsspec) | Prototype Pollution Vulnerability in `evaluatePropsSpec` | Security | **High** | `driftjs-shared` | **Resolved** |
| [`BUG-012`](#bug-012-populateitemscope-drops-default-values-on-nullish-items-and-splits-commas-naively) | `populateItemScope` Drops Default Values on Nullish Items & Splits Commas Naively | Correctness | **Medium** | `driftjs-shared` | Open |
| [`BUG-013`](#bug-013-uncontrolled-recursive-redirects-cause-call-stack-overflow-in-router) | Uncontrolled Recursive Redirects Cause Call Stack Overflow in Router | Correctness / Efficiency | **Critical** | `driftjs-router` | **Resolved** |
| [`BUG-014`](#bug-014-router-guard-pipeline-prematurely-resolves-async-callback-guards) | Router Guard Pipeline Prematurely Resolves Async Callback Guards | Correctness | **High** | `driftjs-router` | Open |
| [`BUG-015`](#bug-015-arbitrary-directory-deletion-risk-in-cli-emptydirectory) | Arbitrary Directory Deletion Risk in CLI `emptyDirectory` | Security | **Critical** | `create-drift` | **Resolved** |
| [`BUG-016`](#bug-016-catastrophic-backtracking-redos-in-language-server-extractscriptvars) | Catastrophic Backtracking (ReDoS) in Language Server `extractScriptVars` | Security / Efficiency | **Medium** | `drift-vscode` | **Resolved** |
| [`BUG-017`](#bug-017-hover-provider-calculates-wrong-range-when-multiple-directives-occur-on-same-line) | Hover Provider Calculates Wrong Range When Multiple Directives Occur on Same Line | Correctness | **Low** | `drift-vscode` | **Resolved** |

---

## 🔍 Detailed Bug Findings

### BUG-001: `TypeError` Crash in `serializeNode` on Null / Undefined Children

- **Criteria:** Correctness
- **Severity:** High
- **Component:** `driftjs-ssr`
- **Affected File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L336-L345)
- **Description:**
  In `packages/ssr/src/index.ts`, [`serializeNode()`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L336-L383) serializes a virtual `ServerNode` tree into an HTML string. However, it lacks a guard for `null` or `undefined` input nodes at entry:
  ```ts
  export function serializeNode(node: ServerNode | string, isRawText = false, rawTag?: string): string {
    if (typeof node === 'string') return isRawText ? sanitizeRawContent(node, rawTag) : escapeHtml(node);
    if (node.type === 'text') return isRawText ? sanitizeRawContent(node.content ?? '', rawTag) : escapeHtml(node.content ?? '');
    ...
  ```
  If a child component is missing from scope, fails compilation, or an unassigned register is appended via `APPEND_CHILD`, `parentNode.children` contains `null` or `undefined`. Calling `serializeNode(null)` immediately crashes with:
  `TypeError: Cannot read properties of null (reading 'type')`.
- **Impact:** Entire server render fails unexpectedly with an unhandled exception instead of gracefully emitting an empty string or partial DOM tree.
- **Remediation:**
  Add a nullish guard at the start of `serializeNode`:
  ```ts
  if (!node) return '';
  ```

---

### BUG-002: Cross-Request State Contamination via `options.scope` Mutation

- **Criteria:** Security & Correctness
- **Severity:** High
- **Component:** `driftjs-ssr`
- **Affected File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L81-L88)
- **Description:**
  In [`DriftServerVM.execute()`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L79-L90), when an existing `options.scope` is passed into `execute()`, the server VM binds `this.scope` directly to the `options.scope` reference:
  ```ts
  this.scope = options.scope ? options.scope : { ...module.scope };
  if (module.scope) {
    for (const k of Object.keys(module.scope)) {
      if (!Object.prototype.hasOwnProperty.call(this.scope, k)) {
        this.scope[k] = module.scope[k];
      }
    }
  }
  ```
  Unlike `DriftClientVM` (which correctly creates prototype inheritance with `Object.assign(Object.create(parentOptionsScope), module.scope)`), the SSR VM writes directly into `options.scope`.
- **Impact:** In multi-tenant Node.js SSR environments, if an application passes a shared request context or root state to multiple components, component-local state variables mutate the caller's shared scope object, causing cross-request data leaks and state pollution between concurrent renders.
- **Remediation:**
  Use prototypal scope isolation in SSR:
  ```ts
  const parentScope = options.scope || null;
  this.scope = Object.assign(Object.create(parentScope), module.scope);
  ```

---

### BUG-003: Missing `break;` in `SequenceExpression` AST Identifier Extraction

- **Criteria:** Correctness
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L493-L502)
- **Description:**
  In [`DriftGenerator.extractIdentifiers()`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L441-L597), the `switch` statement handles `SequenceExpression` without a terminating `break;`:
  ```ts
  case 'SequenceExpression':
    if (Array.isArray(node.expressions)) {
      for (const expr of node.expressions) {
        for (const id of this.extractIdentifiers(expr)) ids.add(id);
      }
    }
  case 'ChainExpression':
  case 'ParenthesizedExpression':
    for (const id of this.extractIdentifiers(node.expression)) ids.add(id);
    break;
  ```
- **Impact:** After iterating through sequence expressions, execution falls through into `ChainExpression` and invokes `this.extractIdentifiers(node.expression)` where `node.expression` is `undefined` on `SequenceExpression` AST nodes. While `extractIdentifiers(undefined)` returns an empty set, this accidental fallthrough violates switch semantics and creates brittle AST traversal.
- **Remediation:**
  Insert the missing `break;` statement at line 498.

---

### BUG-004: Nested Object/Array Pattern Destructuring Generates Invalid Scope Variables

- **Criteria:** Correctness
- **Severity:** High
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1216-L1244)
- **Description:**
  In [`astToJS()`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L726-L1453) under `case 'VariableDeclaration':`, when generating JavaScript code for destructuring declarations:
  ```ts
  for (const prop of (d.id.properties || [])) {
    if (prop.type === 'Property') {
      ...
      let varName = prop.value?.name;
      if (!varName) {
        varName = astToJS(prop.value, locals);
      }
      if (varName) {
        setCalls.push(`((scope || {})[${JSON.stringify(varName)}] = ${expr})`);
      }
    }
  }
  ```
  If `prop.value` is a nested pattern (such as `let { user: { name } } = data;`), `prop.value.name` is `undefined`. `astToJS(prop.value, locals)` evaluates to the literal string `"{ name }"`. The emitted code then assigns `scope["{ name }"] = ...` instead of extracting the nested property `name`.
- **Impact:** Component scripts using nested object or array destructuring fail to populate inner variables on the component scope, causing expressions in templates relying on nested destructured variables to evaluate to `undefined`.
- **Remediation:**
  Recursively unroll nested `ObjectPattern` and `ArrayPattern` nodes in `astToJS` variable declaration code generation.

---

### BUG-005: Function Parameter Defaults Use Outer Locals Breaking Inter-Parameter References

- **Criteria:** Correctness
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L939-L959), [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1303), [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1342), [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1408)
- **Description:**
  When generating code for `FunctionDeclaration`, `ArrowFunctionExpression`, `FunctionExpression`, and `MethodDefinition` in `astToJS`:
  ```ts
  const newLocals = new Set(locals);
  if (node.params) {
    for (const p of node.params) {
      for (const pName of extractBindingNames(p)) {
        newLocals.add(pName);
      }
      paramNames.push(paramToJS(p, locals)); // <-- passes outer 'locals' instead of 'newLocals'
    }
  }
  ```
  `paramToJS(p, locals)` is called with `locals` (outer scope) rather than `newLocals`.
- **Impact:** If a parameter default value references an earlier parameter (e.g. `function format(text, prefix = text)`), `astToJS` checks `locals` which does not yet include `text`. `text` is incorrectly transpiled as a scope-lookup `_get(scope, "text")` instead of referencing the local parameter variable.
- **Remediation:**
  Pass `newLocals` to `paramToJS(p, newLocals)` across all function and method AST code generators.

---

### BUG-006: `@switch` Transformation Pollutes Scope with Synthetic Discriminant Variables

- **Criteria:** Efficiency & Correctness
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/transformer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L147-L208)
- **Description:**
  In [`DriftTransformer.transformSwitchToIfChain()`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L141-L277), when a `@switch` discriminant is not a simple identifier (e.g. `@switch getStatus()`), the transformer creates a synthetic assignment expression:
  ```ts
  const discVarName = `__drift_sw_${this.switchCounter++}`;
  ...
  leftNode = {
    type: 'AssignmentExpression',
    operator: '=',
    left: { type: 'Identifier', name: discVarName },
    right: cloneAstNode(discAst),
  };
  ```
  Because `discVarName` (`__drift_sw_0`) is not added to the module's `declaredVars`, `astToJS` transforms this into `setScopeValue(scope, '__drift_sw_0', getStatus())`.
- **Impact:** Component runtime scope becomes polluted with temporary internal variable keys. On every evaluation of the switch statement, `setScopeValue` calls `__drift_mark_dirty__('__drift_sw_0')`, scheduling unnecessary microtask updates and wasting CPU cycles.
- **Remediation:**
  Either register `discVarName` as a local lexical binding in the enclosing sub-module or wrap the transformed conditional in an IIFE passing the evaluated discriminant.

---

### BUG-007: Dynamic Event Handlers Updating to `null`/`undefined` Fail to Detach Listeners

- **Criteria:** Correctness
- **Severity:** High
- **Component:** `driftjs-dom`
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L455-L526)
- **Description:**
  In [`DriftClientVM`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L69-L1209) opcode handler for `SET_ATTR`:
  ```ts
  if (attrName.startsWith('on') && typeof val === 'function') {
    const eventName = attrName.slice(2).toLowerCase();
    ...
  } else {
    // Falls here when val is null or undefined for an 'on...' attribute
    elem.setAttribute(attrName, String(val));
  }
  ```
  If a dynamic event binding (e.g. `onclick={isEnabled ? handleClick : null}`) updates from a function to `null`, `typeof val === 'function'` is false. The VM falls into the `else` branch, setting `onclick="null"` attribute on the DOM element while leaving the old handler in `eventHandlersMap`.
- **Impact:** User clicks on the disabled element continue to trigger the previous event handler function because the delegated listener still finds the entry in `DriftClientVM.eventHandlersMap`.
- **Remediation:**
  When `attrName.startsWith('on')` and `val == null`, delete the entry from `eventHandlersMap`:
  ```ts
  if (attrName.startsWith('on')) {
    const eventName = attrName.slice(2).toLowerCase();
    if (typeof val === 'function') {
      ...
    } else {
      const handlers = DriftClientVM.eventHandlersMap.get(elem);
      if (handlers) delete handlers[eventName];
    }
  }
  ```

---

### BUG-008: `unmountSubtree` Fails to Unregister Active `ReactiveRegion`s

- **Criteria:** Efficiency / Memory Leak
- **Severity:** Medium
- **Component:** `driftjs-dom`
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L102-L122)
- **Description:**
  When DOM nodes are unmounted via [`DriftClientVM.unmountSubtree()`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L102-L122), the VM recurses over child nodes and unmounts child VMs in `mountedChildVMs`. However, any `ReactiveRegion` instances anchored to nodes within that subtree are never unlinked from `this.reactiveRegions` and `this.reactiveRegionsIndex`.
- **Impact:** Orphaned reactive regions remain active in memory. When variables referenced in their `deps` mutate, the dormant regions attempt to re-render, executing DOM operations on detached parent nodes and causing memory leaks.
- **Remediation:**
  Track associated reactive regions on subtree nodes or item records and invoke `this.removeRegion(region)` during subtree unmounting.

---

### BUG-009: Out-of-Bounds Negative Index Access in LIS Reconciler `getSequence`

- **Criteria:** Correctness
- **Severity:** Low
- **Component:** `driftjs-dom`
- **Affected File:** [`packages/dom/src/reconciler.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/reconciler.ts#L11-L12)
- **Description:**
  In [`getSequence()`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/reconciler.ts#L3-L43):
  ```ts
  for (let i = 0; i < len; i++) {
    const arrI = arr[i]!;
    if (arrI !== -1) {
      const lastIdx = result[result.length - 1]!;
      if (result.length === 0 || arr[lastIdx]! < arrI) {
  ```
  On the very first iteration where `result.length === 0`, `result[result.length - 1]` accesses `result[-1]` which is `undefined`. While JavaScript returns `undefined` without throwing, reading negative indices before checking `result.length === 0` is technically incorrect.
- **Impact:** Triggers de-optimizations in V8 JIT compiler due to negative property lookups on arrays.
- **Remediation:**
  Guard `lastIdx` lookup after verifying length:
  ```ts
  if (result.length === 0 || arr[result[result.length - 1]!]! < arrI) {
  ```

---

### BUG-010: `HydrationCursor` Permanently Discards Intermediate Nodes on Type Mismatch

- **Criteria:** Correctness
- **Severity:** High
- **Component:** `driftjs-dom`
- **Affected File:** [`packages/dom/src/hydration.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/hydration.ts#L19-L55)
- **Description:**
  In [`HydrationCursor`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/hydration.ts#L5-L56), methods advance the `TreeWalker` in loops:
  ```ts
  public claimElement(tag: string, doc: Document): Element {
    while (this.current && this.current.nodeType !== 1) {
      this.current = this.walker.nextNode();
    }
    if (this.current && this.current.nodeType === 1 && (this.current as Element).tagName.toLowerCase() === tag.toLowerCase()) {
      const node = this.current as Element;
      this.current = this.walker.nextNode();
      return node;
    }
    return doc.createElement(tag);
  }
  ```
  If `this.current` points to a comment or text node, `claimElement` skips past it. Since `TreeWalker` only advances forward, those skipped nodes are lost forever and cannot be claimed by subsequent `claimComment` or `claimText` calls. Furthermore, on tag mismatch, `this.current` is not advanced, leaving the cursor stuck on the mismatched node.
- **Impact:** SSR hydration fails to claim valid server-rendered comment delimiters (`<!--if-->`, `<!--for-->`) and text nodes whenever the AST structure differs slightly from DOM traversal order, causing duplicate DOM creation and broken event listeners.
- **Remediation:**
  Implement a backtracking-capable or lookahead cursor that preserves unmatched nodes in an uncollected pool rather than skipping forward irreversibly.

---

### BUG-011: Prototype Pollution Vulnerability in `evaluatePropsSpec`

- **Criteria:** Security
- **Severity:** High
- **Component:** `driftjs-shared`
- **Affected File:** [`packages/utils/src/evaluator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/evaluator.ts#L77-L90)
- **Description:**
  In [`evaluatePropsSpec()`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/evaluator.ts#L77-L90):
  ```ts
  export function evaluatePropsSpec(
    propsSpec: Record<string, any> | null | undefined,
    scope: Record<string, any>,
    declaredVars?: Set<string>
  ): Record<string, any> {
    if (!propsSpec || typeof propsSpec !== 'object') return {};
    const res: Record<string, any> = {};
    for (const key of Object.keys(propsSpec)) {
      if (key === '__drift_props__') continue;
      const rawVal = propsSpec[key];
      res[key] = evaluateExpression(rawVal, scope, declaredVars);
    }
    return res;
  }
  ```
  The function iterates over `propsSpec` and sets `res[key]` directly without validating against dangerous property names (`__proto__`, `constructor`, `prototype`).
- **Impact:** If untrusted input is passed through dynamic component props, prototype pollution can occur on `res` and `Object.prototype`, leading to potential remote code execution or application tampering.
- **Remediation:**
  Filter forbidden prototype keys:
  ```ts
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
  ```

---

### BUG-012: `populateItemScope` Drops Default Values on Nullish Items & Splits Commas Naively

- **Criteria:** Correctness
- **Severity:** Medium
- **Component:** `driftjs-shared`
- **Affected File:** [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L103-L159)
- **Description:**
  In [`populateItemScope()`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L103-L159):
  1. If `itemVal` is `null` or `undefined`, the block `if (itemVal && typeof itemVal === 'object')` is skipped completely. As a result, variables with default values in destructuring patterns (e.g. `@for { id, active = true } in items`) are never populated on the scope.
  2. `itemName.slice(1, -1).split(',')` naively splits on commas without tracking quotes or brackets. A default value such as `{ a = [1, 2], b = "x,y" }` is split into broken segments (`a = [1`, `2]`, `b = "x`, `y"`).
- **Impact:** Loop iterations over nullish items fail to receive default values, and complex destructuring patterns with commas in defaults crash or corrupt scope bindings.
- **Remediation:**
  Parse destructuring patterns using a character-level scanner that respects quotes and brackets, and populate defaults even when `itemVal` is nullish.

---

### BUG-013: Uncontrolled Recursive Redirects Cause Call Stack Overflow in Router

- **Criteria:** Correctness & Efficiency
- **Severity:** Critical
- **Component:** `driftjs-router`
- **Affected File:** [`packages/router/src/router.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L220-L226)
- **Description:**
  In [`pushWithGuards()`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L210-L330):
  ```ts
  if (targetRoute.matched.length > 0) {
    const leaf = targetRoute.matched[targetRoute.matched.length - 1]!;
    if (leaf.redirect) {
      const redirectTarget =
        typeof leaf.redirect === 'function' ? leaf.redirect(targetRoute) : leaf.redirect;
      return pushWithGuards(redirectTarget, true, isPop);
    }
  }
  ```
  If a circular redirect exists (e.g. `/login` -> `/dashboard` -> `/login`) or a navigation guard always redirects, `pushWithGuards` recursively calls itself with no redirect counter or hop limit.
- **Impact:** Triggers uncaught `RangeError: Maximum call stack size exceeded`, crashing the client application completely.
- **Remediation:**
  Add a maximum redirect count limit (e.g. `MAX_REDIRECTS = 20`) and abort with a `NavigationFailure` when exceeded.

---

### BUG-014: Router Guard Pipeline Prematurely Resolves Async Callback Guards

- **Criteria:** Correctness
- **Severity:** High
- **Component:** `driftjs-router`
- **Affected File:** [`packages/router/src/router.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L100-L135)
- **Description:**
  In [`runGuardQueue()`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L100-L135):
  ```ts
  const returned = guard(to, from, next);
  if (returned instanceof Promise) {
    guardRes = await returned;
  } else {
    guardRes = returned;
  }
  ```
  If a guard uses the 3-argument callback signature `(to, from, next) => { asyncAuth((ok) => next(ok)); }` and does not return a Promise, `returned` is `undefined`. `runGuardQueue` immediately concludes the guard passed and advances to the next step before `next()` is called.
- **Impact:** Protected routes are entered before asynchronous authentication or authorization checks complete.
- **Remediation:**
  Check `guard.length >= 3` and wrap callback-based guards in a `Promise` that resolves only when `next()` is invoked.

---

### BUG-015: Arbitrary Directory Deletion Risk in CLI `emptyDirectory`

- **Criteria:** Security
- **Severity:** Critical
- **Component:** `create-drift`
- **Affected File:** [`packages/cli/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L20-L22), [`packages/cli/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L123-L139)
- **Description:**
  In [`emptyDirectory()`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L123-L139):
  ```ts
  export function emptyDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;
    for (const file of fs.readdirSync(dirPath)) {
      if (file === '.git') continue;
      const fullPath = path.join(dirPath, file);
      ...
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
  ```
  When `overwriteMode === 'empty'`, `scaffoldProject` invokes `emptyDirectory(targetDir)` without verifying that `targetDir` is not the filesystem root (`/`), user home directory, or a system directory.
- **Impact:** A path traversal or misconfigured target path can recursively wipe critical system or project directories.
- **Remediation:**
  Enforce path boundary checks ensuring `targetDir` resolves within `process.cwd()` and is not root or home before deleting files.

---

### BUG-016: Catastrophic Backtracking (ReDoS) in Language Server `extractScriptVars`

- **Criteria:** Security & Efficiency
- **Severity:** Medium
- **Component:** `drift-vscode`
- **Affected File:** [`packages/vscode-plugin/src/server.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L131)
- **Description:**
  In `packages/vscode-plugin/src/server.ts`, [`extractScriptVars()`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L85-L154) uses a greedy regular expression to capture variable declarations:
  ```ts
  const declBlockRegex = /(?:let|const|var)\s+([^;]+)(?:;|$)/gm;
  ```
  On unclosed script statements or large files with complex multiline expressions, the `([^;]+)` quantifier causes catastrophic backtracking over newline boundaries.
- **Impact:** High CPU usage and freezing of the language server worker during interactive typing in VS Code.
- **Remediation:**
  Use non-greedy matching or parse via the AST-based `compile()` parser directly.

---

### BUG-017: Hover Provider Calculates Wrong Range When Multiple Directives Occur on Same Line

- **Criteria:** Correctness
- **Severity:** Low
- **Component:** `drift-vscode`
- **Affected File:** [`packages/vscode-plugin/src/server.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L436-L440)
- **Description:**
  In [`server.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L423-L470) onHover handler:
  ```ts
  const directiveMatch = lineText.match(/@(if|else\s+if|else|for|switch|case|default)\b/);
  if (directiveMatch) {
    const dirIdx = lineText.indexOf(directiveMatch[0]);
    if (charInLine >= dirIdx && charInLine <= dirIdx + directiveMatch[0].length) {
  ```
  `lineText.indexOf(directiveMatch[0])` always returns the index of the first occurrence on that line.
- **Impact:** If a line contains multiple directives (e.g. `@if (cond) { ... } @else { ... }`) or text before the directive, hovering over subsequent directives calculates the character offset based on the first occurrence, failing to show hover info for the second directive.
- **Remediation:**
  Iterate over all match occurrences using `matchAll` and test whether `charInLine` falls within the specific match offset.

---
