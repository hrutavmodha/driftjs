# DriftJS Bug Audit Report

This document contains a comprehensive bug audit of the **DriftJS** codebase, evaluated across three core criteria:
1. **Correctness** — Functional defects, spec mismatches, broken edge cases, and unexpected runtime behaviors.
2. **Security** — Vulnerabilities, CSP violations, unsanitized inputs, and prototype/scope pollution risks.
3. **Efficiency** — Memory leaks, redundant computations, uncleaned subscriptions, and performance bottlenecks.

---

## 📊 Executive Summary Matrix

| ID | Category | Severity | Component | Summary |
| :--- | :--- | :---: | :--- | :--- |
| **BUG-01** | Correctness | **Critical** | `driftjs-dom` | `unmount()` wipes global `eventHandlersMap`, disabling all event listeners across the entire app |
| **BUG-02** | Correctness | **Critical** | `driftjs-compiler` | Loops (`for`, `while`) wrapped in IIFEs trap `return` statements in component script functions |
| **BUG-03** | Correctness | **High** | `driftjs-compiler` | Naive regex in `@for` directive header parser corrupts iterables containing the word `key` |
| **BUG-04** | Correctness | **High** | `driftjs-compiler` / `driftjs-shared` | Assignment expressions (`a = 5`, `a += 5`) evaluate to `undefined` instead of assigned value |
| **BUG-05** | Correctness | **High** | `driftjs-dom` | `patchItemAttributes` fails to update DOM properties (`value`, `checked`, `selected`, `disabled`) |
| **BUG-06** | Correctness | **High** | `driftjs-dom` | `patchItemAttributes` corrupts root list elements with child element attribute values |
| **BUG-07** | Correctness | **High** | `driftjs-ssr` | Parent scope variables overwrite child component props during Server-Side Rendering |
| **BUG-08** | Correctness | **High** | `driftjs-ssr` | HTML entity escaping in SSR corrupts `<script>` JavaScript and `<style>` CSS blocks |
| **BUG-09** | Correctness | **High** | `driftjs-compiler` | Identifier scoping with `hasOwnProperty` fails to resolve standard browser globals on `Window.prototype` |
| **BUG-10** | Correctness | **High** | `create-drift` | Scaffolding in SSR mode removes `driftjs-dom`, causing client hydration to fail on startup |
| **BUG-11** | Correctness | **Medium** | `driftjs-compiler` | Case-sensitive closing tag check in lexer breaks uppercase / mixed-case raw text tags (`</SCRIPT>`) |
| **BUG-12** | Correctness | **Medium** | `driftjs-compiler` | Unhandled `RangeError` on invalid numeric HTML character entities crashes parser |
| **BUG-13** | Correctness | **Medium** | `driftjs-router` | Rebuilding route index after adding nested routes erases dynamically added top-level routes |
| **BUG-14** | Correctness | **Medium** | `driftjs-router` | History navigation abort fails to revert browser address bar URL due to hardcoded `delta: 0` |
| **BUG-15** | Correctness | **Medium** | `driftjs-compiler` | Division operator following postfix `++` or `--` is incorrectly parsed as a RegExp literal |
| **BUG-16** | Correctness | **Medium** | `driftjs-dom` | Non-bubbling events (`focus`, `blur`, `mouseenter`, `mouseleave`) are not captured by document delegation |
| **BUG-17** | Security | **High** | `driftjs-shared` | `executePrecompiledFn` uses `new Function()` for string thunks, violating strict CSP (`unsafe-eval`) |
| **BUG-18** | Security | **Medium** | `driftjs-ssr` | Unsanitized attribute names in SSR HTML serialization allow attribute injection |
| **BUG-19** | Efficiency | **High** | `driftjs-router` | `RouterView.drift` never unsubscribes from router, causing unbounded memory leaks on navigation |
| **BUG-20** | Efficiency | **Medium** | `driftjs-compiler` | `@switch` transformation clones discriminant into all branches, re-evaluating expressions with side effects |
| **BUG-21** | Efficiency | **Medium** | `driftjs-dom` | Unmounted child component VM instances are never cleaned up, leaking `activeVMCount` and memory |

---

## 🔍 Detailed Bug Findings

---

### #1. Correctness Bugs

#### BUG-01: `unmount()` wipes global `eventHandlersMap`, disabling all event listeners across the entire app
- **Severity:** Critical
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L131)
- **Description:**
  `DriftClientVM.eventHandlersMap` is a `static` WeakMap storing event listener closures for DOM nodes across all active VM instances in the application. In `DriftClientVM.prototype.unmount()`, line 131 executes:
  ```ts
  DriftClientVM.eventHandlersMap = new WeakMap();
  ```
- **Impact:**
  When *any* component unmounts (e.g. an `@if` conditional branch hides, a tab switches, or a modal closes), `eventHandlersMap` is re-initialized to a blank WeakMap. As a result, every other active component in the entire web application permanently loses all its event listeners. Clicks, inputs, and other interactions on remaining components cease to function.
- **Recommended Fix:**
  Remove `DriftClientVM.eventHandlersMap = new WeakMap();` from `unmount()`. Because `WeakMap` keys are object references to DOM nodes, removed nodes are automatically garbage-collected by the JavaScript engine once detached.

---

#### BUG-02: Loops (`for`, `while`) wrapped in IIFEs trap `return` statements in component script functions
- **Severity:** Critical
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1011-L1050)
- **Description:**
  In `astToJS`, `ForStatement`, `ForOfStatement`, `ForInStatement`, `WhileStatement`, and `DoWhileStatement` are wrapped in immediately invoked arrow functions:
  ```ts
  return `(() => { for (${initJS}; ${testJS}; ${updateJS}) ${bodyJS}; })()`;
  ```
- **Impact:**
  If a user declares a helper function in `<script>` that returns from inside a loop:
  ```javascript
  function findItem(items, targetId) {
    for (let item of items) {
      if (item.id === targetId) {
        return item; // Trapped inside arrow function IIFE!
      }
    }
    return null;
  }
  ```
  The `return item;` statement returns only from the arrow function IIFE, not from `findItem`. `findItem` continues execution past the loop and returns `null`. Additionally, labeled `break` or `continue` statements across loop boundaries fail with a `SyntaxError: Illegal break statement`.
- **Recommended Fix:**
  Emit loop statements directly without wrapping them in arrow function expressions when they appear inside statement blocks.

---

#### BUG-03: Naive regex in `@for` directive header parser corrupts iterables containing the word `key`
- **Severity:** High
- **Affected File:** [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L438-L442)
- **Description:**
  In `DriftParser.prototype.parseForDirective`, the loop header is split using a simple regular expression:
  ```ts
  const keyMatch = rawIterable.match(/\s+key\s+(.+)$/);
  if (keyMatch) {
    key = keyMatch[1]!.trim();
    rawIterable = rawIterable.slice(0, keyMatch.index).trim();
  }
  ```
- **Impact:**
  If the iterable expression contains the identifier `key` surrounded by spaces (e.g. `@for item in items.filter(x => x.key === 'active')`, `@for item in list.map(item => key)`, or `@for item in foo || key || bar`), the regex mistakenly matches inside the expression. `rawIterable` is truncated to `items.filter(x => x.` and `key` becomes `==='active')`, causing an Acorn parse error.
- **Recommended Fix:**
  Track parentheses and token depth when scanning for the top-level `key` keyword, identical to the paren-depth tracking used for `in` at lines 413–424.

---

#### BUG-04: Assignment expressions (`a = 5`, `a += 5`) evaluate to `undefined` instead of assigned value
- **Severity:** High
- **Affected Files:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L777-L781) and [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L4-L47)
- **Description:**
  `setScopeValue` has a `void` return type and returns `undefined`. In `astToJS`:
  ```ts
  return `(typeof setScopeValue === 'function' ? setScopeValue(scope, ${JSON.stringify(name)}, ${valJS}) : ...)`;
  ```
- **Impact:**
  In standard JavaScript, an assignment expression evaluates to the assigned value. In DriftJS, `(count = 10)` or `(count += 1)` evaluates to `undefined`. Expressions such as `let x = (y = 5)`, `if ((entry = getNext()))`, or `return (this.total += price)` evaluate to `undefined` or falsy.
- **Recommended Fix:**
  Update `setScopeValue` in `packages/utils/src/scope.ts` to return `val`, or update `astToJS` to return the assigned value.

---

#### BUG-05: `patchItemAttributes` fails to update DOM properties (`value`, `checked`, `selected`, `disabled`)
- **Severity:** High
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L730-L750)
- **Description:**
  In `DriftClientVM.prototype.patchItemAttributes` (the fast-path attribute updater for unchanged list rows), dynamic attributes are updated solely using `elem.setAttribute(attrName, targetVal)` and `elem.removeAttribute(attrName)`.
- **Impact:**
  For form elements (`<input>`, `<textarea>`, `<select>`, `<option>`), setting HTML attributes does not update user-interactive DOM properties (`input.value`, `input.checked`, `option.selected`, `button.disabled`) once modified by the user. Form inputs in `@for` lists display stale data during fast-path updates.
- **Recommended Fix:**
  Add property synchronization to `patchItemAttributes`:
  ```ts
  if (attrName in elem && (attrName === 'value' || attrName === 'checked' || attrName === 'selected' || attrName === 'disabled')) {
    (elem as any)[attrName] = val ?? '';
  }
  ```

---

#### BUG-06: `patchItemAttributes` corrupts root list elements with child element attribute values
- **Severity:** High
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L707-L750)
- **Description:**
  `patchItemAttributes` receives only `rootNode` (the root DOM node of a list item) and scans all `SET_ATTR` opcodes in `bodyMod.bytecode`. However, it applies *all* `SET_ATTR` instructions directly to `rootNode`, ignoring the target register operand (`bytecode[pc + 1]`).
- **Impact:**
  If a list item template contains child elements with dynamic attributes (e.g. `<li><span class={item.tag}></span><button disabled={item.locked}></button></li>`), `patchItemAttributes` applies the `class` and `disabled` attributes to the outer `<li>` element instead of the respective child elements.
- **Recommended Fix:**
  Filter `SET_ATTR` opcodes by destination register, or traverse the DOM child subtree according to register allocations.

---

#### BUG-07: Parent scope variables overwrite child component props during Server-Side Rendering
- **Severity:** High
- **Affected File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L129)
- **Description:**
  In `DriftServerVM.prototype.execute` under `Opcode.MOUNT_COMPONENT`, the child component scope is assembled as:
  ```ts
  subVm.execute(compMod, { scope: { props: propsObj, ...propsObj, ...this.scope } });
  ```
- **Impact:**
  Because `...this.scope` is spread *after* `...propsObj`, any variable in the parent scope with the same name as a prop passed to the child component will overwrite the prop's value. For instance, `<Child title="custom" />` rendered in a parent scope where `title = "default"` will receive `title: "default"`.
- **Recommended Fix:**
  Reorder the object spread so props take precedence:
  ```ts
  subVm.execute(compMod, { scope: { ...this.scope, ...propsObj, props: propsObj } });
  ```

---

#### BUG-08: HTML entity escaping in SSR corrupts `<script>` JavaScript and `<style>` CSS blocks
- **Severity:** High
- **Affected File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L320-L348)
- **Description:**
  `serializeNode` applies `escapeHtml` indiscriminately to all text node children:
  ```ts
  if (node.type === 'text') return escapeHtml(node.content ?? '');
  ```
- **Impact:**
  In HTML, `<script>` and `<style>` elements contain raw text (`RAWTEXT`), and browsers do not decode HTML character references inside them. When SSR renders `<script>if (a < b && c > d)</script>`, it outputs `<script>if (a &lt; b &amp;&amp; c &gt; d)</script>`. When executed by the browser, this throws a `SyntaxError: Unexpected token '<'`. Similarly, CSS selectors like `div > span` are serialized as `div &gt; span`, breaking CSS styles.
- **Recommended Fix:**
  Do not escape HTML entities for text children of `script` and `style` elements during serialization.

---

#### BUG-09: Identifier scoping with `hasOwnProperty` fails to resolve standard browser globals on `Window.prototype`
- **Severity:** High
- **Affected File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L719)
- **Description:**
  In `astToJS`, identifier lookup generates:
  ```ts
  (typeof globalThis !== 'undefined' && Object.prototype.hasOwnProperty.call(globalThis, ${JSON.stringify(node.name)}) ? globalThis[${JSON.stringify(node.name)}] : undefined)
  ```
- **Impact:**
  In standard browser environments, many standard Web APIs (including `document`, `fetch`, `localStorage`, `sessionStorage`, `location`, `alert`, `navigator`, and `customElements`) reside on `Window.prototype` or `WindowProperties` rather than as own properties of `window` / `globalThis`. `hasOwnProperty.call(globalThis, 'fetch')` returns `false`, causing these standard APIs to resolve to `undefined` in template expressions.
- **Recommended Fix:**
  Check `(node.name in globalThis)` or `(typeof globalThis[node.name] !== 'undefined')` instead of `hasOwnProperty`.

---

#### BUG-10: Scaffolding in SSR mode removes `driftjs-dom`, causing client hydration to fail on startup
- **Severity:** High
- **Affected File:** [`packages/cli/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L50-L52)
- **Description:**
  In `scaffoldProject`, when `renderMode === 'ssr'`, the CLI deletes `driftjs-dom` from `package.json` dependencies:
  ```ts
  } else if (renderMode === 'ssr') {
    if (pkgData.dependencies) {
      delete pkgData.dependencies['driftjs-dom'];
    }
  }
  ```
- **Impact:**
  The starter template client entry file `main.ts` contains:
  ```ts
  import { mount, hydrate } from 'driftjs-dom';
  if (root.children.length > 0) {
    hydrate(App, root);
  }
  ```
  When a user creates an SSR project via `create-drift`, running `npm install` and `npm run dev` fails with module not found for `driftjs-dom`.
- **Recommended Fix:**
  Retain `driftjs-dom` in `package.json` for SSR projects that utilize client-side hydration.

---

#### BUG-11: Case-sensitive closing tag check in lexer breaks uppercase / mixed-case raw text tags (`</SCRIPT>`)
- **Severity:** Medium
- **Affected File:** [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L763-L968)
- **Description:**
  `isRawTextClosingTagAhead` performs a case-sensitive check:
  ```ts
  if (!this.startsWith(closingSequence)) return false;
  ```
  where `closingSequence` is `</script>` or `</style>`.
- **Impact:**
  Valid HTML templates with uppercase or mixed-case closing tags (e.g. `<script>...</SCRIPT>` or `<style>...</Style>`) fail to exit raw-text mode, causing the lexer to consume the remainder of the file as raw text until unexpected EOF.
- **Recommended Fix:**
  Use case-insensitive prefix comparison for raw-text closing tag boundaries.

---

#### BUG-12: Unhandled `RangeError` on invalid numeric HTML character entities crashes parser
- **Severity:** Medium
- **Affected File:** [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L53-L57)
- **Description:**
  `decodeHTMLEntities` calls `String.fromCodePoint(code)` on parsed decimal and hexadecimal numeric entities without validating the code point range (0 to 0x10FFFF, excluding surrogate code points).
- **Impact:**
  Input templates containing out-of-range numeric character references (e.g. `&#999999999;` or `&#xD800;`) cause an uncaught `RangeError: Invalid code point` to crash the compilation process.
- **Recommended Fix:**
  Validate `code >= 0 && code <= 0x10FFFF && (code < 0xD800 || code > 0xDFFF)` or wrap in a try-catch returning the replacement character `\uFFFD` or original match.

---

#### BUG-13: Rebuilding route index after adding nested routes erases dynamically added top-level routes
- **Severity:** Medium
- **Affected File:** [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L389-L420)
- **Description:**
  `addRoute(object)` adds routes directly into `normalizedRoutes` and `nameMap` without updating the initial `routes` array. However, `addRoute(parentName, route)` calls `rebuildIndex()`, which clears `nameMap` and rebuilds exclusively from `routes`.
- **Impact:**
  If a developer dynamically registers top-level routes via `router.addRoute({...})` and later registers a nested child route via `router.addRoute('parent', {...})`, all previously added dynamic top-level routes are wiped from the router's index.
- **Recommended Fix:**
  Maintain dynamic routes in the internal route registry so `rebuildIndex()` preserves all dynamically registered routes.

---

#### BUG-14: History navigation abort fails to revert browser address bar URL due to hardcoded `delta: 0`
- **Severity:** Medium
- **Affected Files:** [`packages/router/src/router.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L333-L341) and [`packages/router/src/history.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/history.ts#L69-L74)
- **Description:**
  In `createWebHistory` and `createWebHashHistory`, `info.delta` is hardcoded to `0` on `popstate` events. In `router.ts`:
  ```ts
  if (failure && isNavigationFailure(failure, NavigationFailureType.aborted)) {
    if (info.delta) {
      history.go(-info.delta);
    }
  }
  ```
- **Impact:**
  When a user navigates Back or Forward in the browser and a `beforeEach` navigation guard aborts the navigation, `info.delta` is 0 (falsy). The router is unable to revert the browser's history position, leaving the address bar URL out of sync with the rendered route.
- **Recommended Fix:**
  Track history stack indices in `createWebHistory` and `createWebHashHistory` using `history.state` position counters to compute accurate `delta` values on popstate events.

---

#### BUG-15: Division operator following postfix `++` or `--` is incorrectly parsed as a RegExp literal
- **Severity:** Medium
- **Affected File:** [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L606-L614)
- **Description:**
  `isRegexStart` inspects the last non-whitespace character in the preceding expression buffer:
  ```ts
  if ('=(,:;!&|?[{}+-*%<>~^'.includes(lastChar!)) return true;
  ```
- **Impact:**
  For expressions containing postfix increment or decrement followed by division (e.g. `{ a++ / b }` or `@if (count-- / 2 > 0)`), the character immediately preceding `/` is `+` or `-`. The lexer misidentifies `/` as the start of a regular expression literal, causing lexing errors.
- **Recommended Fix:**
  Check whether `+` or `-` is part of a `++` or `--` token before categorizing it as an operator preceding a regular expression.

---

#### BUG-16: Non-bubbling events (`focus`, `blur`, `mouseenter`, `mouseleave`) are not captured by document delegation
- **Severity:** Medium
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L181-L204)
- **Description:**
  `ensureEventDelegated` attaches listeners to the document root with default bubbling (`useCapture: false`):
  ```ts
  root.addEventListener(eventName, listener);
  ```
- **Impact:**
  Events that do not bubble in the DOM (such as `focus`, `blur`, `mouseenter`, `mouseleave`, and `scroll`) never reach the document root listener, causing `onfocus`, `onblur`, `onmouseenter`, and `onmouseleave` handlers bound on template elements to never execute.
- **Recommended Fix:**
  Use capturing phase (`useCapture: true`) for non-bubbling events in global event delegation.

---

### #2. Security Bugs

#### BUG-17: `executePrecompiledFn` uses `new Function()` for string thunks, violating strict CSP (`unsafe-eval`)
- **Severity:** High
- **Affected File:** [`packages/utils/src/evaluator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/evaluator.ts#L25-L27)
- **Description:**
  When constant pool entries store `__drift_fn__` as a code string (e.g. in standalone compiler execution or dynamic template compilation), `executePrecompiledFn` dynamically compiles it at runtime:
  ```ts
  node._executableFn = typeof node.__drift_fn__ === 'string'
    ? new Function('return (' + node.__drift_fn__ + ')')()
    : node.__drift_fn__;
  ```
- **Impact:**
  1. Environments enforcing strict Content Security Policy (`script-src 'self'`) will block execution and throw `EvalError: Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script`.
  2. If untrusted template strings are compiled at runtime, evaluating them via `new Function` allows arbitrary code execution in the context of the running application.
- **Recommended Fix:**
  Ensure the Vite plugin and AOT compiler always emit native JavaScript function objects in generated ESM bundles, and document CSP requirements for dynamic in-browser compilation.

---

#### BUG-18: Unsanitized attribute names in SSR HTML serialization allow attribute injection
- **Severity:** Medium
- **Affected File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L330-L338)
- **Description:**
  In `serializeNode`, attribute names (`k`) from `node.attrs` are concatenated directly into the HTML string without escaping or validation:
  ```ts
  if (v === '' || v === true) {
    attrsStr += ` ${k}`;
  } else if (v !== null && v !== undefined && v !== false) {
    attrsStr += ` ${k}="${escapeHtml(String(v))}"`;
  }
  ```
- **Impact:**
  If attribute names are dynamically computed or constructed from untrusted user input, characters such as spaces, quotes, or `>` can break out of the HTML tag attributes, enabling Cross-Site Scripting (XSS) or attribute injection.
- **Recommended Fix:**
  Validate attribute names against standard HTML attribute name grammar (`/^[a-zA-Z_:][a-zA-Z0-9_.:-]*$/`) before serializing them into SSR markup.

---

### #3. Efficiency & Resource Management Bugs

#### BUG-19: `RouterView.drift` never unsubscribes from router, causing unbounded memory leaks on navigation
- **Severity:** High
- **Affected File:** [`packages/router/src/components/RouterView.drift`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/RouterView.drift#L24-L28)
- **Description:**
  In `RouterView.drift`, the router subscription is registered in `<script>`:
  ```javascript
  if (router && typeof router.subscribe === 'function') {
    router.subscribe(() => {
      updateCurrentComponent();
    });
  }
  ```
  The returned unsubscribe callback is discarded, and no unmount hook is implemented.
- **Impact:**
  Every time a `RouterView` component is mounted and subsequently unmounted (e.g. inside nested routes or conditional views), its callback remains in `router.subscribers`. Over time, navigation triggers an ever-growing list of callbacks on unmounted components, causing memory bloat and CPU waste.
- **Recommended Fix:**
  Store the unsubscribe callback and execute it when the component's VM is unmounted.

---

#### BUG-20: `@switch` transformation clones discriminant into all branches, re-evaluating expressions with side effects
- **Severity:** Medium
- **Affected File:** [`packages/compiler/src/transformer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L183-L191)
- **Description:**
  `transformSwitchToIfChain` clones the discriminant AST (`discAst`) into each `@if / @else if` test binary expression:
  ```ts
  const parsedTest: acorn.Node = {
    type: 'BinaryExpression',
    operator: '===',
    left: cloneAstNode(discAst) as any,
    right: caseAst as any,
  };
  ```
- **Impact:**
  For a `@switch` block with $N$ cases, if the discriminant expression involves a function call, calculation, or side effect (e.g. `@switch getStatus()`, `@switch count++`, or `@switch computeScore()`), the expression is re-evaluated up to $N$ times instead of once, wasting CPU cycles and executing side effects repeatedly.
- **Recommended Fix:**
  Evaluate the discriminant once and assign it to an internal temporary scope variable before evaluating case comparisons.

---

#### BUG-21: Unmounted child component VM instances are never cleaned up, leaking `activeVMCount` and memory
- **Severity:** Medium
- **Affected File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L291)
- **Description:**
  When `MOUNT_COMPONENT` executes, it instantiates `const childVM = new DriftClientVM();`, which increments `DriftClientVM.activeVMCount`. However, when child components are removed from the DOM (e.g. inside `@if` branch toggles or `@for` list updates), `childVM.unmount()` is never called.
- **Impact:**
  `DriftClientVM.activeVMCount` remains perpetually greater than 0, preventing global delegated event listeners on the document root from ever being cleaned up when the root application unmounts, and retaining child VM references in memory.
- **Recommended Fix:**
  Track child VM instances attached to DOM nodes and invoke `.unmount()` when removing or replacing component DOM nodes.

---
