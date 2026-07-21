# AGENTS.md — DriftJS Contributor & Agent Guide

## Project Overview

DriftJS is a **register VM-based reactivity engine and AOT compiler** for high-performance browser UI. It replaces traditional VDOM diffing and proxy-based reactivity with a linear 32-bit instruction stream executed by a fetch-decode-execute loop. Components are authored in `.drift` single-file components (SFCs) combining `<script>` logic and template markup, compiled at build time into `Uint32Array` bytecode via a Vite plugin.

**Status:** Early experimental — not production-ready.

**License:** MIT (Copyright 2026 Hrutav Modha)

---

## Repository Layout

```
driftjs/
├── packages/
│   ├── compiler/          # @driftjs/compiler — Lexer, parser, analyzer, bytecode generator
│   │   ├── index.ts       # Package entry: re-exports src/ and types/
│   │   ├── src/
│   │   │   ├── index.ts   # Barrel: re-exports lexer, parser, analyzer, generator
│   │   │   ├── lexer/
│   │   │   │   ├── index.ts
│   │   │   │   └── lexer.ts       # DriftJSLexer class + tokenize()
│   │   │   ├── parser/
│   │   │   │   ├── index.ts
│   │   │   │   └── parser.ts      # DriftJSParser class + parseTemplate()
│   │   │   ├── analyzer/
│   │   │   │   ├── index.ts
│   │   │   │   └── analyzer.ts    # DriftJSAnalyzer class + analyzeAST()
│   │   │   └── generator/
│   │   │       ├── index.ts
│   │   │       └── generator.ts   # DriftJSGenerator class + generate()
│   │   ├── types/
│   │   │   ├── index.ts   # Barrel: re-exports all type modules
│   │   │   ├── ast.ts     # ASTNode, ElementNode, TextNode, InterpolationNode, ScriptNode
│   │   │   ├── lexer.ts   # TokenType enum, Token interface
│   │   │   ├── program.ts # CompiledProgram interface
│   │   │   └── analyzer.ts # AnalyzedExpression, AnalysisResult, Replacement
│   │   ├── tests/
│   │   │   ├── lexer.test.ts      # 7 test cases
│   │   │   ├── parser.test.ts     # 10 test cases
│   │   │   ├── analyzer.test.ts   # 5 test cases
│   │   │   └── generator.test.ts  # 3 test cases
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── vm/                # @driftjs/vm — Register VM runtime engine
│   │   ├── index.ts       # Package entry: re-exports src/ and types/
│   │   ├── src/
│   │   │   ├── index.ts   # Barrel: re-exports isa, client, server
│   │   │   ├── isa.ts     # Opcodes object, encodeInstruction(), encodeJump(), encodeInstruction24()
│   │   │   ├── client/
│   │   │   │   └── index.ts  # DriftJSClientVM class + interpret() + mount()
│   │   │   └── server/
│   │   │       └── index.ts  # DriftJSServerVM class + renderToString() + renderToStaticMarkup()
│   │   ├── types/
│   │   │   └── index.ts   # Opcode type, VMProgram, DriftJSComponent, DriftComponent
│   │   ├── tests/
│   │   │   ├── vm.test.ts         # 13 test cases (client VM)
│   │   │   └── server.test.ts     # Server-side rendering tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── vite-plugin/       # @driftjs/vite-plugin — AOT build-time compiler
│       ├── index.ts       # Package entry: re-exports src/ and types/
│       ├── src/
│       │   └── index.ts   # driftPlugin() factory function
│       ├── types/
│       │   └── index.ts   # DriftPluginOptions interface
│       ├── tests/
│       │   └── plugin.test.ts     # 3 test cases
│       ├── package.json
│       └── tsconfig.json
│
├── template/              # Example Vite app using DriftJS
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
│       ├── App.drift      # Example reactive counter component
│       ├── main.js         # App mount entry point
│       ├── env.d.ts        # Module declarations for .drift files
│       └── style.css
│
├── docs/
│   ├── ISA.md             # 16-opcode instruction set specification
│   └── TESTS.md           # Full test matrix (41 cases across 6 suites)
│
├── package.json           # Root monorepo config (pnpm workspaces)
├── pnpm-workspace.yaml    # Workspace package globs
├── tsconfig.json          # Root TypeScript config (strict mode)
├── .gitignore
├── LICENSE
└── README.md
```

---

## Monorepo Tooling

| Tool | Version | Purpose |
| :--- | :--- | :--- |
| **pnpm** | `10.18.2` | Package manager and workspace orchestrator |
| **TypeScript** | `^7.0.2` | Type-checking and compilation (`tsc`) |
| **Vitest** | `^4.1.10` | Unit and integration test runner |
| **jsdom** | `^29.1.1` | DOM environment for headless VM tests |
| **acorn** | `^8.17.0` | JavaScript parser used by the analyzer for AST walking |
| **estree-walker** | `^3.0.3` | ESTree AST traversal used by the analyzer |
| **Vite** | `>=7.0.0` | Build tool (peer dependency of vite-plugin) |

### Key Commands

```bash
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages (runs `tsc` in each)
pnpm test             # Run full Vitest test suite (vitest run)
pnpm lint             # Type-check workspace (tsc --noEmit)
pnpm clean            # Remove all dist/ directories
```

**Build order matters.** `@driftjs/vm` must build first (it has no workspace deps), then `@driftjs/compiler` (depends on `@driftjs/vm`), then `@driftjs/vite-plugin` (depends on both). `pnpm -r build` handles this automatically via topological sort.

---

## Architecture Deep Dive

### Compilation Pipeline

```
.drift SFC source string
        │
        ▼
   ┌─────────┐
   │  Lexer   │  DriftJSLexer.tokenize()
   └────┬────┘  Source string → Token[]
        │
        ▼
   ┌─────────┐
   │  Parser  │  DriftJSParser.parse()
   └────┬────┘  Token[] → ASTNode[]
        │
        ▼
   ┌──────────┐
   │ Analyzer  │  DriftJSAnalyzer.analyze()
   └────┬─────┘  ASTNode[] → AnalysisResult (varToReg map, thunk codes)
        │
        ▼
   ┌───────────┐
   │ Generator  │  DriftJSGenerator.generate()
   └────┬──────┘  ASTNode[] + AnalysisResult → CompiledProgram
        │
        ▼
  CompiledProgram { bytecode: Uint32Array, constants: unknown[], updateBlockOffset: number }
```

#### 1. Lexer (`packages/compiler/src/lexer/lexer.ts`)

Scans the `.drift` source into a flat `Token[]` stream. Token types: `TagOpen`, `TagOpenEnd`, `SelfClosingEnd`, `TagClose`, `AttributeName`, `AttributeValue`, `Text`, `Interpolation`, `Script`, `EOF`.

- Handles nested brace tracking in interpolation expressions and expression attribute values.
- Detects and skips string literals (single, double, backtick) inside expressions to avoid false brace matches.
- Extracts `<script>` block content as raw `Script` tokens.
- Recognizes HTML void elements (`br`, `img`, `input`, etc.).
- **Error reporting:** Throws on unclosed script tags, unclosed interpolation expressions, missing tag names.

#### 2. Parser (`packages/compiler/src/parser/parser.ts`)

Converts the token stream into an `ASTNode[]` tree. Accepts either a raw source string (internally invokes the lexer) or a pre-built `Token[]`.

- Produces four node types: `ElementNode`, `TextNode`, `InterpolationNode`, `ScriptNode`.
- Strips whitespace-only text nodes (formatting artifacts).
- Parses `on*` attributes into a separate `events` record (e.g., `onclick={handler}` → `events: { click: "handler" }`).
- Handles void/self-closing elements without expecting closing tags.
- **Error reporting:** Throws on missing tag names, closing tag mismatches, unclosed interpolation.

#### 3. Analyzer (`packages/compiler/src/analyzer/analyzer.ts`)

Performs semantic analysis and reactive transformation over the AST using `acorn` + `estree-walker`.

**Key responsibilities:**
- **State variable discovery:** Scans top-level `VariableDeclaration`, `FunctionDeclaration`, and `ClassDeclaration` nodes in `<script>` blocks. Assigns each a register index starting from 1 (register 0 is reserved for the event object).
- **Expression rewriting:** Replaces state variable references with `regs[N]` register reads. Wraps mutations (`count++`, `count = x`) with `(vm?.markDirty(N), <original>)` calls to trigger reactivity.
- **Dependency mask calculation:** Computes a 32-bit bitmask for each expression, tracking which registers it depends on via `depMask |= (1 << (reg % 32))`.
- **Scope tracking:** Maintains a stack of `Set<string>` scopes. Arrow function parameters, `for` loop variables, `catch` clause bindings, and block-scoped `let`/`const` declarations are tracked as locals and excluded from reactive transformation.
- **Global allowlist:** Standard JS globals (`console`, `Math`, `setTimeout`, etc.) are recognized and left untransformed.
- **Error reporting:** Throws on references to undeclared state variables.

#### 4. Generator (`packages/compiler/src/generator/generator.ts`)

Compiles the analyzed AST into a `CompiledProgram`.

**Bytecode structure:** The generator produces three logical bytecode blocks:

1. **Mount block** (offset 0 → `updateBlockOffset - 1`): Initializes state via script thunks, creates DOM elements/text nodes, sets initial attributes, appends children, mounts root nodes, binds events. Ends with a `JUMP` to after the update block.
2. **Update block** (offset `updateBlockOffset`): For each reactive binding, executes `EXEC_THUNK` (guarded by `depMask`) then `SET_TEXT` or `SET_ATTRIBUTE`/`SET_PROPERTY`. Ends with `RETURN`.
3. **Event handler blocks** (after update block): Each event handler is a `EXEC_THUNK` + `RETURN` sequence. `BIND_EVENT` instructions in the mount block are back-patched with the handler's offset.

**Constants pool:** Stores tag names, attribute keys, static string values, and compiled thunk functions (`new Function('regs', 'vm', code)`). De-duplicated via a `Map<unknown, number>`.

### Instruction Set Architecture (ISA)

Instructions are fixed-width **32-bit words** encoded as:

```
[ Opcode (8-bit) | A (8-bit) | B (8-bit) | C (8-bit) ]
```

Some instructions use a 24-bit argument variant: `[ Opcode (8-bit) | arg24 (24-bit) ]`.

| Opcode | Hex | Mnemonic | Operands | Description |
| :---: | :---: | :--- | :--- | :--- |
| 1 | `0x01` | `LOAD_CONST` | `r_a`, `c_b` | `registers[a] = constants[b]` |
| 2 | `0x02` | `LOAD_NODE` | `r_a`, `n_b` | `registers[a] = nodes[b]` |
| 3 | `0x03` | `EXEC_THUNK` | `r_a`, `c_b`, `depMask_c` | Execute thunk, store result in register. Skip if `(dirtyMask & depMask) === 0` |
| 4 | `0x04` | `CREATE_ELEMENT` | `c_a`, `n_b` | `nodes[b] = document.createElement(constants[a])` |
| 5 | `0x05` | `CREATE_TEXT` | `c_a`, `n_b` | `nodes[b] = document.createTextNode(constants[a])` |
| 6 | `0x06` | `APPEND_CHILD` | `n_a`, `n_b` | `nodes[a].appendChild(nodes[b])` |
| 7 | `0x07` | `MOUNT` | `n_a` | `rootElement.appendChild(nodes[a])` |
| 8 | `0x08` | `SET_TEXT` | `n_a`, `r_b` | `nodes[a].textContent = registers[b]` |
| 9 | `0x09` | `SET_ATTRIBUTE` | `n_a`, `c_b`, `r_c` | `nodes[a].setAttribute(constants[b], registers[c])` |
| 10 | `0x0A` | `BIND_EVENT` | `n_a`, `c_b`, `offset_c` | Delegate event `constants[b]` for node `a`, handler at `offset_c` |
| 11 | `0x0B` | `JUMP` | `offset24` | `pc = offset24` (unconditional) |
| 12 | `0x0C` | `JUMP_IF_TRUE` | `r_a`, `offset_bc` | Conditional branch if `registers[a]` is truthy |
| 13 | `0x0D` | `RETURN` | — | Pop call stack or end execution |
| 14 | `0x0E` | `CALL` | `offset24` | Push `pc`, jump to `offset24` |
| 15 | `0x0F` | `REMOVE_CHILD` | `n_a`, `n_b` | `nodes[a].removeChild(nodes[b])` |
| 16 | `0x10` | `SET_PROPERTY` | `n_a`, `c_b`, `r_c` | `nodes[a][constants[b]] = registers[c]` |

### VM Runtime (`packages/vm/`)

#### Client VM (`src/client/index.ts`)

`DriftJSClientVM` is the browser-side interpreter. Key internals:

- **Registers:** `unknown[]` array — register 0 is reserved for the current event object. State variables occupy registers 1+.
- **Nodes:** `(Node | null)[]` — index 0 is the root mount element. DOM nodes created by `CREATE_ELEMENT`/`CREATE_TEXT` are stored here.
- **Constants:** `unknown[]` — tag strings, attribute keys, thunk functions. Shared between mount and update phases.
- **Program counter:** `this.pc` advances through the `Uint32Array` bytecode.
- **Call stack:** `number[]` — tracks return addresses for `CALL`/`RETURN` subroutine semantics.
- **Dirty mask:** A 32-bit integer bitmask. `markDirty(regIdx)` sets bit `(1 << (regIdx % 32))`. `EXEC_THUNK` with a non-zero `depMask` checks `(dirtyMask & depMask) === 0` to skip unchanged computations in O(1).
- **Microtask batching:** `scheduleUpdate()` uses `queueMicrotask()` to coalesce multiple synchronous state mutations into a single `patch()` call.
- **Event delegation:** Events are registered once on the root element per event type. `BIND_EVENT` maps `nodeIdx:eventName → handlerOffset`. The delegated listener walks up from `event.target` reading `data-drift-node` attributes to find the handler offset.
- **Lifecycle:** `boot()` runs the mount block. `patch()` runs the update block. `unmount()` removes event listeners, clears `innerHTML`, and resets all state.

**Exported functions:**
- `interpret(program, target)` — instantiate VM and boot.
- `mount(component, target)` — mount a `DriftComponent` (calls `component.render(target)` if available, else `interpret`).

#### Server VM (`src/server/index.ts`)

`DriftJSServerVM` is a headless interpreter for SSR. Instead of real DOM nodes, it builds a virtual tree of `VirtualElementNode` / `VirtualTextNode` objects. `renderToString()` executes the mount block and serializes the tree to HTML with proper escaping. Event bindings are no-ops. `markDirty` is a no-op.

**Exported functions:**
- `renderToString(input)` — SSR render to HTML string.
- `renderToStaticMarkup(input)` — alias for `renderToString`.

### Vite Plugin (`packages/vite-plugin/`)

`driftPlugin(options?)` returns a Vite `Plugin` object with `enforce: 'pre'` and a `transform` hook. When a file matches the configured extension (default `.drift`):

1. Parses the SFC source via `parseTemplate()`.
2. Compiles to bytecode via `generate()`.
3. Serializes the `Uint32Array` as a JavaScript array literal and thunk functions as their `.toString()` source.
4. Emits an ESM module exporting `{ program, render, default: component }`.

---

## Type System

### AST Node Types (`packages/compiler/types/ast.ts`)

```typescript
type ASTNode = ElementNode | TextNode | InterpolationNode | ScriptNode;

interface ScriptNode    { type: 'Script';        content: string; }
interface ElementNode   { type: 'Element';       tag: string; attributes: Record<string, string>; events: Record<string, string>; children: ASTNode[]; }
interface TextNode      { type: 'Text';          content: string; }
interface InterpolationNode { type: 'Interpolation'; expression: string; }
```

### Token Types (`packages/compiler/types/lexer.ts`)

```typescript
enum TokenType {
  TagOpen, TagOpenEnd, SelfClosingEnd, TagClose,
  AttributeName, AttributeValue,
  Text, Interpolation, Script, EOF
}

interface Token { type: TokenType; value: string; start: number; end: number; }
```

### Compiled Program (`packages/compiler/types/program.ts`)

```typescript
interface CompiledProgram {
  bytecode: Uint32Array;
  constants: unknown[];
  updateBlockOffset: number;
}
```

### VM Types (`packages/vm/types/index.ts`)

```typescript
type Opcode = typeof Opcodes[keyof typeof Opcodes]; // 1..16

interface VMProgram {
  bytecode: Uint32Array;
  constants: unknown[];
  updateBlockOffset?: number;
}

interface DriftJSComponent {
  program: VMProgram;
  ast?: unknown[];
  render?: (target: HTMLElement) => any;
}

type DriftComponent = DriftJSComponent;
```

### Analyzer Types (`packages/compiler/types/analyzer.ts`)

```typescript
interface AnalyzedExpression { rewritten: string; depMask: number; }
interface AnalyzedScript     { thunkCode: string; }
interface AnalysisResult     { varToReg: Map<string, number>; nextRegIdx: number; scriptThunkCodes: string[]; }
interface Replacement        { start: number; end: number; text: string; }
```

---

## TypeScript Configuration

The root `tsconfig.json` enforces strict settings across all packages:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `verbatimModuleSyntax: true`
- `isolatedModules: true`
- `module: "nodenext"`, `target: "esnext"`
- `noEmit: true` (overridden to `false` in per-package tsconfigs for builds)

Each package extends the root config and adds its own `rootDir`, `outDir`, `declarationDir`, and cross-package `paths` mappings (pointing to sibling `dist/` directories for build-time resolution).

---

## Testing

Tests use **Vitest** with **jsdom** for DOM environment simulation.

### Running Tests

```bash
pnpm test             # Run all tests (vitest run)
pnpm build && pnpm test  # Build first if testing cross-package changes
```

### Test Suite Structure

| Package | Test File | Cases | Scope |
| :--- | :--- | :---: | :--- |
| `@driftjs/compiler` | `tests/lexer.test.ts` | 7 | Tokenization: basic HTML, attributes, interpolations, scripts, edge cases, errors |
| `@driftjs/compiler` | `tests/parser.test.ts` | 10 | AST parsing: elements, attributes, events, void elements, whitespace stripping, errors |
| `@driftjs/compiler` | `tests/analyzer.test.ts` | 5 | Scope resolution, register assignment, mutation rewriting, dep masks, error detection |
| `@driftjs/compiler` | `tests/generator.test.ts` | 3 | Bytecode generation via class and function API, end-to-end instruction emission |
| `@driftjs/vm` | `tests/vm.test.ts` | 13 | Client VM: mount, properties, child removal, branching, unmount, async reactivity, microtask batching, bitmask optimization |
| `@driftjs/vm` | `tests/server.test.ts` | — | Server-side rendering |
| `@driftjs/vite-plugin` | `tests/plugin.test.ts` | 3 | Plugin instantiation, file filtering, AOT .drift → ESM compilation |

### Testing Conventions

- Tests follow the `describe` / `it('should ... when ...')` pattern.
- Each test has one logical assertion (Arrange → Act → Assert).
- Expected values are hard-coded literals derived from the specification, never computed from the implementation under test.
- Edge cases (empty input, whitespace-only text) and error cases (unclosed tags, undeclared variables) are tested alongside happy paths.
- Async reactivity tests use `setTimeout`, `Promise.then`, `async/await`, `setInterval`, and `fetch()` patterns with appropriate timer flushing.

---

## Coding Conventions

### General

- **Language:** TypeScript with ESM (`"type": "module"` everywhere, `.js` extensions in import paths).
- **Indentation:** 2 spaces.
- **Line length:** Aim for ≤100 characters.
- **No `any`:** Use `unknown` with narrowing. The only `any` usage is in acorn AST walking and the internal `(node as any)[prop]` for dynamic DOM property setting.
- **`as const` objects over enums:** `Opcodes` is a `const` object, `TokenType` uses a TypeScript `enum` (predates the convention shift).
- **Naming:** Classes use `PascalCase` (`DriftJSLexer`, `DriftJSClientVM`). Functions use `camelCase`. Constants use `SCREAMING_SNAKE_CASE` within the `Opcodes` object. Types/interfaces use `PascalCase`.

### File Organization

- Each package has a top-level `index.ts` barrel that re-exports `src/` and `types/`.
- `src/` contains implementation, organized into subdirectories by module (`lexer/`, `parser/`, etc.).
- `types/` contains all exported type definitions, separated by domain.
- `tests/` contains test files named `<module>.test.ts`.
- Each subdirectory barrel (`src/lexer/index.ts`) re-exports the single implementation file.

### Class + Convenience Function Pattern

Every major module exposes both a class and a standalone convenience function:

```typescript
// Class API
const lexer = new DriftJSLexer(source);
const tokens = lexer.tokenize();

// Convenience function
const tokens = tokenize(source);
```

This pattern holds for `DriftJSLexer`/`tokenize`, `DriftJSParser`/`parseTemplate`, `DriftJSAnalyzer`/`analyzeAST`, `DriftJSGenerator`/`generate`, `DriftJSClientVM`/`interpret`/`mount`, `DriftJSServerVM`/`renderToString`.

### Dependency Graph

```
@driftjs/vm              (no workspace dependencies)
    ▲
    │
@driftjs/compiler        (depends on @driftjs/vm for Opcodes and encodeInstruction)
    ▲
    │
@driftjs/vite-plugin     (depends on @driftjs/compiler and @driftjs/vm)
```

---

## Key Design Decisions

1. **Register 0 is reserved** for the current event object (`Event`). All state variables start at register index 1.
2. **Thunks are `new Function()`-constructed.** The analyzer rewrites source expressions and the generator wraps them in `new Function('regs', 'vm', code)`. This is a deliberate trade-off for AOT compilation — the thunk source is serialized by the Vite plugin via `.toString()`.
3. **Bitmask reactivity is O(1).** Each `EXEC_THUNK` instruction carries a `depMask` byte. The VM skips the thunk if `(dirtyMask & depMask) === 0`, meaning unchanged signals cost zero work. This limits reactive variables to 32 per component (one bit per register in a 32-bit mask).
4. **Event delegation.** Events are not bound per-node. A single delegated listener per event type is attached to the root element. Nodes are tagged with `data-drift-node` attributes for lookup.
5. **No virtual DOM.** The update path runs `EXEC_THUNK` → `SET_TEXT`/`SET_ATTRIBUTE` directly. There is no diffing step.
6. **SSR parity.** The server VM interprets the same bytecode but builds `VirtualNode` objects instead of real DOM nodes, then serializes to HTML.

---

## How to Add a New Opcode

1. Add the opcode constant to `packages/vm/src/isa.ts` in the `Opcodes` object.
2. Update the ISA documentation in `docs/ISA.md`.
3. Add a `case` branch in `DriftJSClientVM.execute()` (`packages/vm/src/client/index.ts`).
4. Add a corresponding `case` branch in `DriftJSServerVM.execute()` (`packages/vm/src/server/index.ts`) — or a no-op if the opcode is client-only.
5. If the opcode is emitted by the compiler, add emission logic in `DriftJSGenerator` (`packages/compiler/src/generator/generator.ts`).
6. Add tests in the appropriate test file(s).
7. Rebuild: `pnpm build && pnpm test`.

---

## Common Pitfalls

- **Import extensions:** All imports must use `.js` extensions (ESM + `nodenext` module resolution). TypeScript source files import `.js` even though the source is `.ts`.
- **Build before test:** Cross-package type resolution in tests relies on built `dist/` artifacts. Run `pnpm build` before `pnpm test` if you change type signatures.
- **Register overflow:** The `depMask` is a single byte (8-bit) in the instruction encoding, but `markDirty` uses `1 << (regIdx % 32)` which wraps at 32. Components with >32 state variables will have bitmask collisions.
- **`new Function` and CSP:** Thunk construction via `new Function()` will fail under strict Content Security Policy headers. This is a known limitation.
- **The `JUMP` back-patch:** The generator emits a placeholder `JUMP 0` instruction after the mount block and patches it later with the update block offset. The offset is encoded as a 24-bit value split across the B and C operand bytes.
