# Agent Guide

## Project Overview

DriftJS is a **register VM-based reactivity engine and AOT compiler** for high-performance browser UI and server-side rendering. It replaces traditional VDOM diffing and proxy-based reactivity with a lightweight, register-based bytecode stream executed by a virtual machine interpreter. Single File Components are authored in `.drift` files combining `<script>` logic and template markup (with `@if`, `@for`, `@switch` directives), compiled at build time into binary-like bytecode and constant pool entries.

**Status:** Active development — modular monorepo.

**License:** MIT (Copyright 2026 Hrutav Modha)

---

## Repository Layout

```
driftjs/
├── packages/
│   ├── compiler/          # driftjs-compiler — Lexer, parser, transformer, generator
│   │   ├── index.ts       # Package entry: re-exports src/ and types/
│   │   ├── src/
│   │   │   ├── index.ts   # Barrel: re-exports lexer, parser, transformer, generator, compile()
│   │   │   ├── lexer.ts   # DriftLexer class
│   │   │   ├── parser.ts  # DriftParser class
│   │   │   ├── transformer.ts # DriftTransformer class (AST enrichment, @switch transformation)
│   │   │   └── generator.ts   # DriftGenerator class, astToJS() code emitter
│   │   ├── types/
│   │   │   ├── index.ts   # Barrel: re-exports all type modules
│   │   │   ├── ast.ts     # ASTNode, ElementNode, TextNode, InterpolationNode, IfNode, ForNode, SwitchNode
│   │   │   ├── token.ts   # TokenType, Token, SourceRange, SourceLocation
│   │   │   ├── opcodes.ts # Opcode enum, CompiledModule, ReactiveBinding, ImportSpec
│   │   │   ├── lexer-state.ts # DriftLexerState, LexerStateKind
│   │   │   └── error.ts   # DriftLexerError, DriftParserError
│   │   ├── tests/
│   │   │   ├── lexer.test.ts
│   │   │   ├── parser.test.ts
│   │   │   ├── transformer.test.ts
│   │   │   └── generator.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── dom/               # driftjs-dom — Browser Client Register VM & Reconciler
│   │   ├── index.ts       # Package entry: DriftClientVM, mount(), hydrate(), Context API
│   │   ├── src/
│   │   │   ├── index.ts   # DriftClientVM class, execution loop, reactive regions, event delegation
│   │   │   ├── reconciler.ts # Keyed list LIS reconciler (reconcileKeyedList)
│   │   │   └── hydration.ts  # TreeWalker-based HydrationCursor
│   │   ├── types/
│   │   │   └── index.ts   # VMExecutionOptions, ReactiveRegion, LoopFrame, ItemRecord
│   │   ├── tests/
│   │   │   ├── client.test.ts
│   │   │   ├── derived.test.ts
│   │   │   ├── edge-cases.test.ts
│   │   │   ├── context.test.ts
│   │   │   ├── async.test.ts
│   │   │   ├── if.test.ts
│   │   │   ├── for.test.ts
│   │   │   ├── switch.test.ts
│   │   │   └── hydration.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ssr/               # driftjs-ssr — Headless Server VM & HTML Serializer
│   │   ├── index.ts       # Package entry: DriftServerVM, renderToString(), serializeNode()
│   │   ├── src/
│   │   │   └── index.ts   # DriftServerVM execution, virtual node tree builder, HTML serializer
│   │   ├── types/
│   │   │   └── index.ts   # SSRExecutionOptions, ServerNode, ServerElementNode, ServerTextNode
│   │   ├── tests/
│   │   │   ├── ssr.test.ts
│   │   │   └── context.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── utils/             # driftjs-shared — Shared Scope, Context, & Evaluators
│   │   ├── index.ts       # Package entry: scope helpers, evaluator, context, constants
│   │   ├── src/
│   │   │   ├── index.ts   # Barrel export
│   │   │   ├── constants.ts   # MAX_REGISTERS (256)
│   │   │   ├── scope.ts       # setScopeValue(), inScopeChain()
│   │   │   ├── evaluator.ts   # evaluateExpression(), evaluatePropsSpec(), resolveIterable()
│   │   │   └── context.ts     # createContext(), provideContext(), injectContext(), pushActiveVM()
│   │   ├── types/
│   │   │   └── index.ts   # BaseVMExecutionOptions, Context<T>
│   │   ├── tests/
│   │   │   └── utils.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── router/            # driftjs-router — Client-Side SPA Router
│   │   ├── index.ts       # Package entry: re-exports src/ and types/
│   │   ├── src/           # Implementation logic: router, matcher, history, components
│   │   │   ├── index.ts   # Barrel: re-exports router, matcher, history, components
│   │   │   ├── router.ts  # createRouter(), RouterContext, navigation engine
│   │   │   ├── matcher.ts # Route pattern matching, parameter and query extraction
│   │   │   ├── history.ts # BrowserHistory, HashHistory, MemoryHistory drivers
│   │   │   └── components.ts # RouterView and Link native component helpers
│   │   ├── types/         # Type definitions: RouteRecord, MatchedRoute, Router, RouterOptions
│   │   │   └── index.ts   # Barrel: re-exports all router types
│   │   ├── tests/         # Unit and integration test suites
│   │   │   ├── matcher.test.ts
│   │   │   ├── history.test.ts
│   │   │   ├── router.test.ts
│   │   │   └── components.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── vite-plugin/       # driftjs-vite-plugin — Build-time SFC Compiler
│   │   ├── index.ts       # Package entry: driftPlugin()
│   │   ├── src/
│   │   │   └── index.ts   # driftPlugin Vite transform hook & ESM generator
│   │   ├── types/
│   │   │   └── index.ts   # DriftPluginOptions, DriftModule
│   │   ├── tests/
│   │   │   └── plugin.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/               # create-drift — Project Scaffolding CLI
│   │   ├── index.ts       # Package entry: scaffoldProject, detectPackageManager, etc.
│   │   ├── src/
│   │   │   └── index.ts   # Scaffolding core logic, template copying, dep sanitization
│   │   ├── bin/
│   │   │   └── create-drift.js # Interactive CLI entry point (@clack/prompts)
│   │   ├── template/      # Project starter template
│   │   ├── types/
│   │   │   └── index.ts   # ScaffoldOptions, RenderMode, OverwriteMode
│   │   ├── tests/
│   │   │   └── cli.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── vscode-plugin/     # drift-vscode — VSCode Extension & Language Server
│       ├── src/
│       │   ├── extension.ts # VSCode extension activation & LSP client
│       │   └── server.ts    # Language server (diagnostics, completions, hover info)
│       ├── syntaxes/
│       │   └── drift.tmLanguage.json # TextMate grammar for .drift syntax highlighting
│       ├── snippets.json    # HTML & Drift directive snippets
│       ├── language-configuration.json
│       ├── package.json
│       └── tsconfig.json
│
├── template/              # Root starter template for CSR & SSR apps
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── server.js          # SSR Express/Node entry
│   └── src/
│       ├── App.drift      # Main counter/reactive SFC
│       ├── main.ts        # Client mount entry
│       ├── style.css
│       └── drift.d.ts
│
├── playground/            # Local interactive playground for manual testing
├── docs/
│   ├── ISA.md             # Virtual Machine Instruction Set Architecture reference
│   ├── BUGS.md            # Bug audit report & known defect tracking
│   ├── TESTS.md           # Full test suite matrix
│   ├── RESULTS.md         # Benchmark & performance test results
│   └── TODO.md            # Feature implementation roadmap ($derived, $effect, @bind, slots)
│
├── scripts/               # Workspace helper scripts (versioning, template sync)
├── package.json           # Root monorepo config (pnpm workspaces)
├── pnpm-workspace.yaml    # Workspace package configuration
├── tsconfig.json          # Root strict TypeScript config
├── vitest.config.ts       # Root Vitest test runner config
└── README.md
```

---

## Monorepo Tooling

| Tool                     | Version      | Purpose                                                             |
| :----------------------- | :----------- | :------------------------------------------------------------------ |
| **pnpm**           | `>=10.0.0` | Package manager and workspace orchestrator                          |
| **TypeScript**     | `^7.0.2`   | Type-checking and compilation (`tsc`)                             |
| **Vitest**         | `^4.1.10`  | Unit and integration test runner                                    |
| **jsdom**          | `^29.1.1`  | DOM environment for headless VM browser testing                     |
| **acorn**          | `^8.17.0`  | JavaScript parser used by compiler & transformer for AST inspection |
| **Vite**           | `^8.1.5`   | Bundler & dev server (peer dependency of`driftjs-vite-plugin`)    |
| **@clack/prompts** | `^0.9.1`   | Interactive CLI UI for`create-drift`                              |

### Key Commands

```bash
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages (runs `vite build` in each package)
pnpm test             # Run full Vitest test suite (160+ unit & integration tests)
pnpm typecheck        # Type-check workspace across all packages (tsc --noEmit)
```

**Build Topological Order:**
`driftjs-shared` -> `driftjs-compiler` -> `driftjs-dom` & `driftjs-ssr` -> `driftjs-vite-plugin` -> `create-drift` -> `drift-vscode`.

---

## Architecture Deep Dive

### Compilation Pipeline

```
.drift SFC Source String
        │
        ▼
   ┌─────────┐
   │  Lexer   │  DriftLexer.nextToken()
   └────┬────┘  Token stream with HTML tags, text, interpolations, and directives (@if, @for, @switch)
        │
        ▼
   ┌─────────┐
   │  Parser  │  DriftParser.parse()
   └────┬────┘  Produces structured template AST (ProgramNode)
        │
        ▼
   ┌────────────┐
   │ Transformer│  DriftTransformer.transform()
   └────┬───────┘  Parses JS expressions with Acorn, strips whitespace text, transforms @switch to @if
        │
        ▼
   ┌───────────┐
   │ Generator  │  DriftGenerator.generate()
   └────┬──────┘  Emits bytecode, constant pool, reactive bindings, and declared variables
        │
        ▼
  CompiledModule {
    bytecode: Uint32Array | number[],
    constants: any[],
    reactiveBindings: ReactiveBinding[],
    declaredVars: string[],
    imports: ImportSpec[],
    scope: Record<string, any>
  }
```

#### 1. Lexer (`packages/compiler/src/lexer.ts`)

On-demand stateful scanner emitting tokens (`TokenType: TagOpen, TagClose, Identifier, Equals, StringLiteral, Interpolation, DirectiveIf, DirectiveFor, DirectiveSwitch, DirectiveCase, DirectiveDefault, Text, Comment, EOF`).

- Preserves raw text inside `<script>` and `<style>` blocks.
- Tracks nested braces in interpolations `{ ... }` including template literals and nested quotes.
- Recognizes `@if`, `@else if`, `@else`, `@for`, `@switch`, `@case`, and `@default` directive headers.

#### 2. Parser (`packages/compiler/src/parser.ts`)

Converts tokens into a hierarchy of `ASTNode` objects:

- `ElementNode`: Tag names, attribute list, event mappings, child nodes, self-closing status.
- `TextNode`: Static text segments.
- `InterpolationNode`: Dynamic expressions `{ expr }`.
- `IfNode`, `ForNode`, `SwitchNode`: Structured control flow blocks.
- `CommentNode`: Standard HTML comments.

#### 3. Transformer (`packages/compiler/src/transformer.ts`)

Enriches the raw AST prior to bytecode emission:

- Parses expression strings in interpolations and directive tests into Acorn AST nodes.
- Parses `<script>` content into Acorn statement ASTs.
- Transforms `@switch` / `@case` / `@default` trees into equivalent `@if` / `@else if` / `@else` chains.
- Strips redundant formatting whitespace between element boundaries.

#### 4. Generator (`packages/compiler/src/generator.ts`)

Converts enriched AST into a `CompiledModule`:

- **Main module vs Sub-modules:** `@if` consequent/alternate branches and `@for` loop bodies are recursively compiled into isolated sub-modules placed in the constant pool.
- **AST to JavaScript CodeGen (`astToJS`):** Transforms Acorn AST nodes into CSP-safe executable function strings stored in the constant pool under `{ __drift_fn__: ... }`.
- **Reactive Dependency Tracking:** Inspects identifiers in expressions against `declaredVars` and records `ReactiveBinding` entries mapping variable names to bytecode PC positions.

---

## Instruction Set Architecture (ISA)

DriftJS VM instructions are variable-length byte streams operating on 256 internal registers (`r0..r255`) and a constant pool (`constants[i]`).

| Opcode |   Hex   | Mnemonic             | Operands                                                                           | Category        | Summary                                                                          |
| :----: | :------: | :------------------- | :--------------------------------------------------------------------------------- | :-------------- | :------------------------------------------------------------------------------- |
|   0   | `0x00` | `RETURN`           | `reg`                                                                            | Control Flow    | Halts execution and returns DOM node/fragment from `reg`                        |
|   1   | `0x01` | `CREATE_ELEMENT`   | `dstReg, tagIdx, [propsSpecIdx]`                                                 | DOM Creation    | Creates DOM Element / mounts component sub-module into `dstReg`                 |
|   2   | `0x02` | `CREATE_TEXT`      | `dstReg, textIdx`                                                                | DOM Creation    | Creates static or evaluated DOM TextNode into `dstReg`                          |
|   3   | `0x03` | `CREATE_COMMENT`   | `dstReg, commentIdx`                                                             | DOM Creation    | Creates DOM Comment node into `dstReg`                                          |
|   4   | `0x04` | `APPEND_CHILD`     | `parentReg, childReg`                                                            | DOM Mutation    | Appends node `childReg` to `parentReg`                                          |
|   5   | `0x05` | `SET_ATTR`         | `elemReg, nameIdx, valIdx, isDynamic`                                            | Attributes      | Sets attribute or binds event handler on `elemReg`                              |
|   6   | `0x06` | `CREATE_FRAGMENT`  | `dstReg`                                                                         | DOM Creation    | Creates a `DocumentFragment` into `dstReg`                                      |
|   7   | `0x07` | `INTERPOLATE_TEXT` | `dstReg, exprIdx`                                                                | Dynamic Binding | Evaluates expression and creates dynamic TextNode into `dstReg`                 |
|   12  | `0x0C` | `EXEC_SCRIPT`      | `scriptIdx`                                                                      | Scope Setup     | Executes `<script>` AST statements to initialize component scope                |
|   13  | `0x0D` | `REACTIVE_IF`      | `parentReg, condIdx, consIdx, altIdx, depsIdx`                                   | Reactive Region | Anchors `@if` block between comment delimiters (`<!--if-->` / `<!--/if-->`)     |
|   14  | `0x0E` | `REACTIVE_FOR`     | `parentReg, iterIdx, itemIdx, idxIdx, keyIdx, bodyIdx, depsIdx`                  | Reactive Region | Keyed `@for` loop with LIS reconciliation (`<!--for-->` / `<!--/for-->`)        |

---

## Runtime Architecture (`driftjs-dom` & `driftjs-ssr`)

### 1. Client VM (`DriftClientVM` — `packages/dom/src/index.ts`)

- **Registers:** 256-slot array storing DOM nodes, DocumentFragments, and primitive values during execution.
- **Scope & Prototype Chain:** Component state lives on a scoped JavaScript object. Child components and sub-modules inherit scope via `Object.create(parentScope)`.
- **Change Notification (`__drift_mark_dirty__`):** Scope mutations invoke `markDirty(varName)`, which batches changes and schedules microtask updates via `queueMicrotask()`.
- **Reactive In-Place Updates:**
  - `INTERPOLATE_TEXT`: Updates `textNode.nodeValue` directly without touching surrounding elements.
  - `SET_ATTR`: Patches attributes or properties on the element in-place.
- **Reactive Regions (`REACTIVE_IF` / `REACTIVE_FOR`):**
  - Subtrees are anchored between DOM comment boundaries.
  - Changes to variables listed in `deps` trigger isolated re-evaluation of that region only.
  - `@for` loops execute `reconcileKeyedList()` with Longest Increasing Subsequence (LIS) algorithm to minimize DOM moves.
  - `patchItemAttributes()` fast-patches unchanged row objects without DOM replacement.
- **Event Delegation:** Global delegated event listeners on the document root dispatch events to handlers stored in a `WeakMap<Node, Handlers>`.
- **SSR Hydration (`HydrationCursor`):** Uses browser `TreeWalker` to claim existing server-rendered HTML elements and comment anchors without DOM destruction.

### 2. Server VM (`DriftServerVM` — `packages/ssr/src/index.ts`)

- Executes compiled bytecode in Node.js / headless environments without DOM dependencies (`document` / `window`).
- Builds a virtual `ServerNode` tree (`element`, `text`, `comment`, `fragment`).
- `renderToString(component, options)` serializes the tree to valid, escaped HTML with matching `<!--if-->` and `<!--for-->` anchors for hydration.

### 3. Context API (`packages/utils/src/context.ts`)

- `createContext(defaultValue?, name?)`: Creates a strongly-typed Context token.
- `provide(context, value)`: Stores context on the currently active VM instance.
- `inject(context, fallback?)`: Walks up the `parentVM` hierarchy to find the nearest provided value.

---

## Testing Matrix & Conventions

- **Test Runner:** Vitest with jsdom environment simulation.
- **Run Tests:** `pnpm test` (or `pnpm build && pnpm test`).

| Test Suite                                      | Package                 | Focus Area                                                        |
| :---------------------------------------------- | :---------------------- | :---------------------------------------------------------------- |
| `packages/compiler/tests/lexer.test.ts`       | `driftjs-compiler`    | HTML tags, attributes, void elements, interpolations, directives  |
| `packages/compiler/tests/parser.test.ts`      | `driftjs-compiler`    | Element nesting, self-closing tags, directives, error locations   |
| `packages/compiler/tests/transformer.test.ts` | `driftjs-compiler`    | Acorn AST parsing, script extraction,`@switch` transformation   |
| `packages/compiler/tests/generator.test.ts`   | `driftjs-compiler`    | Bytecode generation, sub-module compilation, reactive bindings    |
| `packages/dom/tests/client.test.ts`           | `driftjs-dom`         | DOM creation, in-place reactive updates, `@if`, `@for`, events |
| `packages/dom/tests/if.test.ts`               | `driftjs-dom`         | Conditional `@if / @else if / @else` ladder reactivity and click events |
| `packages/dom/tests/for.test.ts`              | `driftjs-dom`         | Keyed/unkeyed `@for` list reconciliation, LIS reordering, additions/removals |
| `packages/dom/tests/switch.test.ts`           | `driftjs-dom`         | `@switch / @case / @default` branch transitions and multi-node cases |
| `packages/dom/tests/edge-cases.test.ts`       | `driftjs-dom`         | Fast-path attribute patching, row identity preservation           |
| `packages/dom/tests/context.test.ts`          | `driftjs-dom`         | Deep multi-level context inheritance and subtree overrides        |
| `packages/dom/tests/async.test.ts`            | `driftjs-dom`         | Async state mutations, intervals, promise resolution              |
| `packages/dom/tests/hydration.test.ts`        | `driftjs-dom`         | SSR hydration, cursor claiming, event attachment                  |
| `packages/ssr/tests/ssr.test.ts`              | `driftjs-ssr`         | Server rendering, HTML escaping, comment anchors                  |
| `packages/ssr/tests/context.test.ts`          | `driftjs-ssr`         | Server-side context propagation                                   |
| `packages/vite-plugin/tests/plugin.test.ts`   | `driftjs-vite-plugin` | `.drift` SFC to ESM module transformation                       |
| `packages/cli/tests/cli.test.ts`              | `create-drift`        | Scaffolding, dependency sanitization, CSR/SSR template selection  |
| `packages/utils/tests/utils.test.ts`          | `driftjs-shared`      | Scope traversal, evaluators, iterable resolvers                   |

---

## Coding & Contribution Guidelines

1. **Strict Package File & Directory Structure (MANDATORY):** Every package in `packages/*` MUST strictly and exclusively follow this architecture:
   - `index.ts` at package root: exports the public API by re-exporting from `./src/index.js` and `./types/index.js`.
   - `src/`: contains **ONLY** implementation logic files and a barrel `src/index.ts`. Never place type definitions directly in `src/`.
   - `types/`: contains **ONLY** TypeScript interfaces, type aliases, and enums, with a barrel `types/index.ts`.
   - `tests/`: contains **ONLY** Vitest test suites (`*.test.ts`).
   - *All agents and contributors must strictly and exclusively follow this layout without exception.*
2. **TypeScript Strict Mode:** All code must compile cleanly with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`.
3. **ESM Imports:** Always use explicit `.js` extensions in import paths across all TypeScript modules (`import { ... } from './lexer.js'`).
4. **No `with` Statements:** Transpiled JavaScript strings emitted by `astToJS` must never use `with (scope)`. Identifier lookups must explicitly query the scope chain.
5. **No Direct DOM Manipulation in Core VM Loop:** Keep DOM construction logic abstracted to ensure SSR / Client VM architectural symmetry.
6. **Report Bugs in `docs/BUGS.md`:** Any newly discovered defects, type errors, or spec mismatches should be documented with severity and reproduction in [`docs/BUGS.md`](file:///home/hrutav-modha/Documents/driftjs/docs/BUGS.md).
7. **Author Components as `.drift` SFC Files:** Whenever the context calls for creating, providing, or testing DriftJS components (for libraries, plugins, UI features, or templates), author them as declarative `.drift` Single File Components combining `<script>` logic and template markup, processed through the `driftjs-compiler` pipeline (`compile()` / `driftPlugin`). Do not hand-craft raw VM bytecode arrays or manually construct `CompiledModule` objects in TypeScript or JavaScript files.
8. **No Code Duplication (DRY & Single Source of Truth):** Never duplicate logic, algorithms, constants, or helper routines across packages or within the same module. Whenever a utility, constant, or algorithmic pattern is needed in multiple locations, abstract it into a shared module and reuse it. Always maintain a single source of truth across the monorepo instead of creating parallel, divergent, or copy-pasted implementations.
9. **No Redundant Re-implementations (Leverage Native Runtime & Ecosystem Capabilities):** Never author custom implementations for functionality, algorithms, data structures, or file/string operations that are already natively provided by modern JavaScript/TypeScript runtimes, standard platform APIs, or existing workspace packages. Always leverage established runtime built-ins and dependencies instead of reinventing them.


