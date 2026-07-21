# DriftJS Test Suite Specification & Matrix

This document provides a formal test specification matrix covering all 42 unit and integration test cases across the DriftJS monorepo (`@driftjs/compiler`, `@driftjs/vm`, and `vite-plugin-drift`).

---

## 📊 Summary Metrics

| Package                            | Test Module File                              |  Test Cases  |        Status        |
| :--------------------------------- | :-------------------------------------------- | :----------: | :-------------------: |
| **`@driftjs/compiler`**    | `packages/compiler/tests/lexer.test.ts`     |      7      |       ✅ PASSED       |
| **`@driftjs/compiler`**    | `packages/compiler/tests/parser.test.ts`    |      10      |       ✅ PASSED       |
| **`@driftjs/compiler`**    | `packages/compiler/tests/analyzer.test.ts`  |      5      |       ✅ PASSED       |
| **`@driftjs/compiler`**    | `packages/compiler/tests/generator.test.ts` |      3      |       ✅ PASSED       |
| **`@driftjs/vm`**          | `packages/vm/tests/vm.test.ts`              |      13      |       ✅ PASSED       |
| **`@driftjs/vite-plugin`** | `packages/vite-plugin/tests/plugin.test.ts` |      3      |       ✅ PASSED       |
| **Total Workspace**          | **6 Test Suites**                       | **41** | **100% PASSED** |

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

| Test ID        | Category   | Objective / Description                                    | Inputs / Test Conditions                                                     | Expected Output / Behavior                                                                                     |  Status  |
| :------------- | :--------- | :--------------------------------------------------------- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- | :-------: |
| `TC-PAR-001` | Happy Path | Parse template passed to constructor                       | `new DriftJSParser('<div>Hello</div>')`                                    | Produces`ElementNode("div")` containing single `TextNode("Hello")` child                                   | ✅ PASSED |
| `TC-PAR-002` | Happy Path | Parse template via convenience function                    | `parseTemplate('<p>{count}</p>')`                                          | Produces`ElementNode("p")` containing `InterpolationNode("count")`                                         | ✅ PASSED |
| `TC-PAR-003` | Happy Path | Parse expression attributes & event handlers               | `<input type="text" value={userInput} oninput={(e) => handleInput(e);} />` | Attributes object contains`value: '{userInput}'`, events object contains `input: '(e) => handleInput(e);'` | ✅ PASSED |
| `TC-PAR-004` | Happy Path | Handle HTML void elements without closing tags             | `<div><img src="avatar.png"><br><input type="checkbox"></div>`             | Correctly parses void children without expecting closing tags                                                  | ✅ PASSED |
| `TC-PAR-005` | Happy Path | Preserve nested JS braces inside interpolation expressions | `<p>{items.map(x => ({ id: x.id }))}</p>`                                  | `InterpolationNode` expression retains complete object literal mapping code                                  | ✅ PASSED |
| `TC-PAR-006` | Edge Case  | Strip formatting-only whitespace text nodes                | `\n <div>\n <h1>Title</h1>\n </div>`                                       | Strips empty newline/indent text nodes between elements                                                        | ✅ PASSED |
| `TC-PAR-007` | Edge Case  | Parse empty input string                                   | `""`                                                                       | Returns empty AST node array`[]`                                                                             | ✅ PASSED |
| `TC-PAR-008` | Error Case | Detect missing tag name after`<`                         | `<>`                                                                       | Throws`Error('Expected tag name')`                                                                           | ✅ PASSED |
| `TC-PAR-009` | Error Case | Detect closing tag mismatch                                | `<div></span>`                                                             | Throws`Error('Expected closing tag </div> but got </span>')`                                                 | ✅ PASSED |
| `TC-PAR-010` | Error Case | Detect unclosed interpolation expression                   | `<p>{count</p>`                                                            | Throws`Error('Unclosed interpolation')`                                                                      | ✅ PASSED |

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

### 5. Virtual Machine Runtime (`@driftjs/vm`)

| Test ID       | Category           | Objective / Description                                                  | Inputs / Test Conditions                               | Expected Output / Behavior                                             |  Status  |
| :------------ | :----------------- | :----------------------------------------------------------------------- | :----------------------------------------------------- | :--------------------------------------------------------------------- | :-------: |
| `TC-VM-001` | Happy Path         | Mount application via class constructor                                  | `new DriftJSClientVM(program, root).mount()`         | Mounts DOM elements into root container                                | ✅ PASSED |
| `TC-VM-002` | Happy Path         | Mount application via`mountApp()` convenience function                 | `mountApp(program, root)`                            | Instantiates and mounts VM instance                                    | ✅ PASSED |
| `TC-VM-003` | Happy Path         | Set DOM property directly via`SET_PROPERTY` opcode                     | `<input type="text" value={val} />`                  | Directly sets`inputElement.value` DOM property                       | ✅ PASSED |
| `TC-VM-004` | Happy Path         | Remove child node via`REMOVE_CHILD` opcode                             | VM program with`REMOVE_CHILD` instruction            | Detaches child DOM node from parent element                            | ✅ PASSED |
| `TC-VM-005` | Happy Path         | Execute`CALL`, `RETURN`, and `JUMP_IF_TRUE` bytecode branching     | VM program subroutine execution                        | Performs conditional jumps and stack frame call returns                | ✅ PASSED |
| `TC-VM-006` | Integration        | Clean up event listeners, node references, and innerHTML on`unmount()` | `vm.unmount()`                                       | Removes event listeners, empties root innerHTML, clears register state | ✅ PASSED |
| `TC-VM-007` | Async Reactivity   | Update DOM asynchronously inside`setTimeout`                           | `setTimeout(() => count++, 30)`                      | DOM updates asynchronously after timer expires                         | ✅ PASSED |
| `TC-VM-008` | Microtask Batching | Batch multiple synchronous mutations into single DOM update              | 100 consecutive synchronous increments                 | Microtask scheduler aggregates updates into a single re-render patch   | ✅ PASSED |
| `TC-VM-009` | Optimization       | Skip unchanged signals using O(1) bitmask check                          | Mutate signal`A` when signal `B` remains unchanged | Re-render patch skips updating DOM node for signal`B`                | ✅ PASSED |
| `TC-VM-010` | Async Reactivity   | Update DOM asynchronously inside`Promise.then`                         | `Promise.resolve().then(...)`                        | Reactive update resolves on promise resolution microtask               | ✅ PASSED |
| `TC-VM-011` | Async Reactivity   | Update DOM inside`async` function with `await`                       | `async () => { await delay(); state = 'done'; }`     | DOM updates correctly across async await suspension points             | ✅ PASSED |
| `TC-VM-012` | Async Reactivity   | Update DOM repeatedly on`setInterval` ticks                            | `setInterval(() => count++, 20)`                     | DOM reflects updated count across interval ticks                       | ✅ PASSED |
| `TC-VM-013` | Async Reactivity   | Update DOM asynchronously after`fetch()` resolves                      | `fetch().then(res => res.json()).then(...)`          | DOM patches correctly when network fetch resolves                      | ✅ PASSED |

---

### 6. Vite Plugin Module (`@driftjs/vite-plugin`)

| Test ID        | Category    | Objective / Description                            | Inputs / Test Conditions                 | Expected Output / Behavior                                                                         |  Status  |
| :------------- | :---------- | :------------------------------------------------- | :--------------------------------------- | :------------------------------------------------------------------------------------------------- | :-------: |
| `TC-PLG-001` | Happy Path  | Instantiate Vite plugin with configuration options | `driftPlugin({ extension: '.drift' })` | Returns Vite plugin object with`name: 'vite-plugin-drift'` and `transform()`                   | ✅ PASSED |
| `TC-PLG-002` | Edge Case   | Skip non-`.drift` files during transform         | `transform(code, 'App.js')`            | Returns`null` to pass file to next plugin                                                        | ✅ PASSED |
| `TC-PLG-003` | Integration | AOT compile`.drift` SFC template into ESM module | `transform(code, 'App.drift')`         | Emits ESM JavaScript module containing serialized`Uint32Array` bytecode and `mount()` function | ✅ PASSED |

---

## 🛠 Running the Test Suite

To run all 42 test cases across all workspace packages:

```bash
# Build all monorepo packages first
pnpm build

# Execute full Vitest test suite
pnpm test
```
