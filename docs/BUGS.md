# DriftJS Codebase Bug Audit Report

This document contains a comprehensive security, correctness, and efficiency evaluation of the **DriftJS** monorepo codebase. All findings have been audited and verified directly against the latest source code across all packages (`driftjs-compiler`, `driftjs-dom`, `driftjs-ssr`, `driftjs-shared`, `driftjs-router`, `driftjs-vite-plugin`, `create-drift`, and `drift-vscode`).

---

## 📊 Bug Inventory & Evaluation Matrix

Total Identified Defects: **17**

| Bug ID                                                                                        | Category              |     Severity     | Package                           | Target File                                                  | Summary                                                                                                               |
| :-------------------------------------------------------------------------------------------- | :-------------------- | :--------------: | :-------------------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| [`BUG-01`](#bug-01-html-entity-decoding-corrupts-script-and-style-contents)                  | **Correctness** |  **High**  | `driftjs-compiler`              | `packages/compiler/src/parser.ts`                          | Parser applies HTML entity decoding to raw`<script>` and `<style>` blocks                                         |
| [`BUG-02`](#bug-02-missing-chainexpression-support-in-reactive-dependency-extraction)        | **Correctness** |  **High**  | `driftjs-compiler`              | `packages/compiler/src/generator.ts`                       | Missing`ChainExpression` in `extractIdentifiers` breaks optional chaining reactivity (`?.`)                     |
| [`BUG-03`](#bug-03-lexer-string-scanner-fails-on-escaped-quotes-in-attribute-literals)       | **Correctness** |  **High**  | `driftjs-compiler`              | `packages/compiler/src/lexer.ts`                           | Quoted attribute value scanner does not handle escaped quotes (`\"`, `\'`)                                        |
| [`BUG-04`](#bug-04-destructuring-aliasing-and-defaults-ignored-in-for-item-scope)            | **Correctness** |  **High**  | `driftjs-shared`                | `packages/utils/src/scope.ts`                              | `@for` loop item destructuring assigns property names instead of alias variables                                    |
| [`BUG-05`](#bug-05-transpiler-unconditionally-rewrites-this-to-scope-in-classes-and-methods) | **Correctness** |  **High**  | `driftjs-compiler`              | `packages/compiler/src/generator.ts`                       | `astToJS` transpiler unconditionally rewrites `this` to `'scope'`, breaking classes & OOP methods               |
| [`BUG-06`](#bug-06-multi-root-for-items-fail-fast-path-attribute-patching)                   | **Correctness** |  **High**  | `driftjs-dom`                   | `packages/dom/src/index.ts`                                | `patchItemAttributes` only inspects first root node, ignoring sibling elements in multi-root list items             |
| [`BUG-07`](#bug-07-child-component-prop-updates-fail-to-unset-removed-props)                 | **Correctness** | **Medium** | `driftjs-dom`                   | `packages/dom/src/index.ts`                                | `updateChildComponentProps` never clears props removed from parent prop bindings                                    |
| [`BUG-08`](#bug-08-named-route-parameter-interpolation-stringifies-undefined-as-undefined)   | **Correctness** | **Medium** | `driftjs-router`                | `packages/router/src/matcher.ts`                           | `interpolatePathParams` stringifies `{ id: undefined }` as literal `"/undefined"`                               |
| [`BUG-09`](#bug-09-routerlink-and-link-fail-to-react-to-dynamic-prop-changes)                | **Correctness** | **Medium** | `driftjs-router`                | `packages/router/src/components/RouterLink.drift`          | `RouterLink` and `Link` only update on history navigation, ignoring dynamic `to` prop updates                   |
| [`BUG-10`](#bug-10-vite-plugin-serializes-nan-and-infinity-as-null)                          | **Correctness** | **Medium** | `driftjs-vite-plugin`           | `packages/vite-plugin/src/index.ts`                        | `serializeValueToJS` uses `JSON.stringify`, converting `NaN` and `Infinity`, constants to `null`            |
| [`BUG-11`](#bug-11-sanitizedependencies-fails-on-workspace-range-protocols)                  | **Correctness** | **Medium** | `create-drift`                  | `packages/cli/src/index.ts`                                | `sanitizeDependencies` does not sanitize `workspace:^` or `workspace:~`, generating invalid npm versions        |
| [`BUG-12`](#bug-12-language-server-misses-multi-variable-and-destructuring-declarations)     | **Correctness** |  **Low**  | `drift-vscode`                  | `packages/vscode-plugin/src/server.ts`                     | Language server regex only captures first variable in comma-separated`let` declarations                             |
| [`BUG-13`](#bug-13-prototype-pollution-and-key-collision-in-route-query-parser)              | **Security**    |  **High**  | `driftjs-router`                | `packages/router/src/matcher.ts`                           | `parseQuery` uses standard Object `{}` and `in` operator, allowing `Object.prototype` key collisions          |
| [`BUG-14`](#bug-14-ssr-comment-sanitization-bypass-via-html5-bang-delimiter)                 | **Security**    |  **High**  | `driftjs-ssr`                   | `packages/ssr/src/index.ts`                                | `serializeNode` only replaces `-->`, allowing HTML comment breakout and XSS via `--!>`                          |
| [`BUG-15`](#bug-15-inconsistent-aria-and-data-boolean-attribute-stripping)                   | **Security**    | **Medium** | `driftjs-ssr` / `driftjs-dom` | `packages/ssr/src/index.ts`, `packages/dom/src/index.ts` | Attributes like`aria-hidden={false}` are completely stripped instead of serializing as string `"false"`           |
| [`BUG-16`](#bug-16-event-handler-scope-snapshotting-triggers-redundant-reactive-updates)     | **Efficiency**  |  **High**  | `driftjs-dom`                   | `packages/dom/src/index.ts`                                | Shallow spread`{ ...targetVM.scope }` causes all prototype-inherited variables to trigger re-renders on every event |
| [`BUG-17`](#bug-17-mount-does-not-return-unmount-handle-causing-event-listener-leaks)        | **Efficiency**  | **Medium** | `driftjs-dom`                   | `packages/dom/src/index.ts`                                | `mount()` returns `void`, preventing caller cleanup and causing `activeVMCount` and global listeners to leak    |

---

## 🔍 Detailed Bug Reports

### BUG-01: HTML Entity Decoding Corrupts `<script>` and `<style>` Contents

- **Category:** Correctness
- **Severity:** High
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L184-L191)

#### Description & Root Cause

In `DriftParser.parseChild()`, all `TokenType.Text` tokens are processed through `decodeHTMLEntities(token.value)`. When the lexer consumes `<script>` or `<style>` tags, their body content is emitted as `TokenType.Text`. Consequently, any HTML character references inside script or style blocks (such as `&amp;`, `&quot;`, `&apos;`, `&lt;`, `&gt;`, `&copy;`, etc.) are decoded before being passed to Acorn.
For example, a script line like `const message = "Tom &amp; Jerry";` is transformed into `const message = "Tom & Jerry";`. Worse, `const json = "&quot;hello&quot;";` is transformed into `const json = ""hello"";`, resulting in an unrecoverable Acorn JavaScript syntax parse error.

#### Impact

Breaks valid JavaScript and CSS embedded in Single File Components whenever entity sequences or string literals containing ampersands appear.

#### Remediation

In `parseElement()`, check if `isRawTextTagName(tagName)` is true (i.e. `script` or `style`). If so, consume the text node directly without invoking `decodeHTMLEntities()`.

---

### BUG-02: Missing `ChainExpression` Support in Reactive Dependency Extraction

- **Category:** Correctness
- **Severity:** High
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L441-L594)

#### Description & Root Cause

`DriftGenerator.extractIdentifiers()` recursively traverses Acorn AST nodes to detect variable dependencies for reactive binding registration and `@if` / `@for` region subscriptions. Acorn generates AST nodes of type `ChainExpression` for optional chaining expressions (e.g. `user?.name`, `list?.items`, `state?.count`).
However, `extractIdentifiers()` lacks a `case 'ChainExpression':` branch in its `switch (node.type)` statement. When evaluating expressions with optional chaining, `extractIdentifiers()` falls through to `default` and returns an empty `Set()`.

#### Impact

Variables accessed using optional chaining (`?.`) are not recorded in `CompiledModule.reactiveBindings` or region dependencies. Subsequent mutations to those variables fail to trigger in-place DOM updates or reactive region re-renders.

#### Remediation

Add `case 'ChainExpression':` to `extractIdentifiers()`:

```ts
case 'ChainExpression':
  for (const id of this.extractIdentifiers(node.expression)) ids.add(id);
  break;
```

---

### BUG-03: Lexer String Scanner Fails on Escaped Quotes in Attribute Literals

- **Category:** Correctness
- **Severity:** High
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L876-L904)

#### Description & Root Cause

In `DriftLexer.readQuotedStringToken()`, the scanner terminates the string token as soon as `this.peek() === quote` without checking whether the quote character is escaped with a preceding backslash `\`.
For attributes containing escaped quotes (e.g. `<input placeholder="He said \"hello\"" />` or `<div title='It\'s ready'>`), the scanner exits at the first inner quote, causing the remaining string content and backslash to be parsed as tag attributes, throwing `DriftLexerError: Unexpected character '\' inside tag`.

#### Impact

Developers cannot use escaped quotes inside static attribute strings.

#### Remediation

Track backslash escape state in `readQuotedStringToken()`:

```ts
let isEscaped = false;
while (!this.isAtEnd()) {
  const ch = this.peek();
  if (isEscaped) {
    isEscaped = false;
    value += this.advance();
    continue;
  }
  if (ch === '\\') {
    isEscaped = true;
    value += this.advance();
    continue;
  }
  if (ch === quote) {
    this.advance();
    ...
  }
}
```

---

### BUG-04: Destructuring Aliasing and Defaults Ignored in `@for` Item Scope

- **Category:** Correctness
- **Severity:** High
- **Package:** `driftjs-shared`
- **File:** [`packages/utils/src/scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L103-L129)

#### Description & Root Cause

`populateItemScope()` provides destructuring support for `@for` items. For object destructuring:

```ts
if (itemName.startsWith('{') && itemName.endsWith('}')) {
  if (itemVal && typeof itemVal === 'object') {
    const keys = itemName.slice(1, -1).split(',').map((s) => s.trim().split(':')[0]?.trim() || '');
    for (const k of keys) {
      if (k) scope[k] = (itemVal as any)[k];
    }
  }
}
```

When a user writes `@for { id: userId, name } in users`, `split(':')[0]` takes the object property name (`id`), and sets `scope['id'] = itemVal['id']`. The intended alias variable `userId` is completely ignored and remains `undefined` in scope.
Furthermore, default values like `{ count = 0 }` produce `scope['count = 0'] = itemVal['count = 0']`.

#### Impact

Using standard JavaScript destructuring aliases or default values in `@for` loops causes undefined variable references in templates.

#### Remediation

Properly extract both key and target variable names, supporting aliases (`{ prop: alias }`) and default values (`{ prop = default }`).

---

### BUG-05: Transpiler Unconditionally Rewrites `this` to `scope` in Classes and Methods

- **Category:** Correctness
- **Severity:** High
- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L984-L986)

#### Description & Root Cause

In `DriftGenerator.astToJS()`, `ThisExpression` is unconditionally transpiled to `'scope'`:

```ts
case 'ThisExpression':
  return 'scope';
```

When `<script>` blocks declare ES6 classes, constructor functions, or object literal methods (e.g. `class Store { constructor() { this.data = []; } }`), any reference to `this.data` is rewritten to `scope.data`. Consequently, creating class instances mutates component scope rather than the instance object.

#### Impact

Breaks all ES6 classes, constructor functions, and object methods declared in component `<script>` blocks.

#### Remediation

Scope the `this` rewrite to only apply when not inside a class declaration, method definition, or standard function expression context.

---

### BUG-06: Multi-Root `@for` Items Fail Fast-Path Attribute Patching

- **Category:** Correctness
- **Severity:** High
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L730-L736), [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L831-L930)

#### Description & Root Cause

In `DriftClientVM`'s `@for` reconciler, unchanged items execute `vm.patchItemAttributes(bodyMod, childScope, record.nodes[0])`.
`patchItemAttributes` assumes `rootNode` is the single root of the item. In `mapChildren(rootReg, rootNode)`, it uses `rootNode.childNodes` to map register IDs to DOM elements.
When a sub-module template has multiple root sibling nodes (e.g. `<dt>{item.term}</dt><dd :class="item.cls">{item.desc}</dd>`), `record.nodes` contains both `<dt>` and `<dd>`. `patchItemAttributes` treats `<dt>` as the root and searches for `<dd>` *inside* `<dt>`, failing to resolve `<dd>`'s register.

#### Impact

Dynamic attributes on non-first root elements in multi-root list items are never patched during fast-path reconciliation.

#### Remediation

Support multi-root element records in `patchItemAttributes` by passing the full `record.nodes` array and mapping top-level sub-module registers across `record.nodes`.

---

### BUG-07: Child Component Prop Updates Fail to Unset Removed Props

- **Category:** Correctness
- **Severity:** Medium
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L237-L259)

#### Description & Root Cause

In `DriftClientVM.updateChildComponentProps()`:

```ts
for (const key of Object.keys(newPropsObj)) {
  if (key === '__drift_props__') continue;
  const newVal = newPropsObj[key];
  const oldVal = oldProps[key];
  if (newVal !== oldVal) {
    setScopeValue(childScope, key, newVal);
    dirtyPropVars.add(key);
  }
}
```

The update routine only iterates over keys present in `newPropsObj`. If a prop existed in `oldProps` but is omitted in `newPropsObj` (e.g. conditional prop removal), the key is never unset on `childScope` and never marked dirty.

#### Impact

Child components retain stale prop values when parent components remove dynamic props.

#### Remediation

Iterate over keys in `oldProps` that are absent in `newPropsObj`, setting them to `undefined` on `childScope` and adding them to `dirtyPropVars`.

---

### BUG-08: Named Route Parameter Interpolation Stringifies `undefined` as `"/undefined"`

- **Category:** Correctness
- **Severity:** Medium
- **Package:** `driftjs-router`
- **File:** [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L105-L136)

#### Description & Root Cause

In `interpolatePathParams()`:

```ts
if (paramName in params) {
  const val = params[paramName];
  return Array.isArray(val) ? val.join('/') : String(val);
}
```

When `params` is `{ id: undefined }`, `'id' in params` is `true`. `String(undefined)` evaluates to `"undefined"`, resolving a route like `/users/:id` to `/users/undefined`.

#### Impact

Passing undefined parameters produces invalid URLs containing literal `"undefined"` path segments.

#### Remediation

Verify `val !== undefined && val !== null` before stringifying.

---

### BUG-09: `RouterLink` and `Link` Fail to React to Dynamic Prop Changes

- **Category:** Correctness
- **Severity:** Medium
- **Package:** `driftjs-router`
- **File:** [`packages/router/src/components/RouterLink.drift`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/RouterLink.drift#L15-L44), [`packages/router/src/components/Link.drift`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/Link.drift#L15-L44)

#### Description & Root Cause

In `RouterLink.drift` and `Link.drift`, `updateLink()` is invoked on initial setup and subscribed to `router.subscribe()`.
When a parent component dynamically updates `:to="dynamicUrl"` or `:class="dynamicClass"`, `updateChildComponentProps` updates `to` on the component's scope and marks it dirty, but `updateLink()` is not executed because it only subscribes to router history events. As a result, the rendered `<a href={href}>` keeps the stale URL.

#### Impact

Dynamic `to` bindings on `<RouterLink>` components do not update rendered `href` and active classes until a navigation occurs.

#### Remediation

Include reactive bindings or getter functions for `href` and `activeClass` so DOM text and attribute bindings update reactively when `props.to` changes.

---

### BUG-10: Vite Plugin Serializes `NaN` and `Infinity` as `null`

- **Category:** Correctness
- **Severity:** Medium
- **Package:** `driftjs-vite-plugin`
- **File:** [`packages/vite-plugin/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vite-plugin/src/index.ts#L17-L34)

#### Description & Root Cause

In `driftjs-vite-plugin`, `serializeValueToJS()` uses `JSON.stringify(val)` for primitive values. In JavaScript, `JSON.stringify(NaN)`, `JSON.stringify(Infinity)`, and `JSON.stringify(-Infinity)` all return `"null"`.
When a component constant pool contains `NaN` or `Infinity`, the emitted ESM module turns them into `null`.

#### Impact

Numeric constants evaluating to `NaN` or `Infinity` become `null` after Vite compilation.

#### Remediation

Handle non-finite numbers explicitly in `serializeValueToJS`:

```ts
if (typeof val === 'number') {
  if (Number.isNaN(val)) return 'NaN';
  if (val === Infinity) return 'Infinity';
  if (val === -Infinity) return '-Infinity';
  return String(val);
}
```

---

### BUG-11: `sanitizeDependencies` Fails on `workspace:^` Range Protocols

- **Category:** Correctness
- **Severity:** Medium
- **Package:** `create-drift`
- **File:** [`packages/cli/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L73-L82)

#### Description & Root Cause

In `sanitizeDependencies()`:

```ts
if (typeof value === 'string' && value.startsWith('workspace:')) {
  const cleanVersion = value.replace('workspace:', '').trim();
  deps[key] = cleanVersion === '*' ? specifier : cleanVersion;
}
```

If a dependency uses pnpm workspace range specifiers `workspace:^` or `workspace:~`, `cleanVersion` becomes `"^"` or `"~"`. Because `cleanVersion !== '*' `, `deps[key]` is set to `"^"` or `"~"`.

#### Impact

Generates malformed `package.json` files when scaffolding projects, causing `npm install` and `yarn install` to fail.

#### Remediation

Check for `cleanVersion === '*'` or `cleanVersion === '^'` or `cleanVersion === '~'`, resolving them to `specifier`.

---

### BUG-12: Language Server Misses Multi-Variable and Destructuring Declarations

- **Category:** Correctness
- **Severity:** Low
- **Package:** `drift-vscode`
- **File:** [`packages/vscode-plugin/src/server.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/vscode-plugin/src/server.ts#L82-L84)

#### Description & Root Cause

In `server.ts`:

```ts
const declRegex = /(?:let|const|var)\s+([a-zA-Z0-9_$]+)|function\s+([a-zA-Z0-9_$]+)/g;
```

This regex only extracts the first variable name immediately following the `let`/`const`/`var` keyword. Declarations like `let a = 1, b = 2, c = 3;` or `const { x, y } = point;` ignore `b`, `c`, `x`, and `y`.

#### Impact

IDE autocompletion and hover documentation fail to suggest secondary variables in multi-variable declarations.

#### Remediation

Parse the `<script>` block with Acorn or enhance the tokenizer to extract all declarator identifiers.

---

### BUG-13: Prototype Pollution and Key Collision in Route Query Parser

- **Category:** Security
- **Severity:** High
- **Package:** `driftjs-router`
- **File:** [`packages/router/src/matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L25-L61)

#### Description & Root Cause

In `parseQuery()`:

```ts
const query: RouteQuery = {};
...
if (key in query) {
  const existing = query[key];
  if (Array.isArray(existing)) {
    (existing as (string | null)[]).push(val);
  } else if (existing !== undefined) {
    query[key] = [existing as string | null, val];
  }
} else {
  query[key] = val;
}
```

`query` is created as `{}` (inheriting `Object.prototype`). If a URL contains query parameters matching standard prototype methods (e.g. `?toString=1` or `?valueOf=2` or `?constructor=test`), `'toString' in query` evaluates to `true`.
`existing` is `Object.prototype.toString` (a function). Because `existing !== undefined` is `true`, `query['toString']` is overwritten with `[Function: toString, '1']`.

#### Impact

Causes prototype key collisions, unexpected type errors when methods like `query.toString()` are called, and potential prototype pollution risks.

#### Remediation

Initialize `query` with `Object.create(null)` or use `Object.prototype.hasOwnProperty.call(query, key)` and reject dangerous keys (`__proto__`, `constructor`, `prototype`).

---

### BUG-14: SSR Comment Sanitization Bypass via HTML5 Bang Delimiter (`--!>`)

- **Category:** Security
- **Severity:** High
- **Package:** `driftjs-ssr`
- **File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L340-L342)

#### Description & Root Cause

In `serializeNode()`:

```ts
if (node.type === 'comment') {
  const safeContent = String(node.content ?? '').replace(/-->/g, '-- >');
  return `<!--${safeContent}-->`;
}
```

According to the HTML5 specification (Section 13.1.2.4 "Comment end bang state"), the delimiter `--!>` terminates an HTML comment in all modern web browsers.
The sanitization logic only replaces `-->`. If dynamic comment content contains `--!><script>alert(1)</script>`, the comment closes prematurely and the injected script tag executes in the browser.

#### Impact

Stored/Reflected Cross-Site Scripting (XSS) in server-side rendered pages containing dynamic comments.

#### Remediation

Sanitize both `-->` and `--!>`:

```ts
const safeContent = String(node.content ?? '')
  .replace(/-->/g, '-- >')
  .replace(/--!>/g, '--! >');
```

---

### BUG-15: Inconsistent ARIA and Data Boolean Attribute Stripping

- **Category:** Security / Accessibility
- **Severity:** Medium
- **Package:** `driftjs-ssr` / `driftjs-dom`
- **File:** [`packages/ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L358-L365), [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L498-L502)

#### Description & Root Cause

When evaluating boolean attribute expressions (e.g. `aria-hidden={false}` or `aria-expanded={false}` or `data-active={false}`), both SSR serializer and client VM treat boolean `false` as an instruction to remove the attribute entirely.
In ARIA specifications, `aria-hidden="false"` is fundamentally different from omitting `aria-hidden` (which defaults to element visibility rules).

#### Impact

Breaks accessibility trees and security visibility states where explicit `"false"` string attributes are required.

#### Remediation

Only remove boolean attributes for standard HTML boolean attributes (`disabled`, `checked`, `selected`, `readonly`, etc.). For `aria-*` and `data-*` attributes, serialize boolean `false` as `attr="false"`.

---

### BUG-16: Event Handler Scope Snapshotting Triggers Redundant Reactive Updates

- **Category:** Efficiency
- **Severity:** High
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L466-L478)

#### Description & Root Cause

In `DriftClientVM`'s delegated event handler wrapper:

```ts
const scopeSnapshot: Record<string, any> = { ...targetVM.scope };
const result = currentFn.apply(this, args);
const changedVars = new Set<string>();
for (const key of targetVM.declaredVars) {
  if (targetVM.scope[key] !== scopeSnapshot[key]) changedVars.add(key);
}
```

`targetVM.scope` is prototypically linked to parent scopes (`Object.create(parentScope)`).
The shallow spread `{ ...targetVM.scope }` only copies *own* properties. For any variable inherited from a parent prototype, `scopeSnapshot[key]` is `undefined`.
During the loop, `targetVM.scope[key] !== undefined` evaluates to `true` on **every single event execution**, even when the variable was never modified.

#### Impact

Every user interaction (click, input, keypress) triggers full re-renders of all reactive regions depending on inherited variables, causing severe UI jank and wasted microtask cycles.

#### Remediation

Snapshot all `declaredVars` via prototype-aware lookup:

```ts
const scopeSnapshot = new Map<string, any>();
for (const key of targetVM.declaredVars) {
  scopeSnapshot.set(key, targetVM.scope[key]);
}
// After handler execution:
for (const key of targetVM.declaredVars) {
  if (targetVM.scope[key] !== scopeSnapshot.get(key)) changedVars.add(key);
}
```

---

### BUG-17: `mount()` Does Not Return Unmount Handle, Causing Event Listener Leaks

- **Category:** Efficiency / Memory
- **Severity:** Medium
- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L1154-L1160)

#### Description & Root Cause

`mount(component, container)` instantiates a `DriftClientVM`, increments `DriftClientVM.activeVMCount`, attaches delegated listeners to `document`, and returns `void`.
Unlike `hydrate()` (which returns the `DriftClientVM` instance), `mount()` provides no handle to invoke `vm.unmount()`.

#### Impact

Single Page Applications mounting and destroying Drift components dynamically cannot unmount the client VM, leaving `activeVMCount` permanently incremented and preventing global document event listeners from ever being cleaned up.

#### Remediation

Update `mount()` signature to return `DriftClientVM` or `{ unmount: () => void }`.
