# DriftJS Test Suite Documentation

This document provides a comprehensive inventory of all unit and integration test suites maintained across the **DriftJS** monorepo packages.

---

## 📊 Monorepo Test Overview

Total Test Suites: **9** | Total Test Cases: **95** | Pass Rate: **100%**

| Package Name                       | Package Directory        | Test Suites |  Test Cases  |     Pass Status     |
| :--------------------------------- | :----------------------- | :---------: | :----------: | :-----------------: |
| **`driftjs-compiler`**     | `packages/compiler`    |      4      |      52      |       ✅ PASS       |
| **`driftjs-shared`**       | `packages/utils`       |      1      |      5      |       ✅ PASS       |
| **`driftjs-dom`**          | `packages/dom`         |      3      |      19      |       ✅ PASS       |
| **`driftjs-ssr`**          | `packages/ssr`         |      1      |      5      |       ✅ PASS       |
| **`driftjs-vite-plugin`**  | `packages/vite-plugin` |      1      |      14      |       ✅ PASS       |
| **`create-drift`**         | `packages/cli`         |      1      |      8       |       ✅ PASS       |
| **Total Workspace**          |                          | **11** | **103** | **100% PASS** |

---

## 📦 1. Package: `driftjs-compiler` (`packages/compiler`)

Total Test Suites: **4** | Total Test Cases: **52**

### 1.1 Lexer Test Suite (`tests/lexer.test.ts`)

| # | Test Suite Description                                                               | Test Target & Behavior                                                                               |
| :-: | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| 1 | `returns one token per invocation and tracks lexical state transitions`            | Verifies state machine transitions (`Data` ➔ `TagOpen` ➔ `BeforeAttributeName` ➔ `Data`)  |
| 2 | `handles empty input and whitespace-only input`                                    | Verifies lazy EOF token emission and whitespace text token handling                                  |
| 3 | `lexes nested braces and strings inside interpolations correctly`                  | Verifies nested object literal depth tracking inside`{ ... }`                                      |
| 4 | `lexes template literals with backticks inside interpolations`                     | Verifies backtick JS template strings`${...}` inside interpolations                                |
| 5 | `lexes adjacent interpolations without text in between`                            | Verifies consecutive interpolations`{first}{second}` without text gaps                             |
| 6 | `lexes comments containing tags and special characters`                            | Verifies HTML comment tokenization`<!-- ... -->` containing nested HTML tags                       |
| 7 | `lexes attributes with hyphen and underscore identifiers`                          | Verifies kebab-case and snake_case attribute name tokenization (`custom-button`, `data-test-id`) |
| 8 | `treats script and style contents as raw text blocks`                              | Verifies`<script>` and `<style>` tag content is preserved as raw unparsed text                   |
| 9 | `throws on unterminated string literal in attributes`                              | Asserts`DriftLexerError` thrown on unclosed quotes in attribute strings                            |
| 10 | `throws on unterminated XML comments`                                              | Asserts`DriftLexerError` thrown on unclosed comment tags `<!-- ...`                              |
| 11 | `throws on unexpected characters inside tag headers`                               | Asserts`DriftLexerError` thrown on invalid tag syntax like `<div %invalid>`                      |
| 12 | `lexes directive headers containing braces inside quotes cleanly`                  | Verifies`@if name === "{admin}"` directive header tokenization                                     |
| 13 | `throws on unknown directive names`                                                | Asserts`DriftLexerError` thrown on unknown directives `@unknownDirective`                        |
| 14 | `throws on unterminated directive header`                                          | Asserts`DriftLexerError` thrown when `{` block opening is missing                                |
| 15 | `lexes escaped quotes inside string literals within interpolations`                | Verifies escaped string quotes`"Hello \"World\""` inside interpolations                            |
| 16 | `lexes JS comments with braces inside interpolations without breaking brace depth` | Verifies`/* ... */` and `// ...` comments with `}` inside interpolations                       |
| 17 | `lexes template literal nested expressions inside interpolations`                  | Verifies complex nested expressions inside`${ ... }` template literals                             |
| 18 | `lexes escaped quotes inside directive headers cleanly`                            | Verifies escaped quotes inside`@if` headers                                                        |

### 1.2 Parser Test Suite (`tests/parser.test.ts`)

| # | Test Suite Description                                             | Test Target & Behavior                                                                           |
| :-: | :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| 1 | `parses empty templates`                                         | Verifies empty program AST output (`ASTNodeType.Program`, `body: []`)                        |
| 2 | `lets the parser drive token consumption lazily`                 | Asserts lazy token consumption on-demand rather than pre-lexing full buffer                      |
| 3 | `parses deeply nested element structures`                        | Verifies deep AST tree construction (`div` ➔ `main` ➔ `article` ➔ `section` ➔ `p`) |
| 4 | `parses multiple root-level elements, text, and comments`        | Verifies sibling root nodes in program AST body                                                  |
| 5 | `parses attributes of mixed kinds`                               | Verifies static, boolean, and interpolated attributes (`data-bind={isBound}`)                  |
| 6 | `parses script tag content as a raw text child`                  | Verifies`<script>` element child text node parsing                                             |
| 7 | `parses complex JS interpolations into raw expression strings`   | Verifies ternary operators, arrow functions, and optional chaining expressions                   |
| 8 | `parses interpolated attribute values as raw expression strings` | Verifies dynamic attribute expression parsing (`onclick={ (e) => handleClick(e) }`)            |
| 9 | `throws when an unexpected closing tag appears at the top level` | Asserts`DriftParserError` on orphan closing tags `</div>`                                    |
| 10 | `throws when an attribute value is missing after =`              | Asserts`DriftParserError` on trailing equals `<div class=>`                                  |
| 11 | `throws on mismatched nested closing tags`                       | Asserts`DriftParserError` on mismatched tags `<div><span></div></span>`                      |
| 12 | `throws when closing bracket is missing in manual token stream`  | Asserts`DriftParserError` on unclosed tags in manual token streams                             |
| 13 | `parses @if, @else if, and @else directives cleanly`             | Verifies nested conditional AST construction for`@if / @else if / @else`                       |
| 14 | `parses @for directives cleanly`                                 | Verifies loop AST construction for`@for (item, index) in items`                                |
| 15 | `parses @for directive without index with index set to null`     | Verifies`@for item in items` sets `index: null`                                              |
| 16 | `parses @switch, @case, and @default directives cleanly`         | Verifies AST construction for`@switch / @case / @default`                                      |
| 17 | `parses deeply nested mixed control flows`                       | Verifies nested control flow ASTs (`@switch` ➔ `@for` ➔ `@if`)                           |
| 18 | `throws on unclosed directive blocks`                            | Asserts`DriftParserError` on unclosed block braces `@if { <div>`                             |
| 19 | `throws on invalid @for header syntax missing in keyword`        | Asserts`DriftParserError` on invalid loop syntax `@for item items`                           |
| 20 | `throws on invalid content inside @switch blocks`                | Asserts`DriftParserError` on direct non-case children inside `@switch`                       |

### 1.3 Transformer Test Suite (`tests/transformer.test.ts`)

| # | Test Suite Description                                                             | Test Target & Behavior                                                            |
| :-: | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| 1 | `should strip redundant whitespace and newline text nodes between elements`      | Verifies HTML whitespace formatting cleanup between block elements                |
| 2 | `should transform raw interpolation strings into Acorn JS AST nodes`             | Converts raw string`{ user.name }` into Acorn `MemberExpression` AST          |
| 3 | `should transform script tag text child into stripped Acorn JS statement AST`    | Converts`<script>` raw body into Acorn `VariableDeclaration` AST              |
| 4 | `should enrich nested directive expressions into Acorn JS AST nodes`             | Enriches`@switch`, `@case`, `@for`, and `@if` expressions into Acorn ASTs |
| 5 | `should throw DriftParserError when invalid JS syntax expression is encountered` | Asserts error on invalid JS syntax like`{ 1 + * 2 }`                            |

### 1.4 Generator Test Suite (`tests/generator.test.ts`)

| # | Test Suite Description                                                      | Test Target & Behavior                                                               |
| :-: | :-------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| 1 | `generates fragment and return for empty templates`                       | Emits`[Opcode.CREATE_FRAGMENT, 0, Opcode.RETURN, 0]` for empty input               |
| 2 | `generates direct root element for single top-level element`              | Emits`[Opcode.CREATE_ELEMENT, 0, tagIdx]` for single root elements                 |
| 3 | `generates fragment container for multiple top-level nodes`               | Emits`CREATE_FRAGMENT` container for sibling root elements                         |
| 4 | `generates static, dynamic, and boolean attributes`                       | Emits`Opcode.SET_ATTR` instructions for static and dynamic attributes              |
| 5 | `generates interpolated text and comments`                                | Emits`Opcode.CREATE_COMMENT` and `Opcode.INTERPOLATE_TEXT` instructions          |
| 6 | `generates REACTIVE_IF opcode for @if, @else if, and @else control flows` | Emits`Opcode.REACTIVE_IF` with sub-module constants and dependency arrays          |
| 7 | `generates REACTIVE_FOR opcode for @for loop directives`                  | Emits`Opcode.REACTIVE_FOR` with body sub-module, item names, and dependency arrays |
| 8 | `works end-to-end via interpret() function`                               | Validates end-to-end template compilation into bytecode module                       |

---

## 📦 2. Package: `driftjs-shared` (`packages/utils`)

Total Test Suites: **1** | Total Test Cases: **5**

### 2.1 Shared Evaluator Test Suite (`tests/utils.test.ts`)

| # | Test Suite Description                                | Test Target & Behavior                                                    |
| :-: | :---------------------------------------------------- | :------------------------------------------------------------------------ |
| 1 | `exports MAX_REGISTERS constant equal to 256`       | Verifies register boundary constant export                                |
| 2 | `evaluates binary, logical, and member expressions` | Verifies AST expression evaluation against scope (`evaluateExpression`) |
| 3 | `sets scope value up the prototype chain`           | Verifies prototypical scope chain variable assignment (`setScopeValue`) |
| 4 | `resolves iterables cleanly`                        | Verifies safe iterable array resolution (`resolveIterable`)             |
| 5 | `executes block statements and updates scope`       | Verifies AST block statement interpretation (`executeBlockStatement`)   |

---

## 📦 3. Package: `driftjs-dom` (`packages/dom`)

Total Test Suites: **2** | Total Test Cases: **18**

### 3.1 Main Client VM Test Suite (`tests/client.test.ts`)

| # | Test Suite Description                                                                 | Test Target & Behavior                                                                              |
| :-: | :------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| 1 | `renders simple static HTML elements`                                                | Executes`CREATE_ELEMENT`, `CREATE_TEXT`, `APPEND_CHILD`, `RETURN` to produce DOM Heading    |
| 2 | `renders attributes dynamically and statically`                                      | Verifies static attribute setting (`type="checkbox"`) and dynamic evaluation (`data-id="42"`)   |
| 3 | `renders REACTIVE_IF: true branch shown, false branch hidden`                        | Verifies conditional mounting of consequent vs alternate sub-modules between comment anchors        |
| 4 | `REACTIVE_IF re-renders on state change (triggerUpdates)`                            | Verifies dynamic DOM insertion/removal of elements when condition state changes                     |
| 5 | `renders REACTIVE_FOR: list items rendered between anchors`                          | Verifies dynamic list rendering of items between comment anchors (`<!--for-->` / `<!--/for-->`) |
| 6 | `REACTIVE_FOR re-renders on list change (triggerUpdates)`                            | Verifies list re-rendering when array items are appended or modified                                |
| 7 | `mounts a component directly to an HTMLElement container`                            | Verifies`mount(module, container)` API appending rendered node to DOM target                      |
| 8 | `updates reactive nodes in-place via updateAt(pc, module, scope)`                    | Verifies targeted in-place text patching by jumping directly to instruction PC                      |
| 9 | `EXEC_SCRIPT initialises scope from VariableDeclaration and FunctionDeclaration AST` | Verifies`<script>` scope initialisation and function invocation writebacks                        |
| 10 | `renders nested @for loops correctly`                                                | Verifies nested`@for` loops rendering sub-lists inside outer category loops                       |
| 11 | `uses a single delegated event listener on document for thousands of items`          | Verifies central event delegation for event listeners (`onclick={...}`)                           |
| 12 | `handles event bubbling when clicking nested children inside an event-bound element` | Verifies event target traversal up the DOM tree to find bound handler                               |
| 13 | `updates list history on click event in template component`                          | Verifies component state reactivity on initial user event click                                     |
| 14 | `updates modified list item in-place without touching unchanged DOM nodes`           | Verifies row content update in keyed list when item object reference changes                        |

### 3.2 Edge Cases & LIS Suite (`tests/edge-cases.test.ts`)

| # | Test Suite Description                                                                  | Test Target & Behavior                                                                         |
| :-: | :-------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| 1 | `handles NewExpression and ForStatement in VM script execution`                       | Verifies VM AST interpreter support for`new Array(3)` and `for (let i=0;...)` loops        |
| 2 | `handles default parameter assignment and function scope writebacks`                  | Verifies default parameter handling (`AssignmentPattern`) and outer scope variable mutation  |
| 3 | `preserves TR node identity during row swap in REACTIVE_FOR list`                     | Verifies Longest Increasing Subsequence (LIS) reconciler physically swaps existing DOM nodes   |
### 3.3 SSR & Hydration End-to-End Suite (`tests/hydration.test.ts`)

| # | Test Suite Description | Test Target & Behavior |
| :---: | :--- | :--- |
| 1 | `hydrates pre-rendered SSR HTML without destroying existing DOM nodes and binds event listeners` | Verifies `hydrate()` claims pre-rendered SSR HTML nodes in-place with 0 node recreations and attaches reactive event listeners |

---

## 📦 4. Package: `driftjs-ssr` (`packages/ssr`)

Total Test Suites: **1** | Total Test Cases: **5**

### 4.1 Server-Side Rendering Test Suite (`tests/ssr.test.ts`)

| # | Test Suite Description                                                      | Test Target & Behavior                                                       |
| :-: | :-------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| 1 | `renders static elements with escape protection to HTML string`           | Verifies DOM-less rendering and XSS string escaping                          |
| 2 | `renders attributes, boolean flags, and dynamic values`                   | Verifies attribute formatting and dynamic AST evaluation on server           |
| 3 | `renders REACTIVE_IF conditionals on server (true branch & false branch)` | Verifies server-side rendering of conditional`@if` blocks                  |
| 4 | `renders REACTIVE_FOR loops with item and index scope bindings`           | Verifies server-side rendering of`@for` loops with item and index bindings |
| 5 | `EXEC_SCRIPT initialises server scope before rendering HTML`              | Verifies server-side`<script>` execution prior to HTML string generation   |

---

## 📦 5. Package: `driftjs-vite-plugin` (`packages/vite-plugin`)

Total Test Suites: **1** | Total Test Cases: **14**

### 5.1 Plugin Test Suite (`tests/plugin.test.ts`)

| # | Test Suite Description                                       | Test Target & Behavior                                                                            |
| :-: | :----------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| 1 | `ignores non-.drift files`                                 | Verifies plugin transform hook returns`null` for `.ts` / `.js` files                        |
| 2 | `transforms .drift files`                                  | Verifies plugin transform hook processes`.drift` files                                          |
| 3 | `exports default compiledModule`                           | Verifies emitted ESM module contains`export default compiledModule;`                            |
| 4 | `includes source file path in a comment`                   | Verifies file path attribution comment in generated ESM JS output                                 |
| 5 | `compiledModule has bytecode and constants arrays`         | Verifies compiled module output structure contains`bytecode` and `constants`                  |
| 6 | `compiles static element without throwing`                 | Verifies static HTML section compilation through Vite transform hook                              |
| 7 | `compiles @if / @else directives`                          | Verifies`@if / @else` template compilation through Vite transform hook                          |
| 8 | `compiles @for loops`                                      | Verifies`@for` template compilation through Vite transform hook                                 |
| 9 | `compiles interpolations`                                  | Verifies text interpolation compilation through Vite transform hook                               |
| 10 | `surfaces DriftJS compilation errors as Vite build errors` | Asserts compilation syntax errors throw Vite build errors (`this.error()`)                      |
| 11 | `calls console.log when debug: true`                       | Verifies debug logging when`debug: true` plugin option is set                                   |
| 12 | `does not call console.log when debug: false`              | Verifies quiet build mode by default when`debug: false`                                         |
| 13 | `triggers a full-reload for .drift files`                  | Verifies HMR hook invalidates module graph and sends`full-reload` WS event for `.drift` files |
| 14 | `ignores non-.drift files in HMR`                          | Verifies HMR hook ignores non-`.drift` file changes                                             |
