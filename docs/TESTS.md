# DriftJS Test Suite Specification & Matrix

This document provides a formal test specification matrix covering all 48 unit and integration test cases across the DriftJS monorepo (`@driftjs/compiler`, `@driftjs/vm`, and `vite-plugin-drift`).

---

## 📊 Summary Metrics

| Package                            | Test Module File                              |  Test Cases  |        Status        |
| :--------------------------------- | :-------------------------------------------- | :----------: | :-------------------: |
| **`@driftjs/compiler`**    | `packages/compiler/tests/lexer.test.ts`     |      7      |       ✅ PASSED       |
| **`@driftjs/compiler`**    | `packages/compiler/tests/parser.test.ts`    |      10      |       ✅ PASSED       |
| **`@driftjs/compiler`**    | `packages/compiler/tests/analyzer.test.ts`  |      5      |       ✅ PASSED       |
| **`@driftjs/compiler`**    | `packages/compiler/tests/generator.test.ts` |      3      |       ✅ PASSED       |
| **`@driftjs/vm` (Client)** | `packages/vm/tests/vm.test.ts`              |      13      |       ✅ PASSED       |
| **`@driftjs/vm` (Server)** | `packages/vm/tests/server.test.ts`          |      7      |       ✅ PASSED       |
| **`@driftjs/vite-plugin`** | `packages/vite-plugin/tests/plugin.test.ts` |      3      |       ✅ PASSED       |
| **Total Workspace**          | **7 Test Suites**                       | **48** | **100% PASSED** |

---

## 🧪 Detailed Test Design Matrix

### 1. Lexer Module (`@driftjs/compiler/lexer`)

| Test ID        | Category   | Objective / Description                       | Inputs / Test Conditions                    | Expected Output / Behavior                                                                                                                                      |  Status  |
| :------------- | :--------- | :-------------------------------------------- | :------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: |
| `TC-LEX-001` | Happy Path | Tokenize basic HTML elements                  | `<div>Hello</div>`                        | Emits`TagOpen("div")`, `TagOpenEnd`, `Text("Hello")`, `TagClose("div")`, `EOF`                                                                        | ✅ PASSED |
| `TC-LEX-002` | Happy Path | Tokenize self-closing elements and attributes | `<img src="avatar.png" alt="Avatar" />`   | Emits`TagOpen("img")`, `AttributeName("src")`, `AttributeValue("avatar.png")`, `AttributeName("alt")`, `AttributeValue("Avatar")`, `SelfClosingEnd` | ✅ PASSED |
| `TC-LEX-003` | Happy Path | Tokenize interpolations with nested braces    | `<p>{items.map(x => ({ id: x.id }))}</p>` | Emits`Interpolation("items.map(x => ({ id: x.id }))")` token preserving nested JS braces                                                                      | ✅ PASSED |
| `TC-LEX-004` | Happy Path | Tokenize raw script blocks                    | `<script>let count = 0;</script>`         | Emits`TagOpen("script")`, `TagOpenEnd`, `Script("let count = 0;")`, `TagClose("script")`, `EOF`                                                       | ✅ PASSED |
| `TC-LEX-005` | Edge Case  | Handle empty template input                   | `""`                                      | Emits single`EOF` token at cursor 0                                                                                                                           | ✅ PASSED |
| `TC-LEX-006` | Error Case | Detect unclosed script tag                    | `<script>let x = 1;`                      | Throws`Error('Unclosed script tag')`                                                                                                                          | ✅ PASSED |
| `TC-LEX-007` | Error Case | Detect unclosed interpolation expression      | `<p>{count</p>`                           | Throws`Error('Unclosed interpolation expression starting at index 3')`                                                                                        | ✅ PASSED |

---

### 2. Parser Module (`@driftjs/compiler/parser`)

| Test ID        | Category   | Objective / Description                              | Inputs / Test Conditions                         | Expected Output / Behavior                                                                         |  Status  |
| :------------- | :--------- | :--------------------------------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------------- | :-------: |
| `TC-PAR-001` | Happy Path | Parse basic element node                             | `<div>Hello</div>`                             | Returns`ElementNode(div)` with child `TextNode("Hello")`                                       | ✅ PASSED |
| `TC-PAR-002` | Happy Path | Parse element attributes and values                  | `<input type="text" value="Drift" />`          | Returns`ElementNode(input)` with `attributes: { type: "text", value: "Drift" }`                | ✅ PASSED |
| `TC-PAR-003` | Happy Path | Separate`on*` event handlers into `events` map   | `<button onclick={handleClick}>Click</button>` | Returns`ElementNode(button)` with `events: { click: "handleClick" }`                           | ✅ PASSED |
| `TC-PAR-004` | Happy Path | Parse void elements without expecting closing tags   | `<br><img src="a.png"><input type="text">`     | Returns array of void`ElementNode` objects without syntax error                                  | ✅ PASSED |
| `TC-PAR-005` | Happy Path | Parse top-level`<script>` block node               | `<script>let count = 0;</script>`              | Returns`ScriptNode` with `content: "let count = 0;"`                                           | ✅ PASSED |
| `TC-PAR-006` | Happy Path | Parse reactive interpolation expressions             | `<p>Count: {count}</p>`                        | Returns`ElementNode(p)` with children `TextNode("Count: ")` and `InterpolationNode("count")` | ✅ PASSED |
| `TC-PAR-007` | Edge Case  | Strip formatting whitespace text nodes               | `<div>\n  <p>Hello</p>\n</div>`                | Strips whitespace-only text nodes, producing clean element tree                                    | ✅ PASSED |
| `TC-PAR-008` | Error Case | Detect missing tag name in opening tag               | `<>`                                           | Throws`Error('Expected tag name after <')`                                                       | ✅ PASSED |
| `TC-PAR-009` | Error Case | Detect tag mismatch between opening and closing tags | `<div></span>`                                 | Throws`Error('Closing tag </span> does not match opening tag <div>')`                            | ✅ PASSED |
| `TC-PAR-010` | Error Case | Detect unclosed interpolation expression             | `<p>{count</p>`                                | Throws`Error('Unclosed interpolation')`                                                          | ✅ PASSED |

---

### 3. Analyzer Module (`@driftjs/compiler/analyzer`)

| Test ID        | Category   | Objective / Description                                       | Inputs / Test Conditions                                              | Expected Output / Behavior                                                                |  Status  |
| :------------- | :--------- | :------------------------------------------------------------ | :-------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :-------: |
| `TC-ANA-001` | Happy Path | Discover state variables and assign register indices          | `<script>let count = 0; const name = "Drift";</script>`             | `varToReg` maps `count -> 1`, `name -> 2`, `nextRegIdx = 3`                       | ✅ PASSED |
| `TC-ANA-002` | Happy Path | Rewrite state variable mutations with`markDirty` calls      | `<script>let count = 0; function increment() { count++; }</script>` | Script thunk code transforms`count++` into `(vm?.markDirty(1), regs[1]++)`            | ✅ PASSED |
| `TC-ANA-003` | Happy Path | Calculate bitmask dependency masks for expressions            | `let a = 1; let b = 2;` -> `{a + b}`                              | Rewrites to`regs[1] + regs[2]`, `depMask = (1<<1) \| (1<<2)` (bitmask 6)               | ✅ PASSED |
| `TC-ANA-004` | Edge Case  | Ignore local function parameters during dependency resolution | `items.map(item => item * 2)`                                       | `item` treated as scoped local parameter; only `items` registered as state dependency | ✅ PASSED |
| `TC-ANA-005` | Error Case | Detect undeclared state variable references                   | `{unknownVar + 1}`                                                  | Throws`Error('Variable "unknownVar" is not defined in state')`                          | ✅ PASSED |

---

### 4. Generator Module (`@driftjs/compiler/generator`)

| Test ID        | Category    | Objective / Description                                           | Inputs / Test Conditions                                                         | Expected Output / Behavior                                                                            |  Status  |
| :------------- | :---------- | :---------------------------------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- | :-------: |
| `TC-GEN-001` | Happy Path  | Generate 32-bit bytecode program via class constructor            | `new DriftJSGenerator(ast).generate()`                                         | Returns`CompiledProgram` containing `Uint32Array` bytecode and constants pool                     | ✅ PASSED |
| `TC-GEN-002` | Happy Path  | Generate bytecode program via`generate()` function              | `generate(ast)`                                                                | Produces valid compiled program structure                                                             | ✅ PASSED |
| `TC-GEN-003` | Integration | Generate script thunks, dynamic update blocks, and event handlers | `<script>let count = 0;</script><button onclick={inc}>Count: {count}</button>` | Emits`EXEC_THUNK`, `CREATE_ELEMENT`, `BIND_EVENT`, `MOUNT`, `JUMP`, `RETURN` instructions | ✅ PASSED |

---

### 5. Client Virtual Machine Runtime (`@driftjs/vm/client`)

| Test ID       | Category           | Objective / Description                                                  | Inputs / Test Conditions                                  | Expected Output / Behavior                                             |  Status  |
| :------------ | :----------------- | :----------------------------------------------------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------- | :-------: |
| `TC-VM-001` | Happy Path         | Boot application via class constructor                                   | `new DriftJSClientVM(program, root).boot()`             | Boots VM and mounts DOM elements into root container                   | ✅ PASSED |
| `TC-VM-002` | Happy Path         | Interpret program via`interpret()` convenience function                | `interpret(program, root)`                              | Instantiates and boots VM instance                                     | ✅ PASSED |
| `TC-VM-003` | Happy Path         | Set DOM property directly via`SET_PROPERTY` opcode                     | `<input type="text" value={val} />`                     | Directly sets`inputElement.value` DOM property                       | ✅ PASSED |
| `TC-VM-004` | Happy Path         | Remove child node via`REMOVE_CHILD` opcode                             | VM program with`REMOVE_CHILD` instruction               | Detaches child DOM node from parent element                            | ✅ PASSED |
| `TC-VM-005` | Happy Path         | Execute`CALL`, `RETURN`, and `JUMP_IF_TRUE` bytecode branching     | VM program subroutine execution                           | Performs conditional jumps and stack frame call returns                | ✅ PASSED |
| `TC-VM-006` | Integration        | Clean up event listeners, node references, and innerHTML on`unmount()` | `vm.unmount()`                                          | Removes event listeners, empties root innerHTML, clears register state | ✅ PASSED |
| `TC-VM-007` | Async Reactivity   | Update DOM asynchronously inside`setTimeout`                           | `setTimeout(() => count++, 30)`                         | DOM updates asynchronously after timer expires                         | ✅ PASSED |
| `TC-VM-008` | Microtask Batching | Batch multiple synchronous mutations into single DOM update              | 100 consecutive synchronous increments                    | Microtask scheduler aggregates updates into a single re-render patch   | ✅ PASSED |
| `TC-VM-009` | Optimization       | Skip unchanged signals using O(1) bitmask check                          | Mutate signal`A` when signal `B` remains unchanged    | Re-render patch skips updating DOM node for signal`B`                | ✅ PASSED |
| `TC-VM-010` | Async Reactivity   | Update DOM asynchronously inside`Promise.then`                         | `Promise.resolve().then(...)`                           | Reactive update resolves on promise resolution microtask               | ✅ PASSED |
| `TC-VM-011` | Async Reactivity   | Update DOM inside`async` function with `await`                       | `async () => { await load(); data = "loaded"; }`        | DOM updates asynchronously after promise await resolves                | ✅ PASSED |
| `TC-VM-012` | Async Reactivity   | Update DOM repeatedly on`setInterval` ticks                            | `setInterval(() => ticks++, 15)`                        | DOM updates repeatedly across timer interval ticks                     | ✅ PASSED |
| `TC-VM-013` | Async Reactivity   | Update DOM asynchronously after`fetch()` resolves                      | `fetch('/api/user').then(data => username = data.user)` | DOM updates after network fetch promise resolves                       | ✅ PASSED |

---

### 6. Server Virtual Machine SSR (`@driftjs/vm/server`)

| Test ID        | Category    | Objective / Description                                             | Inputs / Test Conditions                                                             | Expected Output / Behavior                                        |  Status  |
| :------------- | :---------- | :------------------------------------------------------------------ | :----------------------------------------------------------------------------------- | :---------------------------------------------------------------- | :-------: |
| `TC-SSR-001` | Happy Path  | Render simple static HTML template to string                        | `<div id="container"><h1>Hello SSR</h1></div>`                                     | Produces`<div id="container"><h1>Hello SSR</h1></div>`          | ✅ PASSED |
| `TC-SSR-002` | Happy Path  | Evaluate reactive state and interpolations on server                | `<script>let title="Drift"; let count=42;</script><h2>{title}</h2>`                | Produces`<h2>Drift</h2>` evaluating state variables on server   | ✅ PASSED |
| `TC-SSR-003` | Happy Path  | Render void elements without closing tags                           | `<div><script>let val="Drift";</script><img src="a.png"><input value={val}></div>` | Produces`<div><img src="a.png"><input value="Drift"></div>`     | ✅ PASSED |
| `TC-SSR-004` | Security    | Escape HTML special characters in text & attributes                 | `<p title={badAttr}>{badText}</p>`                                                 | Escapes`&`, `<`, `>`, `"`, `'` to prevent XSS injection | ✅ PASSED |
| `TC-SSR-005` | Happy Path  | Render boolean properties (`disabled`, `checked`)               | `<button disabled={isDisabled}>Submit</button>`                                    | Produces`<button disabled="true">Submit</button>`               | ✅ PASSED |
| `TC-SSR-006` | Integration | Render complex nested DOM trees with multiple interpolation targets | `<header><div><span>{user}</span><span>{role}</span></div></header>`               | Serializes complete nested tree structure into HTML string        | ✅ PASSED |
| `TC-SSR-007` | Happy Path  | Instantiate`DriftJSServerVM` directly                             | `new DriftJSServerVM(program).renderToString()`                                    | Returns HTML string output directly from server VM class instance | ✅ PASSED |

---

### 7. Vite Plugin Module `@driftjs/vite-plugin`)

| Test ID        | Category    | Objective / Description                            | Inputs / Test Conditions                 | Expected Output / Behavior                                                                                |  Status  |
| :------------- | :---------- | :------------------------------------------------- | :--------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :-------: |
| `TC-PLG-001` | Happy Path  | Instantiate Vite plugin with configuration options | `driftPlugin({ extension: '.drift' })` | Returns Vite plugin object with`name: 'vite-plugin-drift'` and `transform()`                          | ✅ PASSED |
| `TC-PLG-002` | Edge Case   | Skip non-`.drift` files during transform         | `transform(code, 'App.js')`            | Returns`null` to pass file to next plugin                                                               | ✅ PASSED |
| `TC-PLG-003` | Integration | AOT compile`.drift` SFC template into ESM module | `transform(code, 'App.drift')`         | Emits ESM JavaScript module containing serialized`Uint32Array` bytecode and `render()` mount function | ✅ PASSED |

---

## 🛠 Running the Test Suite

To run all 48 test cases across all workspace packages:

```bash
# Build all monorepo packages first
pnpm build

# Execute full Vitest test suite
pnpm test
```
