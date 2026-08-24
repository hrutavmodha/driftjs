# DriftJS Bug Audit & Defect Report

This document records the comprehensive defect audit of the **DriftJS** codebase across all monorepo packages (`driftjs-compiler`, `driftjs-dom`, `driftjs-ssr`, `driftjs-shared`, `driftjs-router`, `driftjs-vite-plugin`, `create-drift`, and `drift-vscode`).

Every bug is evaluated and categorized under three primary criteria:

1. **Correctness** (runtime logic errors, edge cases, state synchronization, specification non-conformance)
2. **Security** (XSS, prototype pollution, state contamination, path traversal, ReDoS)
3. **Efficiency** (redundant microtask dispatching, memory leaks, uncollected regions, unneeded DOM thrashing)

All Bug IDs are maintained in strict serial order (`BUG-001` through `BUG-034`).

---

## 📊 Summary Matrix

| Bug ID | Description | Category | Severity | Affected Package / Subsystem | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| [`BUG-001`](#bug-001-typeerror-crash-in-serializenode-on-null--undefined-children) | `TypeError` Crash in `serializeNode` on Null / Undefined Children (use nullish check `!node`) | Correctness | **High** | `driftjs-ssr` | **Resolved** |
| [`BUG-002`](#bug-002-cross-request-state-contamination-via-optionsscope-mutation) | Cross-Request State Contamination via `options.scope` Mutation (use native `Object.create(parentScope)`) | Security / Correctness | **High** | `driftjs-ssr` | **Resolved** |
| [`BUG-003`](#bug-003-missing-break-in-sequenceexpression-ast-identifier-extraction) | Missing `break;` in `SequenceExpression` AST Identifier Extraction | Correctness | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-004`](#bug-004-nested-objectarray-pattern-destructuring-generates-invalid-scope-variables) | Nested Object/Array Pattern Destructuring Generates Invalid Scope Variables (use recursive ESTree generator) | Correctness | **High** | `driftjs-compiler` | **Resolved** |
| [`BUG-005`](#bug-005-function-parameter-defaults-use-outer-locals-breaking-inter-parameter-references) | Function Parameter Defaults Use Outer Locals Breaking Inter-Parameter References (use native `Set<string>`) | Correctness | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-006`](#bug-006-switch-transformation-pollutes-scope-with-synthetic-discriminant-variables) | `@switch` Transformation Pollutes Scope with Synthetic Discriminant Variables (use sub-module scoping) | Efficiency / Correctness | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-007`](#bug-007-dynamic-event-handlers-updating-to-nullundefined-fail-to-detach-listeners) | Dynamic Event Handlers Updating to `null`/`undefined` Fail to Detach Listeners (use native `WeakMap.get` / `delete`) | Correctness | **High** | `driftjs-dom` | **Resolved** |
| [`BUG-008`](#bug-008-unmountsubtree-fails-to-unregister-active-reactiveregions) | `unmountSubtree` Fails to Unregister Active `ReactiveRegion`s (use region cleanup registration) | Efficiency / Memory Leak | **Medium** | `driftjs-dom` | **Resolved** |
| [`BUG-009`](#bug-009-out-of-bounds-negative-index-access-in-lis-reconciler-getsequence) | Out-of-Bounds Negative Index Access in LIS Reconciler `getSequence` (use array length bounds check) | Correctness | **Low** | `driftjs-dom` | **Resolved** |
| [`BUG-010`](#bug-010-hydrationcursor-permanently-discards-intermediate-nodes-on-type-mismatch) | `HydrationCursor` Permanently Discards Intermediate Nodes on Type Mismatch (use lookahead `TreeWalker`) | Correctness | **High** | `driftjs-dom` | **Resolved** |
| [`BUG-011`](#bug-011-prototype-pollution-vulnerability-in-evaluatepropsspec) | Prototype Pollution Vulnerability in `evaluatePropsSpec` (use prototype key filter check) | Security | **High** | `driftjs-shared` | **Resolved** |
| [`BUG-012`](#bug-012-populateitemscope-drops-default-values-on-nullish-items-and-splits-commas-naively) | `populateItemScope` Drops Default Values on Nullish Items & Splits Commas Naively (use balanced scanner) | Correctness | **Medium** | `driftjs-shared` | **Resolved** |
| [`BUG-013`](#bug-013-uncontrolled-recursive-redirects-cause-call-stack-overflow-in-router) | Uncontrolled Recursive Redirects Cause Call Stack Overflow in Router (use hop counter limit) | Correctness / Efficiency | **Critical** | `driftjs-router` | **Resolved** |
| [`BUG-014`](#bug-014-router-guard-pipeline-prematurely-resolves-async-callback-guards) | Router Guard Pipeline Prematurely Resolves Async Callback Guards (use native `Promise` wrapper) | Correctness | **High** | `driftjs-router` | **Resolved** |
| [`BUG-015`](#bug-015-arbitrary-directory-deletion-risk-in-cli-emptydirectory) | Arbitrary Directory Deletion Risk in CLI `emptyDirectory` (use native `path.resolve` + `os.homedir`) | Security | **Critical** | `create-drift` | **Resolved** |
| [`BUG-016`](#bug-016-catastrophic-backtracking-redos-in-language-server-extractscriptvars) | Catastrophic Backtracking (ReDoS) in Language Server `extractScriptVars` (use npm `acorn` parser) | Security / Efficiency | **Medium** | `drift-vscode` | **Resolved** |
| [`BUG-017`](#bug-017-hover-provider-calculates-wrong-range-when-multiple-directives-occur-on-same-line) | Hover Provider Calculates Wrong Range on Multiple Directives (use native `String.prototype.matchAll()`) | Correctness | **Low** | `drift-vscode` | **Resolved** |
| [`BUG-018`](#bug-018-naive-regex-in-language-server-extractscriptvars-treats-rhs-expressions-as-local-variables) | Naive Regex in LSP `extractScriptVars` Treats RHS as Variables (use npm `acorn` ESTree parser) | Correctness | **Medium** | `drift-vscode` | **Resolved** |
| [`BUG-019`](#bug-019-string-slicing-and-heuristic-scanners-in-for-header-parser-instead-of-recursive-descent) | String Slicing in `@for` Header Parser (use `DriftLexer` token stream / recursive descent) | Correctness | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-020`](#bug-020-path-splitting-on-slash-in-compilepathtoregex-precludes-multi-parameter-and-composite-segments) | Path Splitting in `compilePathToRegex` Precludes Multi-Params (use character tokenizer + `RegExp`) | Correctness | **Medium** | `driftjs-router` | **Resolved** |
| [`BUG-021`](#bug-021-monolithic-switch-ast-traversal-in-extractidentifiers-lacks-estree-visitor-pattern) | Monolithic `switch` AST Traversal in `extractIdentifiers` (use npm `estree-walker` visitor) | Correctness / Efficiency | **High** | `driftjs-compiler` | **Resolved** |
| [`BUG-022`](#bug-022-heuristic-buffer-splitting-in-isregexstart-for-lexer-slash-disambiguation) | Heuristic Buffer Splitting in `isRegexStart` for Slash Disambiguation (use lexer token lookbehind) | Correctness | **Low** | `driftjs-compiler` | **Resolved** |
| [`BUG-023`](#bug-023-ad-hoc-ast-transformation-in-drifttransformer-lacks-formal-visitor-pattern) | Ad-Hoc AST Transformation in `DriftTransformer` (use Template AST Visitor `traverse()`) | Efficiency / Architecture | **Medium** | `driftjs-compiler` | **Resolved** |
| [`BUG-024`](#bug-024-triplicate-hardcoded-definition-of-html-void-elements-set-across-compiler-and-ssr) | Triplicate Hardcoded Definition of Void Elements (use native `new Set()` in `driftjs-shared`) | Efficiency / Duplication | **Medium** | `driftjs-compiler` / `driftjs-ssr` | Open |
| [`BUG-025`](#bug-025-redundant-reimplementation-of-resolveiterable-iterator-conversion-across-5-modules) | Redundant `resolveIterable` Reimplementation (use native `Symbol.iterator` & `Array.from` via `resolveIterable`) | Efficiency / Duplication | **Medium** | `driftjs-dom` / `driftjs-ssr` / `driftjs-compiler` / `driftjs-shared` | Open |
| [`BUG-026`](#bug-026-duplicate-ast-pattern-binding-extraction-in-generator-extractbindingidentifiers-vs-extractbindingnames) | Duplicate AST Pattern Extraction in Generator (use shared `extractBindingNames` / npm `estree-walker`) | Efficiency / Duplication | **Low** | `driftjs-compiler` | Open |
| [`BUG-027`](#bug-027-duplicate-destructuring-assignment-transpilation-logic-in-asttojs) | Duplicate Destructuring Transpilation in `astToJS` (use native `Object.assign`/`Array.slice` helper) | Duplication / Architecture | **Medium** | `driftjs-compiler` | Open |
| [`BUG-028`](#bug-028-proliferation-of-8-disparate-character-level-bracket-and-quote-balancing-scanners) | Proliferation of 8 Bracket/Quote Scanners (use npm `acorn.tokenizer` / shared scanner utility) | Correctness / Duplication | **High** | `driftjs-compiler` / `driftjs-shared` | Open |
| [`BUG-029`](#bug-029-redundant-custom-recursive-object-cloner-cloneastnode-vs-native-structuredclone) | Redundant Custom Recursive Object Cloner (use native JS runtime `globalThis.structuredClone()`) | Redundancy / Efficiency | **Low** | `driftjs-compiler` | Open |
| [`BUG-030`](#bug-030-redundant-custom-recursive-directory-copier-copydirectory-vs-native-fscpsync) | Redundant Custom Directory Copier (use native Node.js `node:fs` `fs.cpSync({ recursive: true })`) | Redundancy / Efficiency | **Low** | `create-drift` | Open |
| [`BUG-031`](#bug-031-redundant-custom-url-query-string-parser--serializer-vs-native-urlsearchparams) | Redundant Custom URL Query Parser/Serializer (use native Web API `globalThis.URLSearchParams`) | Redundancy / Correctness | **Low** | `driftjs-router` | Open |
| [`BUG-032`](#bug-032-incomplete-hardcoded-html-entity-decoding-table-in-decodehtmlentities-vs-standard-html5-parser) | Incomplete Hardcoded HTML Entity Table (use npm package `he` / `html-entities`) | Correctness / Redundancy | **Medium** | `driftjs-compiler` | Open |
| [`BUG-033`](#bug-033-duplicated-and-inconsistent-path-normalization--slash-slicing-logic-in-router) | Duplicated Path Normalization in Router (use native Node.js `node:path` / unified router path helper) | Duplication / Correctness | **Low** | `driftjs-router` | Open |
| [`BUG-034`](#bug-034-regex-based-script-variable-extraction-in-language-server-duplicates-compiler-ast-parsing) | Regex-Based Script Variable Extraction in LSP (use npm package `acorn` `acorn.parse()`) | Duplication / Redundancy | **Medium** | `drift-vscode` | Open |

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

### BUG-018: Naive Regex in Language Server `extractScriptVars` Treats RHS Expressions as Local Variables

- **Criteria:** Correctness
- **Severity:** Medium
- **Component:** `drift-vscode`
- **Affected File:** [`packages/vscode-plugin/src/server.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L131-L151)
- **Description:**
  In `packages/vscode-plugin/src/server.ts`, `extractScriptVars()` uses naive regular expressions to capture declared variables from `<script>` blocks:
  ```ts
  const declBlockRegex = /(?:let|const|var)\s+([^;\r\n]+)(?:;|$)/g;
  const idRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
  while ((idMatch = idRegex.exec(declContent)) !== null) {
    seen.add(name);
    items.push({ label: name, kind: CompletionItemKind.Variable, ... });
  }
  ```
- **Impact:** In expressions like `let a = computeTotal(discount, tax);`, the identifiers `computeTotal`, `discount`, and `tax` are captured and falsely presented as declared reactive variables in autocomplete menus.
- **Remediation:** Parse the `<script>` contents with an Acorn ESTree parser and extract binding identifiers strictly from `VariableDeclaration.declarations[].id` patterns.

---

### BUG-019: String Slicing and Heuristic Scanners in `@for` Header Parser Instead of Recursive Descent

- **Criteria:** Correctness
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L435-L600)
- **Description:**
  In `packages/compiler/src/parser.ts`, `parseForDirective()` parses `@for` directive headers using ad-hoc string slicing and custom paren-balancing character loops (`findInIndex`, `keyMatchInfo` with regex `^(\s+key\s+)(.+)$`, and `commaIdx` loop):
  ```ts
  let inIndex = findInIndex(header);
  const lhs = header.slice(0, inIndex).trim();
  let rawIterable = header.slice(inIndex + 4).trim();
  ```
- **Impact:** Complex iterable expressions containing `in` operators (e.g. `(item in list.filter(x => 'key' in x))`) or ternary operators with `key` identifiers can be incorrectly sliced, breaking compilation.
- **Remediation:** Lex directive headers into structured tokens and parse the `@for` grammar via standard recursive descent.

---

### BUG-020: Path Splitting on `/` in `compilePathToRegex` Precludes Multi-Parameter and Composite Segments

- **Criteria:** Correctness
- **Severity:** Medium
- **Component:** `driftjs-router`
- **Affected File:** [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L216-L250)
- **Description:**
  In `packages/router/src/matcher.ts`, `compilePathToRegex()` segments route patterns by splitting naively on `/`:
  ```ts
  const segments = path.split('/').filter(Boolean);
  ```
- **Impact:** Composite path segments containing multiple inline parameters (e.g. `/files/:name.:ext`, `/users-:userId/posts-:postId`, or prefix matches `/api/v:version(\\d+)/`) cannot be matched because the entire segment is assumed to be a single parameter.
- **Remediation:** Tokenize route path strings character-by-character into token streams (`Literal`, `Param`, `Delimiter`) and compile route regexes without segment-level array splitting.

---

### BUG-021: Monolithic `switch (node.type)` AST Traversal in `extractIdentifiers` Lacks ESTree Visitor Pattern

- **Criteria:** Correctness & Efficiency
- **Severity:** High
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L441-L525)
- **Description:**
  In `packages/compiler/src/generator.ts`, `extractIdentifiers()` uses a monolithic 100+ line `switch(node.type)` statement that manually checks a hardcoded subset of ESTree node types.
- **Impact:** Any modern or unhandled ESTree node type (e.g. `MetaProperty`, `ImportExpression`, `ClassExpression`, `YieldExpression`, `PrivateIdentifier`, `TaggedTemplateExpression` edge cases) fails to traverse its child identifiers, resulting in missing reactive dependencies and stale UI renders.
- **Remediation:** Implement a standardized ESTree AST Visitor pattern (`walk(node, visitor)`) to guarantee exhaustive traversal across all node specifications.

---

### BUG-022: Heuristic Buffer Splitting in `isRegexStart` for Lexer Slash Disambiguation

- **Criteria:** Correctness
- **Severity:** Low
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L668-L678)
- **Description:**
  In `packages/compiler/src/lexer.ts`, `isRegexStart()` attempts to disambiguate division (`/`) from RegExp literals (`/.../`) by splitting the accumulated string buffer with regex:
  ```ts
  const lastWord = trimmed.split(/\s+/).pop();
  ```
- **Impact:** On complex expressions with trailing multiline comments or non-standard token sequences, the buffer inspection heuristic can misidentify division operators as regexes.
- **Remediation:** Track preceding token types in the lexer state machine rather than performing retroactive string splitting on the raw character buffer.

---

### BUG-023: Ad-Hoc AST Transformation in `DriftTransformer` Lacks Formal Visitor Pattern

- **Criteria:** Efficiency & Architecture
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/transformer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L53-L120)
- **Description:**
  In `packages/compiler/src/transformer.ts`, `DriftTransformer` manually branches and clones nodes through ad-hoc recursion (`transformNode`, `transformChildren`, `cloneAstNode`).
- **Impact:** Coupling AST traversal with whitespace stripping, script transformation, and directive rewriting prevents modular AST passes and increases the risk of missed subtree mutations.
- **Remediation:** Provide an explicit Template AST Visitor (`traverse(ast, visitors)`) allowing isolated, composable compiler transformation passes.

---

### BUG-024: Triplicate Hardcoded Definition of HTML Void Elements Set Across Compiler and SSR

- **Criteria:** Efficiency & Maintainability (Duplication)
- **Severity:** Medium
- **Component:** `driftjs-compiler` / `driftjs-ssr`
- **Affected File:** [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L84-L87), [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L21-L24), [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L41-L44)
- **Target API / Package:** Native JavaScript `Set` (`new Set<string>()`) exported from `driftjs-shared` / `packages/utils/src/constants.ts` conforming to the WHATWG HTML Void Elements specification.
- **Description:**
  The 14-element HTML void tag set (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`) is instantiated three separate times independently using `new Set(...)` across compiler and SSR packages:
  ```ts
  // packages/compiler/src/lexer.ts line 84
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  // packages/compiler/src/parser.ts line 21
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  // packages/ssr/src/index.ts line 41
  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);
  ```
- **Impact:** Any updates or corrections to void tag parsing in HTML specifications must be manually synchronized across three disparate files in two packages. Inconsistencies could lead to lexer/parser/SSR desynchronization.
- **Remediation:** Export a single canonical `VOID_ELEMENTS: ReadonlySet<string>` constant from `driftjs-shared` ([`packages/utils/src/constants.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/constants.ts)) and import it wherever required across compiler and SSR modules.

---

### BUG-025: Redundant Reimplementation of `resolveIterable` Iterator Conversion Across 5 Modules

- **Criteria:** Efficiency & Maintainability (Duplication)
- **Severity:** Medium
- **Component:** `driftjs-dom` / `driftjs-ssr` / `driftjs-compiler` / `driftjs-shared`
- **Affected File:** [`packages/dom/src/reconciler.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/reconciler.ts#L87-L91), [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L705-L709), [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L285-L289), [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L229-L233), [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L841)
- **Target API / Package:** Native JavaScript Runtime APIs `Array.isArray()`, `Symbol.iterator` protocol (`rawIter[Symbol.iterator]`), and `Array.from(rawIter)` wrapped centrally by `resolveIterable()` in `driftjs-shared`.
- **Description:**
  `driftjs-shared` provides a centralized `resolveIterable(rawIter)` helper function in [`packages/utils/src/evaluator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/evaluator.ts#L6-L12). However, five other locations across the codebase reimplement the identical logic inline using native `Array.isArray` and `Symbol.iterator`:
  ```ts
  const items = Array.isArray(rawIter)
    ? rawIter
    : rawIter && typeof rawIter[Symbol.iterator] === 'function'
    ? Array.from(rawIter)
    : [];
  ```
- **Impact:** Violates single-responsibility and DRY principles. Any enhancements (e.g. generator handling or async iterables) require patching multiple disjoint locations.
- **Remediation:** Replace all copy-pasted `Symbol.iterator` ternaries with calls to the canonical `resolveIterable(raw)` function imported from `driftjs-shared`.

---

### BUG-026: Duplicate AST Pattern Binding Extraction in Generator (`extractBindingIdentifiers` vs `extractBindingNames`)

- **Criteria:** Efficiency & Maintainability (Duplication)
- **Severity:** Low
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L416-L439), [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L663-L683)
- **Target API / Package:** Shared AST Pattern Traversal helper / npm package `estree-walker` or centralized `extractBindingNames()`.
- **Description:**
  `packages/compiler/src/generator.ts` contains two separate functions implementing the exact same recursive ESTree pattern traversal to extract variable binding names from `Identifier`, `ObjectPattern`, `ArrayPattern`, `AssignmentPattern`, and `RestElement`:
  1. `DriftGenerator.prototype.extractBindingIdentifiers(idNode)` (lines 416–439): Mutates `this.declaredVars`.
  2. `extractBindingNames(node)` (lines 663–683): Returns a `string[]`.
- **Impact:** Duplicate AST traversal implementations in the same file.
- **Remediation:** Refactor `extractBindingIdentifiers` to delegate directly to `extractBindingNames(node)` or use a standard ESTree pattern walker.

---

### BUG-027: Duplicate Destructuring Assignment Transpilation Logic in `astToJS`

- **Criteria:** Duplication & Architecture
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L806-L884), [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1215-L1329)
- **Target API / Package:** Native JavaScript Runtime APIs (`Object.assign()`, `Array.prototype.slice()`, `JSON.stringify()`) consolidated into a unified destructuring code-generator helper.
- **Description:**
  In `packages/compiler/src/generator.ts`, `astToJS()` contains two large, nearly identical blocks of destructuring pattern unrolling:
  1. In `case 'AssignmentExpression':` (lines 806–884) for `ArrayPattern` and `ObjectPattern`.
  2. In `generatePatternAssignments()` under `case 'VariableDeclaration':` (lines 1215–1329) for `ArrayPattern` and `ObjectPattern`.
  Both blocks duplicate key resolution, fallback default assignments, rest property slicing, and scope assignment emission.
- **Impact:** Destructuring fixes (such as nested destructuring recursion) applied to variable declarations must be manually duplicated into assignment expressions, creating risk of diverged semantics.
- **Remediation:** Unify destructuring code generation into a single reusable helper function handling both declarations and assignments using native JavaScript destructuring semantics.

---

### BUG-028: Proliferation of 8 Disparate Character-Level Bracket and Quote Balancing Scanners

- **Criteria:** Correctness & Maintainability (Duplication)
- **Severity:** High
- **Component:** `driftjs-compiler` / `driftjs-shared`
- **Affected File:** [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L266-L411), [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L679-L816), [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L437-L600), [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L102-L181)
- **Target API / Package:** Centralized Lexer Token Scanner / npm package `acorn` tokenizer (`acorn.tokenizer`) or shared balanced-delimiter utility in `driftjs-shared`.
- **Description:**
  Across `compiler` and `driftjs-shared`, 8 separate character-by-character loops implement disparate, ad-hoc state machines to track matching quotes (`"`, `'`, '`'), escape slashes (`\`), parens (`(`, `)`), brackets (`[`, `]`), and braces (`{`, `}`):
  1. `readDirectiveHeader` in `lexer.ts` (lines 266–411)
  2. `readInterpolationToken` in `lexer.ts` (lines 679–816)
  3. `hasMatchingOuterParens` in `parser.ts` (lines 437–456)
  4. `findInIndex` in `parser.ts` (lines 458–492)
  5. `keyMatchInfo` in `parser.ts` (lines 518–558)
  6. `commaIdx` in `parser.ts` (lines 575–600)
  7. `splitPatternEntries` in `scope.ts` (lines 102–148)
  8. `findTopLevelChar` in `scope.ts` (lines 150–181)
- **Impact:** Each scanner has subtly different edge-case handling (some handle template literals and comments, while others omit them completely), causing inconsistent syntax parsing across directives, template expressions, and runtime destructuring.
- **Remediation:** Centralize expression delimiter and balanced-token scanning into reusable scanner utilities in `driftjs-shared` or tokenize directive expressions with `acorn.tokenizer`.

---

### BUG-029: Redundant Custom Recursive Object Cloner (`cloneAstNode`) vs Native `structuredClone`

- **Criteria:** Efficiency & Redundancy
- **Severity:** Low
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/transformer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L15-L23)
- **Target API / Package:** Native JavaScript Runtime API `structuredClone()` (`globalThis.structuredClone` standard in Node.js 17+ and all modern browser engines).
- **Description:**
  In `packages/compiler/src/transformer.ts`, `cloneAstNode()` implements custom recursive object cloning using `Object.keys()`:
  ```ts
  function cloneAstNode<T>(node: T): T {
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(cloneAstNode) as any;
    const copy: any = {};
    for (const key of Object.keys(node)) {
      copy[key] = cloneAstNode((node as any)[key]);
    }
    return copy as T;
  }
  ```
  JavaScript runtimes natively provide `structuredClone()` (`globalThis.structuredClone`), which performs deep cloning with circular reference tracking and engine-level performance optimization.
- **Impact:** Redundant bespoke deep-cloning implementation that lacks cycle handling and object prototype fidelity compared to the native runtime API.
- **Remediation:** Replace `cloneAstNode` with native `structuredClone()` or shallow spread where appropriate.

---

### BUG-030: Redundant Custom Recursive Directory Copier (`copyDirectory`) vs Native `fs.cpSync`

- **Criteria:** Redundancy & Efficiency
- **Severity:** Low
- **Component:** `create-drift`
- **Affected File:** [`packages/cli/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L155-L170)
- **Target API / Package:** Native Node.js built-in module `node:fs` API `fs.cpSync(src, dest, { recursive: true, filter: ... })` (standard in Node.js >= 16.7.0).
- **Description:**
  In `packages/cli/src/index.ts`, `copyDirectory()` manually walks directory structures using `fs.readdirSync`, `fs.mkdirSync`, and `fs.copyFileSync`:
  ```ts
  function copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  ```
  Node.js (>= 16.7.0) natively provides `fs.cpSync(src, dest, { recursive: true, filter: ... })`.
- **Impact:** Unnecessary boilerplate and slower file system iteration compared to native libuv-backed `fs.cpSync`.
- **Remediation:** Replace `copyDirectory` with native `fs.cpSync(src, dest, { recursive: true, filter: (src) => !src.includes('node_modules') && !src.includes('dist') })` from `node:fs`.

---

### BUG-031: Redundant Custom URL Query String Parser & Serializer vs Native `URLSearchParams`

- **Criteria:** Redundancy & Correctness
- **Severity:** Low
- **Component:** `driftjs-router`
- **Affected File:** [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L25-L94)
- **Target API / Package:** Native Web / JavaScript Runtime APIs `URLSearchParams` (`globalThis.URLSearchParams`) and `URL` (`globalThis.URL`).
- **Description:**
  In `packages/router/src/matcher.ts`, `parseQuery()` and `stringifyQuery()` manually implement custom tokenization and serialization for query strings (splitting `&`, splitting `=`, calling `decodeURIComponent` / `encodeURIComponent`, and managing multi-value key arrays).
  Modern JavaScript runtimes natively provide `URLSearchParams` with full multi-value key support (`getAll`, `append`, `toString`).
- **Impact:** Reinvents standard web API behavior with manual string splitting and custom prototype pollution workarounds.
- **Remediation:** Leverage standard `URLSearchParams` (`new URLSearchParams(search)`) for search query parsing and stringification.

---

### BUG-032: Incomplete Hardcoded HTML Entity Decoding Table in `decodeHTMLEntities` vs Standard HTML5 Parser

- **Criteria:** Correctness & Redundancy
- **Severity:** Medium
- **Component:** `driftjs-compiler`
- **Affected File:** [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L48-L109)
- **Target API / Package:** npm package `he` (`import he from 'he'`; `he.decode()`) or `html-entities` (`import { decode } from 'html-entities'`).
- **Description:**
  In `packages/compiler/src/parser.ts`, `decodeHTMLEntities()` manually implements a 30-entry switch statement for named HTML entities (`amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`, `copy`, `reg`, `trade`, `mdash`, `ndash`, `hellip`, `euro`, etc.):
  ```ts
  switch (named) {
    case 'amp': return '&';
    case 'lt': return '<';
    ...
  }
  ```
  The HTML5 specification defines over 2,100 named character references (e.g. `&copy;`, `&infin;`, `&approx;`, `&sum;`, `&dagger;`). Any entity outside this hardcoded 30-case switch is left undecoded in text nodes.
- **Impact:** Valid HTML entities in templates fail to decode properly during compilation.
- **Remediation:** Utilize a standard HTML entity decoding library such as npm `he` (`he.decode(text)`) or `html-entities` (`decode(text)`).

---

### BUG-033: Duplicated and Inconsistent Path Normalization & Slash Slicing Logic in Router

- **Criteria:** Duplication & Maintainability
- **Severity:** Low
- **Component:** `driftjs-router`
- **Affected File:** [`packages/router/src/history.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L12-L42), [`packages/router/src/history.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L154-L165), [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L99-L105)
- **Target API / Package:** Native Node.js `node:path` (for posix path resolution) or a centralized path utility module in `driftjs-router`.
- **Description:**
  Across `driftjs-router`, path normalization logic is duplicated in multiple ad-hoc functions:
  - `normalizeBase(base)`: Trims, adds leading slash, removes trailing slash.
  - `stripBase(pathname, base)`: Checks prefix, slices, ensures leading slash.
  - `createHref(base, location)`: Normalizes location with ternary and prepends base.
  - `formatHashHref(location)`: Normalizes location with ternary and prepends hash.
  - `normalizePath(path)`: Regex replaces `/\/+/g` and manipulates leading/trailing slashes.
- **Impact:** Fragmented path normalization across router drivers increases maintenance burden and risks subtle routing discrepancies between HTML5 history, hash history, and route matching.
- **Remediation:** Centralize all URL and route path normalization into a unified path utility module within `driftjs-router`.

---

### BUG-034: Regex-Based Script Variable Extraction in Language Server Duplicates Compiler AST Parsing

- **Criteria:** Duplication & Redundancy
- **Severity:** Medium
- **Component:** `drift-vscode`
- **Affected File:** [`packages/vscode-plugin/src/server.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L85-L154)
- **Target API / Package:** npm package `acorn` (`import * as acorn from 'acorn'`) with `acorn.parse()` / `acorn.parseExpressionAt()`, or the shared `driftjs-compiler` AST extraction routines.
- **Description:**
  In `packages/vscode-plugin/src/server.ts`, `extractScriptVars()` uses fallback regular expressions (`/(?:let|const|var)\s+([^;\r\n]+)/g`, `/[a-zA-Z_$][a-zA-Z0-9_$]*/g`, `/function\s+([a-zA-Z0-9_$]+)\s*\(/g`) to inspect `<script>` blocks for declarations. This duplicates the AST parsing and variable declaration extraction logic already implemented with Acorn in `driftjs-compiler` (`DriftTransformer.transformScriptElement` and `DriftGenerator.extractBindingNames`).
- **Impact:** Duplicate and brittle variable detection in the language server that cannot handle complex JS syntax, destructuring with computed keys, or TypeScript annotations.
- **Remediation:** Directly parse `<script>` blocks using `acorn` (`acorn.parse(scriptBody, { ecmaVersion: 'latest', sourceType: 'module' })`) in the language server and reuse `driftjs-compiler` AST extraction routines.


