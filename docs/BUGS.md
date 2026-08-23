# DriftJS Codebase Bug Audit Report

This document records the defects, security concerns, correctness bugs, and efficiency issues identified during a thorough, comprehensive audit of the entire DriftJS codebase across all packages: `driftjs-compiler`, `driftjs-dom`, `driftjs-ssr`, `driftjs-shared`, `driftjs-router`, `driftjs-vite-plugin`, `create-drift` CLI, and `drift-vscode`.

Each finding is evaluated according to the three core criteria:

1. **#1 Correctness** — Logic errors, spec deviations, parser/transpiler edge cases, state desynchronization, and runtime mismatches.
2. **#2 Security** — Prototype pollution risks, injection vectors, unescaped output, and path traversal vulnerabilities.
3. **#3 Efficiency** — Unnecessary DOM walks, memory leaks, event listener retention, and unbounded microtask queue cycles.

All bug IDs are listed in serial order (`BUG-001` through `BUG-015`).

---

## Summary Matrix

| Bug ID                                                                                                                                              | Title                                                                                                                 | Package              | Criteria              | Severity         |
| :-------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------- | :-------------------- | :--------------- |
| [`BUG-001`](#bug-001-getscopevalue-uses-hasownproperty-on-globalthis-breaking-access-to-inherited-browser-globals)                                 | `getScopeValue` (`_get`) uses `hasOwnProperty` on `globalThis`, breaking access to inherited browser globals  | `driftjs-shared`   | Correctness, Security | **High**   |
| [`BUG-002`](#bug-002-for-directive-comma-splitting-corrupts-destructuring-syntax-when-index-is-specified)                                          | `@for` directive comma splitting corrupts destructuring syntax when index is specified                              | `driftjs-compiler` | Correctness           | **High**   |
| [`BUG-003`](#bug-003-destructuring-assignment-expressions-to-local-variables-silently-drop-assignments-in-asttojs)                                 | Destructuring assignment expressions to local variables silently drop assignments in`astToJS`                       | `driftjs-compiler` | Correctness           | **High**   |
| [`BUG-004`](#bug-004-patchitemattributes-maps-bytecode-registers-to-incorrect-dom-child-nodes-in-elements-containing-comments-or-reactive-anchors) | `patchItemAttributes` maps bytecode registers to incorrect DOM child nodes in elements containing comments/anchors  | `driftjs-dom`      | Correctness           | **High**   |
| [`BUG-005`](#bug-005-hydrationcursorclaimcomment-greedily-claims-any-comment-node-without-verifying-expected-marker-content)                       | `HydrationCursor.claimComment` greedily claims any comment node without verifying expected marker content           | `driftjs-dom`      | Correctness           | **Medium** |
| [`BUG-006`](#bug-006-directive-header-scanner-readdirectiveheader-lacks-template-literal--interpolation-and-brace-tracking)                        | Directive header scanner (`readDirectiveHeader`) lacks template literal `${...}` interpolation and brace tracking | `driftjs-compiler` | Correctness           | **Medium** |
| [`BUG-007`](#bug-007-ssr-html-serializer-serializes-empty-string-attribute-values-as-boolean-presence)                                             | SSR HTML serializer serializes empty string attribute values as boolean presence (`k` instead of `k=""`)          | `driftjs-ssr`      | Correctness           | **Medium** |
| [`BUG-008`](#bug-008-router-custom-path-parameter-regex-with-inner-capturing-groups-displaces-subsequent-parameter-match-indices)                  | Router custom path parameter regex with inner capturing groups displaces subsequent parameter match indices           | `driftjs-router`   | Correctness           | **High**   |
| [`BUG-009`](#bug-009-global-delegated-event-listeners-and-document-references-retained-due-to-unbalanced-activevmcount)                            | Global delegated event listeners and`Document` references retained due to unbalanced `activeVMCount`              | `driftjs-dom`      | Efficiency            | **Medium** |
| [`BUG-010`](#bug-010-scope-snapshot-equality-check-in-delegated-event-listeners-fails-for-in-place-objectarray-mutations)                          | Scope snapshot equality check in delegated event listeners fails for in-place object/array mutations                  | `driftjs-dom`      | Correctness           | **Medium** |
| [`BUG-011`](#bug-011-potential-symlink-traversal-and-unrestricted-file-deletion-in-cli-emptydirectory)                                             | Potential symlink traversal and unrestricted file deletion in CLI`emptyDirectory`                                   | `create-drift`     | Security              | **Medium** |
| [`BUG-012`](#bug-012-unchecked-recursive-traversal-in-unmountsubtree-incurs-overhead-on-large-leaf-element-trees)                                  | Unchecked recursive traversal in`unmountSubtree` incurs overhead on large leaf element trees                        | `driftjs-dom`      | Efficiency            | **Low**    |
| [`BUG-013`](#bug-013-missing-recursion-depth-guard-in-microtask-update-flush-flushupdates-under-cyclical-scope-dependencies)                       | Missing recursion depth guard in microtask update flush (`flushUpdates`) under cyclical scope dependencies          | `driftjs-dom`      | Efficiency            | **Medium** |
| [`BUG-014`](#bug-014-router-parsequery-and-stringifyquery-mismatch-on-null-vs-empty-string-values-roundtrip)                                       | Router`parseQuery` and `stringifyQuery` mismatch on `null` vs empty string values roundtrip                     | `driftjs-router`   | Correctness           | **Low**    |
| [`BUG-015`](#bug-015-initial-router-navigation-error-silently-resolves-isready-promise-instead-of-rejecting)                                       | Initial router navigation error silently resolves`isReady()` promise instead of rejecting                           | `driftjs-router`   | Correctness           | **Low**    |

---

## Detailed Findings

### BUG-001: `getScopeValue` Uses `hasOwnProperty` on `globalThis`, Breaking Access to Inherited Browser Globals

- **Package:** `driftjs-shared`
- **File:** [`packages/utils/src/scope.ts:L75-L83`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L75-L83)
- **Criteria:** #1 Correctness, #2 Security
- **Severity:** High

#### Description

In [`scope.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/utils/src/scope.ts#L75-L83), `getScopeValue(scope, name)` is the runtime helper (bound as `_get` in precompiled functions emitted by `astToJS`) used to resolve identifier lookups from component scope falling back to global scope:

```ts
export function getScopeValue(scope: any, name: string): any {
  if (scope && inScopeChain(scope, name)) {
    return scope[name];
  }
  if (typeof globalThis !== 'undefined' && globalThis && Object.prototype.hasOwnProperty.call(globalThis, name)) {
    return (globalThis as any)[name];
  }
  return undefined;
}
```

In standard web browsers (Chrome, Firefox, Safari), standard Web APIs and globals (such as `fetch`, `setTimeout`, `clearTimeout`, `document`, `window`, `navigator`, `location`, `history`, `alert`, `addEventListener`, `requestAnimationFrame`) reside on prototype chain interfaces (`Window.prototype`, `WindowProperties`, `EventTarget.prototype`) rather than as own properties of `window` / `globalThis`.

Because `Object.prototype.hasOwnProperty.call(globalThis, name)` returns `false` for prototype-inherited properties, any template expression or `<script>` handler invoking standard Web APIs (e.g. `{ fetch('/api') }` or `<button onclick={() => setTimeout(fn, 100)}>`) returns `undefined`, resulting in runtime `TypeError: ... is not a function`.

#### Trigger Scenario

```html
<script>
  function loadData() {
    fetch('/api/data').then(res => res.json()); // Throws TypeError: fetch is not a function
  }
</script>
<button onclick={loadData}>Load</button>
```

#### Proposed Fix

Update `getScopeValue` to check `name in globalThis` (or `Reflect.has(globalThis, name)`) while guarding against `Object.prototype` properties:

```ts
export function getScopeValue(scope: any, name: string): any {
  if (scope && inScopeChain(scope, name)) {
    return scope[name];
  }
  if (typeof globalThis !== 'undefined' && globalThis && (name in globalThis)) {
    return (globalThis as any)[name];
  }
  return undefined;
}
```

---

### BUG-002: `@for` Directive Comma Splitting Corrupts Destructuring Syntax When Index Is Specified

- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/parser.ts:L527-L532`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L527-L532)
- **Criteria:** #1 Correctness
- **Severity:** High

#### Description

In [`parser.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L527-L532), `parseForDirective` splits the left-hand side of a `@for` directive header using a naive `.split(',')`:

```ts
if (lhs.startsWith('(') && lhs.endsWith(')')) {
  const parts = lhs.slice(1, -1).split(',').map(s => s.trim());
  item = parts[0] || '';
  index = parts[1] || null;
}
```

When a developer writes a `@for` loop with object or array destructuring and an index parameter, e.g.:

```html
@for (({ id, name }, idx) in items) {
  <div>{name}</div>
}
```

The LHS string is `({ id, name }, idx)`.
`lhs.slice(1, -1).split(',')` produces `["{ id", "name }", "idx"]`.
Consequently, `item` is set to `"{ id"` and `index` is set to `"name }"`. The resulting generated JavaScript code contains invalid syntax and causes runtime compilation failure.

#### Trigger Scenario

```html
@for (({ id, name }, idx) in userList) {
  <span>{name} ({idx})</span>
}
```

#### Proposed Fix

Parse the LHS header tracking brace and bracket depth so commas inside `{ ... }` or `[ ... ]` are not treated as top-level parameter separators.

---

### BUG-003: Destructuring Assignment Expressions to Local Variables Silently Drop Assignments in `astToJS`

- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/generator.ts:L802-L846`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L802-L846)
- **Criteria:** #1 Correctness
- **Severity:** High

#### Description

In [`generator.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L802-L846), the `astToJS` code emitter handles `AssignmentExpression` with `ArrayPattern` and `ObjectPattern`.
Inside each loop extracting identifiers:

```ts
if (el?.type === 'Identifier') {
  const varName = el.name;
  if (!locals || !locals.has(varName)) {
    setCalls.push(`if (typeof setScopeValue === 'function' && scope) setScopeValue(scope, ${JSON.stringify(varName)}, _val[${i}]); else (scope || {})[${JSON.stringify(varName)}] = _val[${i}];`);
  }
}
```

If `varName` is present in `locals` (i.e. declared as a local variable inside a function or loop), `!locals || !locals.has(varName)` evaluates to `false`. No code is added to `setCalls` and no local variable assignment `${varName} = _val[${i}]` is emitted.
As a result, destructuring assignments to local variables (such as `[a, b] = getCoords();` inside an event handler or helper function) silently become no-ops.

#### Trigger Scenario

```html
<script>
  function calculate() {
    let x = 0, y = 0;
    [x, y] = [10, 20]; // x and y remain 0 because assignment code is completely dropped
    return x + y;
  }
</script>
```

#### Proposed Fix

In `astToJS` for `ArrayPattern` and `ObjectPattern` assignment expressions, emit direct assignments `${varName} = _val[...]` when `locals.has(varName)` is true.

---

### BUG-004: `patchItemAttributes` Maps Bytecode Registers to Incorrect DOM Child Nodes in Elements Containing Comments or Reactive Anchors

- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts:L853-L867`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L853-L867)
- **Criteria:** #1 Correctness
- **Severity:** High

#### Description

In [`dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L853-L867), `patchItemAttributes` performs fast-path in-place attribute patching for list items in `@for` loops.
To locate the target DOM element for each register, it traverses:

```ts
const mapChildren = (parentReg: number, parentNode: Node) => {
  const childRegs = childrenOf.get(parentReg);
  if (!childRegs) return;
  const childNodes = parentNode.childNodes;
  for (let i = 0; i < childRegs.length && i < childNodes.length; i++) {
    const cReg = childRegs[i]!;
    const cNode = childNodes[i]!;
    regs.set(cReg, cNode);
    mapChildren(cReg, cNode);
  }
};
```

`childrenOf` only tracks registers populated via `APPEND_CHILD` instructions. However, `parentNode.childNodes` in the real DOM includes comment nodes (`<!--if-->`, `<!--/if-->`, `<!--for-->`, `<!--/for-->`), whitespace text nodes, and custom comments.
When an element contains comment boundaries or nested conditional regions, `childNodes[i]` deviates from `childRegs[i]`. `regs.set(cReg, cNode)` binds register IDs to the wrong sibling DOM nodes. When dynamic attributes (`class`, `style`, `disabled`, `value`) are patched, they are applied to the wrong DOM elements.

#### Trigger Scenario

```html
@for (item in items) {
  <div class="row">
    <!-- user note or @if anchor -->
    @if (item.active) { <span>Active</span> }
    <button class={item.btnClass}>Click</button> <!-- Patches wrong element -->
  </div>
}
```

#### Proposed Fix

Filter or correlate DOM child nodes by element node identity and creation order, or maintain explicit register-to-node maps on the sub-module execution record.

---

### BUG-005: `HydrationCursor.claimComment` Greedily Claims Any Comment Node Without Verifying Expected Marker Content

- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/hydration.ts:L43-L53`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/hydration.ts#L43-L53)
- **Criteria:** #1 Correctness
- **Severity:** Medium

#### Description

In [`hydration.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/hydration.ts#L43-L53), `claimComment` receives `expectedContent` (e.g. `'if'`, `'/if'`, `'for'`, `'/for'`) but does not check whether the current comment node matches `expectedContent`:

```ts
public claimComment(expectedContent: string, doc: Document): Comment {
  while (this.current && this.current.nodeType !== 8) {
    this.current = this.walker.nextNode();
  }
  if (this.current && this.current.nodeType === 8) {
    const node = this.current as Comment;
    this.current = this.walker.nextNode();
    return node;
  }
  return doc.createComment(expectedContent);
}
```

If an SSR document contains developer comments (e.g. `<!-- header -->`) or adjacent anchors, `claimComment` claims the first comment node encountered. When `clearBetweenAnchors` or `REACTIVE_IF` re-renders, it wipes content between unrelated comment boundaries.

#### Trigger Scenario

SSR HTML containing:

```html
<div id="app">
  <!-- Section Title -->
  <!--if--><span>Hello</span><!--/if-->
</div>
```

Hydration claims `<!-- Section Title -->` as the `if` anchor.

#### Proposed Fix

Verify `(this.current as Comment).data.trim() === expectedContent.trim()` before claiming the comment; advance the walker or fallback to creating the comment if the content does not match.

---

### BUG-006: Directive Header Scanner (`readDirectiveHeader`) Lacks Template Literal `${...}` Interpolation and Brace Tracking

- **Package:** `driftjs-compiler`
- **File:** [`packages/compiler/src/lexer.ts:L266-L371`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L266-L371)
- **Criteria:** #1 Correctness
- **Severity:** Medium

#### Description

In [`lexer.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L266-L371), `readDirectiveHeader` handles quotes `""`, `''`, and  `` by setting `inQuote = ch`.
Unlike `readInterpolationToken` (which maintains a `templateStack` and increments `braceDepth` inside `${...}`), `readDirectiveHeader` treats backtick strings as opaque literals without tracking `${...}`.
If an expression inside a template literal contains braces (e.g. `@if (msg === `val: ${format({ x: 1 })}`) {`), or if it contains parentheses, `readDirectiveHeader` either fails to match the closing brace of the header or misinterprets inner braces as the block start.

#### Trigger Scenario

```html
@if (status === `code: ${getStatus({ raw: true })}`) {
  <div>Status OK</div>
}
```

#### Proposed Fix

Implement template literal stack tracking in `readDirectiveHeader` identical to `readInterpolationToken`.

---

### BUG-007: SSR HTML Serializer Serializes Empty String Attribute Values as Boolean Presence

- **Package:** `driftjs-ssr`
- **File:** [`packages/ssr/src/index.ts:L360-L365`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L360-L365)
- **Criteria:** #1 Correctness
- **Severity:** Medium

#### Description

In [`ssr/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/ssr/src/index.ts#L360-L365), `serializeNode` serializes element attributes:

```ts
if (v === '' || v === true) {
  attrsStr += ` ${k}`;
} else if (v !== null && v !== undefined && v !== false) {
  attrsStr += ` ${k}="${escapeHtml(String(v))}"`;
}
```

When an attribute value is an empty string `""` (e.g. `<img alt="" />`, `<input value="" />`, `<button aria-label="" />`), treating `v === ''` the same as `v === true` outputs `<img alt />` or `<input value />`.
In HTML and WCAG accessibility standards, `<img alt>` indicates missing alternative text, whereas `<img alt="" />` indicates a decorative image.

#### Trigger Scenario

```html
<img src="/logo.png" alt="" />
```

Renders on SSR as `<img src="/logo.png" alt />`.

#### Proposed Fix

Differentiate `v === true` (boolean attribute -> ` ${k}`) from `v === ''` (empty string -> ` ${k}=""`):

```ts
if (v === true) {
  attrsStr += ` ${k}`;
} else if (v !== null && v !== undefined && v !== false) {
  attrsStr += ` ${k}="${escapeHtml(String(v))}"`;
}
```

---

### BUG-008: Router Custom Path Parameter Regex With Inner Capturing Groups Displaces Subsequent Parameter Match Indices

- **Package:** `driftjs-router`
- **File:** [`packages/router/src/matcher.ts:L171-L183, L329-L334`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L171-L183)
- **Criteria:** #1 Correctness
- **Severity:** High

#### Description

In [`matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L171-L183), custom parameter regexes are compiled into route RegExp patterns:

```ts
const regexMatch = paramName.match(/^([a-zA-Z0-9_]+)\((.*)\)[?*+]?$/);
if (regexMatch && regexMatch[1] && regexMatch[2]) {
  paramName = regexMatch[1];
  paramNames.push(paramName);
  regexParts.push(`/(${regexMatch[2]})`);
}
```

If `regexMatch[2]` contains capturing parentheses `(...)`, e.g. `:date(\\d{4}-(\\d{2})-(\\d{2}))` or `:id(([a-z]+)-(\\d+))`, each inner group introduces extra capturing groups into the resulting `RegExp`.
In `matchPath`:

```ts
for (let i = 0; i < record.paramNames.length; i++) {
  const key = record.paramNames[i]!;
  const rawVal = match[i + 1];
  params[key] = rawVal !== undefined ? safeDecode(rawVal) : '';
}
```

The naive `match[i + 1]` index assumes exactly 1 capture group per parameter. Any inner group shifts all subsequent indices, causing subsequent parameters to receive corrupted sub-string captures or `undefined`.

#### Trigger Scenario

Route pattern: `/posts/:date(\\d{4}-(\\d{2})-(\\d{2}))/:slug`
URL: `/posts/2026-08-23/driftjs-launch`
`params.slug` will receive `"08"` instead of `"driftjs-launch"`.

#### Proposed Fix

Convert capturing groups in custom regexes to non-capturing groups `(?:...)` or use named RegExp groups.

---

### BUG-009: Global Delegated Event Listeners and `Document` References Retained Due to Unbalanced `activeVMCount`

- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts:L90-L92, L146-L170, L232-L265`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L90-L92)
- **Criteria:** #3 Efficiency, Memory Leak
- **Severity:** Medium

#### Description

In [`dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L90-L92), `DriftClientVM.activeVMCount` is incremented in every `new DriftClientVM()` constructor call.
However, `DriftClientVM` instances created internally for child components or sub-modules might not undergo explicit `unmount()` if discarded during re-renders.
Because global event listener cleanup in `unmount()` requires `DriftClientVM.activeVMCount === 0`:

```ts
if (DriftClientVM.activeVMCount === 0 && DriftClientVM.globalDelegatedListeners.size > 0) {
  for (const [docRoot, listenersMap] of DriftClientVM.globalDelegatedListeners.entries()) { ... }
}
```

`activeVMCount` rarely reaches 0 in long-running SPAs or test environments, causing event listeners on `document` and references in `globalDelegatedListeners` to leak across page transitions and test runs.

#### Proposed Fix

Track root VM lifecycles explicitly or use reference-counted VM trees.

---

### BUG-010: Scope Snapshot Equality Check in Delegated Event Listeners Fails for In-Place Object/Array Mutations

- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts:L437-L445`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L437-L445)
- **Criteria:** #1 Correctness
- **Severity:** Medium

#### Description

In [`dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L437-L445), the delegated event wrapper attempts to detect state changes by shallow-comparing `targetVM.scope`:

```ts
const scopeSnapshot: Record<string, any> = { ...targetVM.scope };
const result = currentFn.apply(this, args);
const changedVars = new Set<string>();
for (const key of targetVM.declaredVars) {
  if (targetVM.scope[key] !== scopeSnapshot[key]) changedVars.add(key);
}
```

When an event handler mutates an object property or array in-place without reassigning the variable reference (e.g. `this.user.name = 'Alex'` or via helper methods that mutate state without top-level variable reassignment), `targetVM.scope[key] === scopeSnapshot[key]` remains true. `changedVars` is empty and synchronous updates are bypassed.

#### Proposed Fix

Rely on `targetVM.pendingDirtyVars` populated by `__drift_mark_dirty__` / `setScopeValue` and always flush pending dirty vars.

---

### BUG-011: Potential Symlink Traversal and Unrestricted File Deletion in CLI `emptyDirectory`

- **Package:** `create-drift`
- **File:** [`packages/cli/src/index.ts:L116-L122`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L116-L122)
- **Criteria:** #2 Security
- **Severity:** Medium

#### Description

In [`cli/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/cli/src/index.ts#L116-L122), `emptyDirectory` clears existing directory contents when overwrite mode `'empty'` is chosen:

```ts
export function emptyDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  for (const file of fs.readdirSync(dirPath)) {
    if (file === '.git') continue;
    fs.rmSync(path.join(dirPath, file), { recursive: true, force: true });
  }
}
```

If `dirPath` contains a directory symlink or junction point, `fs.rmSync` with `{ recursive: true }` in certain Node environments can traverse symlinks and remove target files outside the designated project boundary.

#### Proposed Fix

Use `fs.lstatSync` to detect symlinks and unlink them with `fs.unlinkSync` rather than recursively deleting through symlinked directories.

---

### BUG-012: Unchecked Recursive Traversal in `unmountSubtree` Incurs Overhead on Large Leaf Element Trees

- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts:L94-L113`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L94-L113)
- **Criteria:** #3 Efficiency
- **Severity:** Low

#### Description

In [`dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L94-L113), `unmountSubtree` recursively visits every DOM node in a removed subtree to look up `this.childVMs.get(node)`:

```ts
public unmountSubtree(node: Node | null): void {
  if (!node) return;
  const entry = this.childVMs.get(node);
  if (entry) { ... }
  const children = (node as any).childNodes;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      this.unmountSubtree(children[i]);
    }
  }
}
```

When unmounting or reconciling large lists of static elements (e.g. 10,000 table rows with no child components), `mountedChildVMs.size === 0`, but the VM still performs full recursive tree walks and WeakMap queries.

#### Proposed Fix

Add a fast check `if (this.mountedChildVMs.size === 0) return;` to exit early when no child component VMs are mounted.

---

### BUG-013: Missing Recursion Depth Guard in Microtask Update Flush (`flushUpdates`) Under Cyclical Scope Dependencies

- **Package:** `driftjs-dom`
- **File:** [`packages/dom/src/index.ts:L191-L206`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L191-L206)
- **Criteria:** #3 Efficiency
- **Severity:** Medium

#### Description

In [`dom/src/index.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/dom/src/index.ts#L191-L206), `markDirty` queues a microtask to invoke `flushUpdates()`.
If a computed property or reactive region re-render mutates another variable that re-triggers dirty marking during update flushing, `flushUpdates` will continuously reschedule microtasks in an unbounded loop, starving the browser event loop.

#### Proposed Fix

Add a maximum flush iteration threshold (e.g. 100 iterations) with a warning/error when a cyclical reactive dependency is detected.

---

### BUG-014: Router `parseQuery` and `stringifyQuery` Mismatch on `null` vs Empty String Values Roundtrip

- **Package:** `driftjs-router`
- **File:** [`packages/router/src/matcher.ts:L47-L56, L75-L85`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L47-L56)
- **Criteria:** #1 Correctness
- **Severity:** Low

#### Description

In [`matcher.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/matcher.ts#L47-L56), `parseQuery` converts `?flag` to `{ flag: null }` and `?flag=` to `{ flag: '' }`.
When `stringifyQuery` encodes `{ flag: [null, 'active'] }`, it emits `?flag&flag=active`. When parsed back, `parseQuery` reads `?flag&flag=active` as `['', 'active']` instead of `[null, 'active']`, losing the `null` vs `''` distinction.

#### Proposed Fix

Normalize null and empty query values consistently across parser and serializer.

---

### BUG-015: Initial Router Navigation Error Silently Resolves `isReady()` Promise Instead of Rejecting

- **Package:** `driftjs-router`
- **File:** [`packages/router/src/router.ts:L345-L353`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L345-L353)
- **Criteria:** #1 Correctness
- **Severity:** Low

#### Description

In [`router.ts`](file:///home/hrutav-modha/Documents/driftjs/packages/router/src/router.ts#L345-L353), `createRouter` executes initial navigation:

```ts
pushWithGuards(initialLoc, true, true)
  .then(() => {
    if (readyResolve) readyResolve();
  })
  .catch((err) => {
    if (readyReject) readyReject(err);
    triggerError(err);
  });
```

When initial navigation fails or is aborted by a guard, `pushWithGuards` returns a `NavigationFailure` object (which resolves the Promise rather than rejecting). As a result, `.then()` executes and `readyResolve()` is called despite the failed initial navigation.

#### Proposed Fix

Check whether `pushWithGuards` returned a `NavigationFailure` in `.then()` and call `readyReject(failure)` if aborted.
