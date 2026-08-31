# DriftJS Test Suite Documentation

This document provides a comprehensive inventory of all unit and integration test suites maintained across the **DriftJS** monorepo packages.

---

## 📊 Monorepo Test Overview

Total Test Suites: **17** | Total Test Cases: **192** | Pass Rate: **100%**

| Package Name | Package Directory | Test Suites | Test Cases | Pass Status |
| :--- | :--- | :---: | :---: | :---: |
| **`driftjs-compiler`** | `packages/compiler` | 4 | 77 | ✅ PASS |
| **`driftjs-shared`** | `packages/utils` | 1 | 8 | ✅ PASS |
| **`driftjs-dom`** | `packages/dom` | 8 | 69 | ✅ PASS |
| **`driftjs-ssr`** | `packages/ssr` | 2 | 13 | ✅ PASS |
| **`driftjs-vite-plugin`** | `packages/vite-plugin` | 1 | 15 | ✅ PASS |
| **`create-drift`** | `packages/cli` | 1 | 10 | ✅ PASS |
| **Total Workspace** | | **17** | **192** | **100% PASS** |

---

## 📦 1. Package: `driftjs-compiler` (`packages/compiler`)

Total Test Suites: **4** | Total Test Cases: **77**

### 1.1 Lexer Test Suite (`tests/lexer.test.ts` — 25 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `returns one token per invocation and tracks lexical state transitions` | Verifies state machine transitions (`Data` ➔ `TagOpen` ➔ `BeforeAttributeName` ➔ `Data`) |
| 2 | `handles empty input and whitespace-only input` | Verifies lazy EOF token emission and whitespace text token handling |
| 3 | `lexes nested braces and strings inside interpolations correctly` | Verifies nested object literal depth tracking inside `{ ... }` |
| 4 | `lexes template literals with backticks inside interpolations` | Verifies backtick JS template strings `${...}` inside interpolations |
| 5 | `lexes adjacent interpolations without text in between` | Verifies consecutive interpolations `{first}{second}` without text gaps |
| 6 | `lexes comments containing tags and special characters` | Verifies HTML comment tokenization `<!-- ... -->` containing nested HTML tags |
| 7 | `lexes attributes with hyphen and underscore identifiers` | Verifies kebab-case and snake_case attribute name tokenization (`custom-button`, `data-test-id`) |
| 8 | `treats script and style contents as raw text blocks` | Verifies `<script>` and `<style>` tag content is preserved as raw unparsed text |
| 9 | `throws on unterminated string literal in attributes` | Asserts `DriftLexerError` thrown on unclosed quotes in attribute strings |
| 10 | `throws on unterminated XML comments` | Asserts `DriftLexerError` thrown on unclosed comment tags `<!-- ...` |
| 11 | `throws on unexpected characters inside tag headers` | Asserts `DriftLexerError` thrown on invalid tag syntax like `<div %invalid>` |
| 12 | `lexes directive headers containing braces inside quotes cleanly` | Verifies `@if name === "{admin}"` directive header tokenization |
| 13 | `throws on unknown directive names` | Asserts `DriftLexerError` thrown on unknown directives `@unknownDirective` |
| 14 | `throws on unterminated directive header` | Asserts `DriftLexerError` thrown when `{` block opening is missing |
| 15 | `lexes escaped quotes inside string literals within interpolations` | Verifies escaped string quotes `"Hello \"World\""` inside interpolations |
| 16 | `lexes JS comments with braces inside interpolations without breaking brace depth` | Verifies `/* ... */` and `// ...` comments with `}` inside interpolations |
| 17 | `lexes template literal nested expressions inside interpolations without breaking brace depth` | Verifies complex nested expressions inside `${ ... }` template literals |
| 18 | `lexes escaped quotes inside directive headers cleanly` | Verifies escaped quotes inside `@if` headers |
| 19 | `lexes regular expression literals containing braces inside interpolations correctly` | Verifies regex literals like `/{foo}/` inside interpolations |
| 20 | `lexes regular expression literals containing braces inside directive headers cleanly` | Verifies regex literals with braces in directive headers |
| 21 | `emits DirectiveIf token with condition as value` | Verifies token type and condition string for `@if` |
| 22 | `emits DirectiveIf then DirectiveElse tokens for @if / @else` | Verifies token stream for `@if` / `@else` pairs |
| 23 | `emits DirectiveIf, DirectiveElseIf, and DirectiveElse tokens in sequence for ladders` | Verifies token stream for `@if` / `@else if` / `@else` ladders |
| 24 | `correctly lexes self-closing tags with whitespace before and inside slash-gt` | Verifies `<img src="a.png" />` tokenization |
| 25 | `correctly lexes identifiers starting with _ and $ in tags and attributes` | Verifies `_private`, `$store`, and `_foo` identifiers |

### 1.2 Parser Test Suite (`tests/parser.test.ts` — 26 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `parses empty templates` | Verifies empty program AST output (`ASTNodeType.Program`, `body: []`) |
| 2 | `lets the parser drive token consumption lazily` | Asserts lazy token consumption on-demand rather than pre-lexing full buffer |
| 3 | `parses deeply nested element structures` | Verifies deep AST tree construction (`div` ➔ `main` ➔ `article` ➔ `section` ➔ `p`) |
| 4 | `parses multiple root-level elements, text, and comments` | Verifies sibling root nodes in program AST body |
| 5 | `parses attributes of mixed kinds` | Verifies static, boolean, and interpolated attributes (`data-bind={isBound}`) |
| 6 | `parses script tag content as a raw text child` | Verifies `<script>` element child text node parsing |
| 7 | `parses complex JS interpolations into raw expression strings` | Verifies ternary operators, arrow functions, and optional chaining expressions |
| 8 | `parses interpolated attribute values as raw expression strings` | Verifies dynamic attribute expression parsing (`onclick={ (e) => handleClick(e) }`) |
| 9 | `throws when an unexpected closing tag appears at the top level` | Asserts `DriftParserError` on orphan closing tags `</div>` |
| 10 | `throws when an attribute value is missing after =` | Asserts `DriftParserError` on trailing equals `<div class=>` |
| 11 | `throws on mismatched nested closing tags` | Asserts `DriftParserError` on mismatched tags `<div><span></div></span>` |
| 12 | `throws when the closing bracket is missing in a manual token stream` | Asserts `DriftParserError` on unclosed tags in manual token streams |
| 13 | `parses @if, @else if, and @else directives cleanly` | Verifies nested conditional AST construction for `@if / @else if / @else` |
| 14 | `parses @for directives cleanly` | Verifies loop AST construction for `@for (item, index) in items` |
| 15 | `parses @for directive without index with index set to null` | Verifies `@for item in items` sets `index: null` |
| 16 | `parses @for directive with canonical key expression` | Verifies `@for (item, idx) in items key item.id` key expression parsing |
| 17 | `parses @switch, @case, and @default directives cleanly` | Verifies AST construction for `@switch / @case / @default` |
| 18 | `parses deeply nested mixed control flows (nested @if inside @for inside @switch)` | Verifies nested control flow ASTs (`@switch` ➔ `@for` ➔ `@if`) |
| 19 | `throws on unclosed directive blocks` | Asserts `DriftParserError` on unclosed block braces `@if { <div>` |
| 20 | `throws on invalid @for header syntax missing in keyword` | Asserts `DriftParserError` on invalid loop syntax `@for item items` |
| 21 | `throws on invalid content inside @switch blocks that is not @case or @default` | Asserts `DriftParserError` on direct non-case children inside `@switch` |
| 22 | `automatically parses HTML void elements as self-closing without requiring explicit closing tags` | Verifies automatic self-closing handling for standard void elements (`<img ...>`, `<input ...>`) |
| 23 | `parses @if with complex JS condition expressions` | Verifies parsing complex conditions with binary/logical operators |
| 24 | `chains multiple @else if branches into nested alternate IfNodes` | Verifies correct AST nesting for multi-branch `@else if` ladders |
| 25 | `parses doubly-nested and triply-nested @if blocks` | Verifies deeply nested `@if` blocks inside branches |
| 26 | `parses self-closing void elements with attributes and following sibling elements correctly` | Verifies void elements followed by sibling nodes in same parent |

### 1.3 Transformer Test Suite (`tests/transformer.test.ts` — 6 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `should strip redundant whitespace and newline text nodes between elements` | Verifies HTML whitespace formatting cleanup between block elements |
| 2 | `should transform raw interpolation strings into Acorn JS AST nodes` | Converts raw string `{ user.name }` into Acorn `MemberExpression` AST |
| 3 | `should transform script tag text child into stripped Acorn JS statement AST` | Converts `<script>` raw body into Acorn `VariableDeclaration` AST |
| 4 | `should enrich nested directive expressions (If, For, Switch) into Acorn JS AST nodes` | Enriches `@switch`, `@case`, `@for`, and `@if` expressions into Acorn ASTs |
| 5 | `should throw DriftParserError when an invalid JS syntax expression is encountered in an interpolation` | Asserts error on invalid JS syntax like `{ 1 + * 2 }` |
| 6 | `preserves all sibling elements in @default case of @switch` | Verifies all sibling child nodes inside `@default` blocks are retained |

### 1.4 Generator Test Suite (`tests/generator.test.ts` — 20 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `generates fragment and return for empty templates` | Emits `[Opcode.CREATE_FRAGMENT, 0, Opcode.RETURN, 0]` for empty input |
| 2 | `generates direct root element for single top-level element` | Emits `[Opcode.CREATE_ELEMENT, 0, tagIdx]` for single root elements |
| 3 | `generates fragment container for multiple top-level nodes` | Emits `CREATE_FRAGMENT` container for sibling root elements |
| 4 | `generates static, dynamic, and boolean attributes` | Emits `Opcode.SET_ATTR` instructions for static and dynamic attributes |
| 5 | `generates interpolated text and comments` | Emits `Opcode.CREATE_COMMENT` and `Opcode.INTERPOLATE_TEXT` instructions |
| 6 | `generates REACTIVE_IF opcode for @if, @else if, and @else control flows` | Emits `Opcode.REACTIVE_IF` with sub-module constants and dependency arrays |
| 7 | `generates REACTIVE_FOR opcode for @for loop directives` | Emits `Opcode.REACTIVE_FOR` with body sub-module, item names, and dependency arrays |
| 8 | `generates bytecode for @switch, @case, and @default directives` | Emits `Opcode.REACTIVE_IF` chains transformed from `@switch` blocks |
| 9 | `works end-to-end via compile() function` | Validates end-to-end template compilation into bytecode module |
| 10 | `extracts imports metadata from script block` | Extracts named, default, and renamed imports into `CompiledModule.imports` |
| 11 | `extracts namespace and side-effect imports metadata from script block` | Extracts `import * as X` and `import './style.css'` import metadata |
| 12 | `generates propsSpec for component elements with static and dynamic attributes` | Emits `propsSpec` constant object and links index in `CREATE_ELEMENT` |
| 13 | `extracts destructured prop variables from script block` | Identifies `const { title, count } = props` as declared variables |
| 14 | `packages consequent and alternate branches as separate sub-modules` | Compiles `@if` branches into isolated nested `CompiledModule` constants |
| 15 | `generates nested REACTIVE_IF inside consequent sub-module for nested @if` | Compiles nested conditional blocks into recursive sub-modules |
| 16 | `correctly handles ArrayPattern in VariableDeclaration inside script block` | Transpiles `const [a, b] = arr` in `astToJS` without compiler errors |
| 17 | `correctly handles destructured object and rest parameters in functions and arrow functions` | Transpiles `function foo({ a, b }, ...rest)` in `astToJS` |
| 18 | `correctly emits async modifier and await expressions in functions and arrow functions` | Transpiles `async function fetchData()` and `await fetch(...)` in `astToJS` |
| 19 | `correctly generates code for try/catch/finally, throw, and switch/case statements` | Transpiles try/catch blocks and switch statements in component scripts |
| 20 | `correctly generates code for class declarations with methods and properties` | Transpiles class definitions inside component `<script>` blocks |

---

## 📦 2. Package: `driftjs-shared` (`packages/utils`)

Total Test Suites: **1** | Total Test Cases: **8**

### 2.1 Shared Scope, Context, & Evaluator Suite (`tests/utils.test.ts` — 8 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `exports MAX_REGISTERS constant equal to 256` | Verifies register boundary constant export |
| 2 | `evaluates precompiled functions and closures` | Verifies precompiled function string evaluation against scope (`evaluateExpression`) |
| 3 | `sets scope value up the prototype chain and triggers dirty mark` | Verifies prototypical scope chain variable assignment (`setScopeValue`) |
| 4 | `resolves iterables cleanly (arrays, Sets, null)` | Verifies safe iterable resolution (`resolveIterable`) |
| 5 | `executes precompiled script thunks and updates scope` | Verifies script thunk execution and state mutation |
| 6 | `safely checks properties in scope chain without prototype pollution` | Verifies `inScopeChain` stops before `Object.prototype` to prevent scope pollution |
| 7 | `unwraps component module exports properly` | Verifies `resolveComponentModule` unwraps ESM default and named module exports |
| 8 | `evaluates props specification objects against scope` | Verifies `evaluatePropsSpec` evaluates dynamic prop getters into static props |

---

## 📦 3. Package: `driftjs-dom` (`packages/dom`)

Total Test Suites: **8** | Total Test Cases: **69**

### 3.1 Main Client VM Test Suite (`tests/client.test.ts` — 33 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `renders simple static HTML elements` | Executes `CREATE_ELEMENT`, `CREATE_TEXT`, `APPEND_CHILD`, `RETURN` to produce DOM Heading |
| 2 | `renders attributes dynamically and statically` | Verifies static attribute setting and dynamic evaluation |
| 3 | `renders REACTIVE_IF: true branch shown, false branch hidden` | Verifies conditional mounting of consequent vs alternate sub-modules |
| 4 | `REACTIVE_IF re-renders on state change (triggerUpdates)` | Verifies dynamic DOM replacement when condition state changes |
| 5 | `correctly updates @if / @else if / @else chain when resetting count to 0` | Verifies multi-branch ladder re-rendering across transitions |
| 6 | `renders REACTIVE_FOR: list items rendered between anchors` | Verifies dynamic list rendering of items between comment anchors |
| 7 | `REACTIVE_FOR re-renders on list change (triggerUpdates)` | Verifies list re-rendering when array items are modified |
| 8 | `mounts a component directly to an HTMLElement container` | Verifies `mount(module, container)` API |
| 9 | `updates reactive nodes in-place via updateAt(pc, module, scope)` | Verifies targeted in-place text patching by jumping directly to instruction PC |
| 10 | `EXEC_SCRIPT initialises scope from VariableDeclaration and FunctionDeclaration AST` | Verifies `<script>` scope initialisation and function invocation writebacks |
| 11 | `renders nested @for loops correctly` | Verifies nested `@for` loops rendering sub-lists inside outer loops |
| 12 | `uses a single delegated event listener on document for thousands of items` | Verifies central event delegation for event listeners (`onclick={...}`) |
| 13 | `handles event bubbling when clicking nested children inside an event-bound element` | Verifies event target traversal up the DOM tree to find bound handler |
| 14 | `updates list history on click event in template component` | Verifies component state reactivity on user click event |
| 15 | `updates modified list item in-place without touching unchanged DOM nodes` | Verifies row content update in keyed list when item reference changes |
| 16 | `re-renders @switch directive reactively when discriminant state variable changes` | Verifies reactive `@switch` re-evaluation on state changes |
| 17 | `renders @for nested inside @if and switches cleanly when outer condition toggles` | Verifies nested `@for` inside `@if` cleanup and restoration |
| 18 | `handles @if nested inside @for loop and re-evaluates conditionals per row on item/condition updates` | Verifies row-level conditional evaluation in lists |
| 19 | `handles 4-level ultra-nested control flow (@if -> @for -> @if -> @switch) and maintains reactivity` | Verifies deep mixed control flow tree reactivity |
| 20 | `handles 3-level deep self-nested @if inside @if inside @if` | Verifies deeply nested conditional branches |
| 21 | `handles self-nested @for inside @for (2D matrix grid)` | Verifies nested 2D matrix rendering and updates |
| 22 | `handles self-nested @switch inside @switch and re-evaluates both discriminants reactively` | Verifies nested `@switch` evaluation |
| 23 | `renders nested components correctly when tag matches scope (raw or ESM default)` | Verifies custom component mounting in client VM |
| 24 | `passes static and dynamic props into nested child component` | Verifies props propagation across VM boundaries |
| 25 | `reactively updates child component props when parent state changes` | Verifies child component reactivity when parent props update |
| 26 | `supports direct props.key expressions in child templates` | Verifies `props.title` bindings in child templates |
| 27 | `triggers reactive updates when state is mutated from event handlers inside @for loop items` | Verifies state changes initiated inside list event listeners |
| 28 | `triggers reactivity across parent and child VM scopes when parent state is mutated via setScopeValue` | Verifies scope chain change propagation |
| 29 | `triggers reactive updates when mutating nested object properties and array elements` | Verifies deep property assignment change detection |
| 30 | `triggers reactive updates when calling array mutators on nested object properties` | Verifies array mutator methods (`push`, `splice`) on nested objects |
| 31 | `triggers reactive updates on destructuring assignments` | Verifies destructuring assignment reactivity |
| 32 | `cleans up reactive regions and document event listeners on unmount()` | Verifies resource cleanup and unregistration |
| 33 | `unregisters child regions recursively when nested @if / @for blocks toggle off` | Verifies garbage collection of dormant reactive regions |

### 3.2 Keyed Reconciler & Loops Suite (`tests/for.test.ts` — 6 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `renders initial list and reactively adds items on button click` | Verifies item addition and DOM element creation on user click |
| 2 | `reactively removes items and cleans up DOM nodes` | Verifies item deletion and DOM cleanup in keyed lists |
| 3 | `preserves DOM node identity across keyed row swaps (LIS reconciler)` | Verifies physical node swapping with zero DOM recreation |
| 4 | `supports unkeyed loops with strict index fallback` | Verifies in-place patch by index when explicit key is omitted |
| 5 | `binds item and index variables in @for loop header` | Verifies `@for (item, index) in items` bindings |
| 6 | `handles transitions between populated list and empty list` | Verifies clearing and repopulating loops dynamically |

### 3.3 Conditional Switch Directives Suite (`tests/switch.test.ts` — 3 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `renders matching @case branch on initial render` | Verifies `@switch` initial discriminant branch matching |
| 2 | `reactively transitions between different @case branches and @default on button clicks` | Verifies branch switching across multiple cases and `@default` |
| 3 | `renders and preserves multiple sibling elements in @case and @default blocks` | Verifies multi-element branches in transformed `@switch` |

### 3.4 Edge Cases & VM Execution Suite (`tests/edge-cases.test.ts` — 10 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `handles NewExpression and ForStatement in VM script execution` | Verifies VM script execution with `new Array(...)` and `for` loops |
| 2 | `handles default parameter assignment and function scope writebacks` | Verifies default parameter handling and scope writebacks |
| 3 | `preserves TR node identity during row swap in REACTIVE_FOR list` | Verifies LIS reconciler physically swaps existing DOM nodes |
| 4 | `fast-patches attributes in-place without rebuilding DOM when item data is unchanged` | Verifies `patchItemAttributes` updates classes/attrs without DOM replacement |
| 5 | `correctly advances PC over CREATE_ELEMENT with props spec in patchItemAttributes without desynchronization` | Verifies instruction byte-width skipping in fast-path scanner |
| 6 | `correctly unpacks array pattern destructuring in script block` | Verifies array destructuring assignments in component scripts |
| 7 | `correctly executes functions with destructured params and rest arguments at runtime` | Verifies function parameter destructuring execution at runtime |
| 8 | `correctly executes try/catch/finally, throw, switch/case, and class declarations in script blocks` | Verifies error handling and class execution in client scripts |
| 9 | `renders all sibling elements in @default case of @switch when @default is the only case` | Verifies multi-node default case rendering in transformed `@switch` |
| 10 | `handles keyed reconciliation when items produce 0 DOM nodes without TypeError` | Verifies empty-item reconciliation edge case handling via `findNextNode()` |

### 3.5 Context API Client Suite (`tests/context.test.ts` — 5 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `injects default value when no ancestor provides context` | Verifies fallback resolution when context token is not provided |
| 2 | `provides and injects typed context token across Parent and Child components` | Verifies `provide()` and `inject()` across component hierarchy |
| 3 | `supports deep multi-level context inheritance (Grandparent -> Parent -> DeepChild)` | Verifies multi-level ancestor VM traversal |
| 4 | `allows intermediate child to override context for its own subtree` | Verifies subtree context shadowing |
| 5 | `supports functional provide / inject aliases and cleans up on unmount` | Verifies context registration cleanup on VM unmount |

### 3.6 Async Reactivity & Microtask Batching Suite (`tests/async.test.ts` — 5 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `updates DOM reactively when state changes inside an async function (async/await)` | Verifies DOM updates across async microtask boundaries |
| 2 | `updates DOM reactively when state changes inside setTimeout` | Verifies DOM updates across macrotask event loops |
| 3 | `coalesces multiple sync/async state assignments into a single microtask update pass` | Verifies batching multiple mutations into a single DOM render pass |
| 4 | `triggers reactivity on array mutating calls (e.g. push)` | Verifies array method change-detection wrapping |
| 5 | `handles async functions and await inside compiled .drift SFC scripts` | Verifies end-to-end async SFC script compilation and execution |

### 3.7 Conditional If Directives Suite (`tests/if.test.ts` — 5 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `shows "Zero" on initial render (count === 0)` | Verifies initial `@if / @else if / @else` branch evaluation |
| 2 | `shows "Positive" after clicking Increment once (count === 1)` | Verifies branch transition from zero to positive on user click |
| 3 | `shows "Negative" after clicking Decrement once from 0 (count === -1)` | Verifies branch transition to negative on user click |
| 4 | `transitions correctly through all three states: Zero → Negative → Zero → Positive → Zero` | Verifies cyclic branch transitions across multi-step mutations |
| 5 | `shows "Negative" after multiple decrements from positive (count: 2 → 1 → 0 → -1)` | Verifies ladder evaluation across multi-step continuous state changes |

### 3.8 SSR Hydration Suite (`tests/hydration.test.ts` — 2 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `hydrates pre-rendered SSR HTML without destroying existing DOM nodes and binds event listeners` | Verifies `hydrate()` claims pre-rendered HTML nodes in-place with 0 node recreations and attaches reactive event listeners |
| 2 | `hydrates conditional @if and loop @for blocks without creating duplicate DOM nodes` | Verifies comment anchor claiming and reactive region registration during hydration |

### 3.9 Selective Hydration Suite (`tests/selective.test.ts` — 10 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `hydrates eagerly by default with controller ready promise` | Verifies `hydrateSelectively()` default eager execution and `ready` promise |
| 2 | `hydrates with custom trigger function and handles cancel / unmount` | Verifies custom trigger callback, cleanup on unmount |
| 3 | `defers hydration until requestIdleCallback executes` | Verifies idle-period hydration scheduling via `hydrateOnIdle()` |
| 4 | `falls back to setTimeout when requestIdleCallback is unavailable` | Verifies robust fallback for idle hydration |
| 5 | `supports hydrateNow() forcing immediate hydration and cancel()` | Verifies manual trigger and idempotence on idle controller |
| 6 | `defers hydration until container intersects viewport` | Verifies viewport intersection hydration via `hydrateWhenVisible()` and `IntersectionObserver` |
| 7 | `defers hydration until user interaction and replays the event` | Verifies capture-phase interaction hydration via `hydrateOnInteraction()` |
| 8 | `hydrates when media query matches` | Verifies media query hydration via `hydrateOnMedia()` |
| 9 | `discovers and selective-hydrates multiple islands across container` | Verifies multi-island hydration via `hydrateIslands()` with data attributes |
| 10 | `hydrates parent and nested child component with zero duplicate DOM nodes` | Verifies shared `HydrationCursor` across nested component hierarchy |

---

## 📦 4. Package: `driftjs-ssr` (`packages/ssr`)

Total Test Suites: **2** | Total Test Cases: **13**

### 4.1 Server-Side Rendering Test Suite (`tests/ssr.test.ts` — 8 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `renders static elements with escape protection to HTML string` | Verifies DOM-less rendering and XSS string escaping |
| 2 | `renders attributes, boolean flags, and dynamic values` | Verifies attribute formatting and dynamic AST evaluation on server |
| 3 | `renders REACTIVE_IF conditionals on server (true branch & false branch)` | Verifies server-side rendering of conditional `@if` blocks with comment anchors |
| 4 | `renders REACTIVE_FOR loops with item and index scope bindings` | Verifies server-side rendering of `@for` loops with item/index bindings |
| 5 | `EXEC_SCRIPT initialises server scope before rendering HTML` | Verifies server-side `<script>` execution prior to HTML string generation |
| 6 | `renders end-to-end compiled .drift templates on the server` | Verifies `renderToString` with full compiled Single File Components |
| 7 | `evaluates precompiled expressions in CREATE_TEXT correctly during SSR` | Verifies precompiled function thunk evaluation in `CREATE_TEXT` on server |
| 8 | `correctly serializes full set of HTML5 void elements without closing tags` | Verifies standard HTML5 void elements (`<img ...>`, `<input ...>`, `<br>`, etc.) serialize without closing tags |

### 4.2 SSR Context Propagation Suite (`tests/context.test.ts` — 5 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `renders context provided by parent in nested child SSR output` | Verifies `provideContext` and `injectContext` in server-side VM tree |
| 2 | `falls back to default value when no ancestor provides context on server` | Verifies default token value fallback in SSR |
| 3 | `supports deep 3-level context propagation without prop-drilling in SSR` | Verifies multi-level context inheritance during SSR |
| 4 | `resolves context inside child components rendered within @if blocks during SSR` | Verifies `subVm.parentVM` assignment in `REACTIVE_IF` during SSR |
| 5 | `resolves context inside child components rendered within @for loops during SSR` | Verifies `subVm.parentVM` assignment in `REACTIVE_FOR` during SSR |

---

## 📦 5. Package: `driftjs-vite-plugin` (`packages/vite-plugin`)

Total Test Suites: **1** | Total Test Cases: **15**

### 5.1 Plugin Test Suite (`tests/plugin.test.ts` — 15 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `ignores non-.drift files` | Verifies plugin transform hook returns `null` for `.ts` / `.js` files |
| 2 | `transforms .drift files` | Verifies plugin transform hook processes `.drift` Single File Components |
| 3 | `exports default compiledModule` | Verifies emitted ESM module contains `export default compiledModule;` |
| 4 | `includes the source file path in a comment` | Verifies file path attribution comment in generated ESM JS output |
| 5 | `compiledModule has bytecode and constants arrays` | Verifies compiled module output structure contains `bytecode` and `constants` |
| 6 | `compiles a static element without throwing` | Verifies static HTML section compilation through Vite transform hook |
| 7 | `compiles @if / @else directives` | Verifies `@if / @else` template compilation through Vite transform hook |
| 8 | `compiles @for loops` | Verifies `@for` template compilation through Vite transform hook |
| 9 | `compiles interpolations` | Verifies text interpolation compilation through Vite transform hook |
| 10 | `surfaces DriftJS compilation errors as Vite build errors` | Asserts compilation syntax errors throw Vite build errors (`this.error()`) |
| 11 | `correctly handles namespace imports and side-effect imports` | Verifies `import * as X` and `import './style.css'` code emission |
| 12 | `calls console.log when debug: true` | Verifies debug logging when `debug: true` plugin option is set |
| 13 | `does not call console.log when debug: false (default)` | Verifies quiet build mode by default when `debug: false` |
| 14 | `triggers a full-reload for .drift files` | Verifies HMR hook invalidates module graph and sends `full-reload` WS event for `.drift` files |
| 15 | `ignores non-.drift files in HMR` | Verifies HMR hook ignores non-`.drift` file changes |

---

## 📦 6. Package: `create-drift` (`packages/cli`)

Total Test Suites: **1** | Total Test Cases: **10**

### 6.1 CLI Scaffolding Suite (`tests/cli.test.ts` — 10 tests)

| # | Test Suite Description | Test Target & Behavior |
| :-: | :--- | :--- |
| 1 | `should scaffold project files correctly from template directory` | Verifies copying starter template directory recursively |
| 2 | `should update target package.json with custom project name` | Verifies `package.json` name field substitution |
| 3 | `should sanitize workspace:* dependency specifiers for standard package managers` | Replaces `workspace:*` with published semver versions in target `package.json` |
| 4 | `should remove driftjs-ssr dependency, server.js, and scripts.serve when CSR mode is selected` | Verifies CSR mode strips server files and SSR dependencies |
| 5 | `should remove driftjs-dom dependency when SSR mode is selected` | Verifies pure SSR mode strips client DOM dependency |
| 6 | `should skip node_modules and dist directories during copy` | Verifies temporary build folders are excluded from template scaffolding |
| 7 | `should throw error if template directory does not exist` | Asserts error when source template directory path is invalid |
| 8 | `should detect package manager correctly from user agent` | Detects `pnpm`, `npm`, `yarn`, and `bun` from `npm_config_user_agent` |
| 9 | `should clear existing directory when overwriteMode is empty` | Empties non-empty target directory when `overwriteMode: 'empty'` |
| 10 | `should preserve existing files when overwriteMode is ignore` | Preserves preexisting files in directory when `overwriteMode: 'ignore'` |

---
