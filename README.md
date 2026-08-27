<div align="center">
  <h1>⚡ DriftJS</h1>
  <p>
    <strong>Ultra-Fast, Register-Based Bytecode Virtual Machine UI Framework</strong><br />
    <em>Zero Virtual DOM Overhead • Expression Engine • Keyed LIS Reconciliation • Built for Speed</em>
  </p>
  <br />
  <img src="assets/icon.png" alt="DriftJS Logo" width="180" />
</div>



Have questions, feature ideas, or want to discuss compiler optimizations and register VM architecture?

[![Join Discord](<https://img.shields.io/badge/%20Join%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white>)](https://discord.gg/T66TStRvd)

Connect with core developers, ask questions, share feedback, and help shape the future of DriftJS.

---

## 📌 Overview

**DriftJS** is a next-generation frontend framework powered by an in-browser **register-based Bytecode Virtual Machine (VM)**.

Unlike traditional Virtual DOM frameworks (e.g., React) that re-evaluate large tree structures or compiler-only reactive frameworks (e.g., Svelte), DriftJS compiles `.drift` single-file templates into compact binary-serializable bytecode streams (`CompiledModule`). At runtime, a lightweight 256-register VM executes these instructions directly against the DOM with minimal memory allocation and surgical updates.

> [!NOTE]
> DriftJS is currently an **experimental prototype** exploring register-based Virtual Machine execution for web UI. While single-template bytecode compilation, expression evaluation, and basic keyed LIS list reconciliation are implemented and passing test suites:
>
> - **Current Limitations**: Component composition/nesting, props passing, routing, state management stores, SSR/hydration, and developer debugging tools are not yet implemented.
> - **Under Active Design**: Complex JS syntax in directives, deep reactivity tracking, and robust compiler error recovery.
>
> We warmly invite framework researchers, compiler engineers, and open-source contributors to collaborate with us on building out these features and advancing this experimental architecture into a production-grade framework!

---

## 🔥 Key Architectural Features

- **⚡ High-Performance Expression Engine**: Evaluates JS expressions in scope with compiled functions for optimal runtime execution.
- **⚡ Register-Based Virtual Machine**: Uses 256 fast virtual registers (`r0`, `r1`, ...) for DOM elements, text nodes, fragments, and evaluated primitive values.
- **🔄 Keyed LIS Reconciliation**: Features a Longest Increasing Subsequence (LIS) list reconciler (`reconcileKeyedList`) that minimizes DOM node movements, insertions, and deletions.
- **🎯 Fast-Path Attribute Patching**: Re-evaluates element attributes in-place without rebuilding DOM subtrees when data object references remain stable.
- **📍 Fine-Grained Reactive Regions**: HTML comment anchors (`<!--if-->`, `<!--for-->`) visually bound `@if` and `@for` blocks, allowing surgical re-rendering of targeted regions without disturbing surrounding DOM elements.
- **⚡ Vite Integration & Instant HMR**: Includes [`driftjs-vite-plugin`](packages/vite-plugin) for instant template compilation and full-reload HMR on file save.

---

## 🚀 Quick Start (CLI Scaffolder)

Create a new DriftJS app instantly using `create-drift`:

```bash
pnpm create drift my-app
# or using npm / yarn / bun
npm create drift my-app
```

- The command will prompt you interactively for your choices to set up your DriftJS app in seconds!

---

## 📦 Monorepo Packages

DriftJS is organized as a monorepo published on npm:

| Package                           | Path                                                | Description                                                                          |
| :-------------------------------- | :-------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **`create-drift`**        | [`packages/cli`](packages/cli)                     | Interactive CLI scaffolding tool (`npm create drift`)                              |
| **`driftjs-compiler`**    | [`packages/compiler`](packages/compiler)           | Lexer, Parser, Transformer, & Bytecode Generator emitting`CompiledModule` bytecode |
| **`driftjs-dom`**         | [`packages/dom`](packages/dom)                     | 256-Register Client VM, Expression Engine, Keyed LIS reconciler, &`mount()` API    |
| **`driftjs-ssr`**         | [`packages/ssr`](packages/ssr)                     | Headless Server-Side Rendering VM engine (`renderToString()`)                      |
| **`driftjs-shared`**      | [`packages/utils`](packages/utils)                 | Shared Scope & Expression Evaluator engine                                           |
| **`driftjs-vite-plugin`** | [`packages/vite-plugin`](packages/vite-plugin)     | Vite plugin transforming`.drift` SFCs into synthetic ESM modules                   |
| **`driftjs-vscode`**      | [`packages/vscode-plugin`](packages/vscode-plugin) | VS Code Extension for`.drift` SFC syntax highlighting & diagnostics                |
| **`template`**            | [`template`](template)                             | Starter project template with Vite, TypeScript, and`.drift` counter example        |

---

## ⚙️ Architecture & Compiler Pipeline

The compilation and execution workflow consists of 5 tightly decoupled stages:

```
.drift Template
   │
   ▼
[ DriftLexer ] ──────► On-demand parser-driven tokenization
   │
   ▼
[ DriftParser ] ─────► AST construction (ProgramNode, ElementNode, IfNode, ForNode, etc.)
   │
   ▼
[ DriftTransformer ] ─► Whitespace stripping & JS expression enrichment
   │
   ▼
[ DriftGenerator ] ───► Emits 15-Opcode Bytecode Array, Constant Pool, & Reactive Bindings
   │
   ▼
[ DriftClientVirtualMachine ] ──► Executes Bytecode via 256 Registers & Keyed LIS Reconciler
```

---

## 📖 DriftJS Template Syntax Guide (`.drift`)

A `.drift` component blends standard HTML markup with JavaScript state logic inside top-level `<script>` blocks and control directives (`@if`, `@for`, `@switch`).

### 1. Script Logic & State Scope (`<script>`)

Declare component reactive state and functions inside a top-level `<script>` block. Any top-level `let` or `const` declarations automatically become part of the component's reactive scope.

```html
<script>
  // Declare reactive state variables
  let user = "Alex";
  let items = [
    { id: 1, text: "Build DriftJS Compiler", done: true },
    { id: 2, text: "Write Keyed LIS Reconciler", done: true },
    { id: 3, text: "Deploy Web App", done: false }
  ];
  let filter = "all";

  // Event handlers & state mutation functions
  function toggleItem(id) {
    items = items.map(item => item.id === id ? { ...item, done: !item.done } : item);
  }

  function removeItem(id) {
    items = items.filter(item => item.id !== id);
  }

  function setFilter(newFilter) {
    filter = newFilter;
  }
</script>
```

---

### 2. Expression Interpolation (`{ ... }`)

Embed dynamic values directly within DOM text content using curly braces `{}`. Any valid JavaScript expression is supported and evaluated inside the component scope.

```html
<!-- Property access -->
<h1>Welcome back, {user}!</h1>

<!-- Calculations & JavaScript expressions -->
<p>Total Tasks: {items.length}</p>
<p>Completed Tasks: {items.filter(i => i.done).length}</p>

<!-- Ternary conditional expressions -->
<p>Status: {items.every(i => i.done) ? "All Completed! 🎉" : "In Progress ⏳"}</p>
```

---

### 3. Attributes & Event Delegation

Attributes can be static strings, dynamic JavaScript expressions, or event handlers.

#### Static & Dynamic Attributes

```html
<!-- Static attributes -->
<div class="task-card" data-category="work">

<!-- Dynamic string evaluation -->
<div class={filter === "all" ? "tab active" : "tab"}>

<!-- Boolean attributes (attribute present when true, removed when false) -->
<button disabled={items.length === 0}>Clear All</button>
```

#### Event Delegation (`onclick={...}`, `oninput={...}`)

Event handlers automatically hook into DriftJS's central event delegation engine. Any state mutated inside an event handler triggers targeted DOM updates automatically.

```html
<!-- Direct function binding -->
<button onclick={ () => setFilter("all") }>Show All</button>
<button onclick={ () => setFilter("pending") }>Show Pending</button>

<!-- Inline arrow functions with parameters -->
<button onclick={ () => toggleItem(item.id) }>Toggle Status</button>
<button onclick={ () => removeItem(item.id) }>Delete Task</button>
```

---

### 4. Conditional Directives (`@if`, `@else if`, `@else`)

Render DOM subtrees conditionally based on reactive conditions. Conditional blocks are anchored by comment nodes (`<!--if-->` / `<!--/if-->`) for targeted sub-tree mounting.

```html
@if filter === "all" {
  <p class="badge badge-info">Showing all {items.length} items</p>
}
@else if filter === "pending" {
  <p class="badge badge-warning">Showing pending items only</p>
}
@else {
  <p class="badge badge-success">Completed items view</p>
}
```

---

### 5. Loop Directives (`@for`)

Iterate over arrays using `@for`. DriftJS reconciliation uses the Keyed LIS (Longest Increasing Subsequence) algorithm to re-order and patch DOM elements efficiently with minimal node recreations.

#### Item Iteration

```html
@for item in items {
  <div class="task-row">
    <span class={item.done ? "line-through" : ""}>{item.text}</span>
    <button onclick={ () => toggleItem(item.id) }>Check</button>
  </div>
}
```

#### Item + Index Iteration

```html
@for (item, index) in items {
  <li class="list-item">
    <span class="index">#{index + 1}</span>
    <span class="title">{item.text}</span>
    <button onclick={ () => removeItem(item.id) }>Remove</button>
  </li>
}
```

---

### 6. Pattern Matching Directives (`@switch`, `@case`, `@default`)

Pattern match discriminant expressions into distinct `@case` branches.

```html
@switch filter {
  @case "all" {
    <div class="view-all">All Tasks Summary</div>
  }
  @case "pending" {
    <div class="view-pending">Pending Tasks Overview</div>
  }
  @default {
    <div class="view-default">Custom Filter Mode</div>
  }
}
```

---

### 7. Complete Task Tracker Component Example

Here is an example of  complete `.drift` component combining script scope, state reactivity, interpolations, conditional blocks, and loop reconciliation:

```html
<script>
  let newTaskTitle = "";
  let priority = "medium";
  let tasks = [
    { id: 101, title: "Configure Vite Plugin", priority: "high", done: true },
    { id: 102, title: "Optimize VM Registers", priority: "high", done: false },
    { id: 103, title: "Write Benchmarks", priority: "medium", done: false }
  ];

  function toggleTask(id) {
    tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
  }
</script>

<div class="app-container">
  <header class="app-header">
    <h1>Task Board</h1>
    <span class="counter">Pending: {tasks.filter(t => !t.done).length} / {tasks.length}</span>
  </header>

  @if tasks.length === 0 {
    <div class="empty-state">
      <p>🎉 All tasks are completed! Enjoy your day.</p>
    </div>
  }
  @else {
    <ul class="task-list">
      @for (task, idx) in tasks {
        <li class={task.done ? "task-item completed" : "task-item"}>
          <span class="task-num">#{idx + 1}</span>
          <span class="task-title">{task.title}</span>

          @switch task.priority {
            @case "high" { <span class="tag tag-red">High Priority</span> }
            @case "medium" { <span class="tag tag-amber">Medium Priority</span> }
            @default { <span class="tag tag-gray">Low Priority</span> }
          }

          <button onclick={ () => toggleTask(task.id) }>
            {task.done ? "Undo" : "Complete"}
          </button>
          <button class="danger" onclick={ () => deleteTask(task.id) }>Delete</button>
        </li>
      }
    </ul>
  }
</div>
```

---

## 🔢 Virtual Machine Instruction Set Architecture

DriftJS relies on a streamlined 15-opcode ISA. Detailed specifications are in [`docs/ISA.md`](docs/ISA.md).

---

## 🛠️ Getting Started & Local Development

### Prerequisites

- Node.js `^20.0.0` or higher
- `pnpm` `^9.0.0` or higher

### Installation & Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/hrutavmodha/driftjs.git
   cd driftjs
   ```
2. **Install dependencies**:

   ```bash
   pnpm install
   ```
3. **Build all workspace packages**:

   ```bash
   pnpm build
   ```
4. **Run the test suite**:

   ```bash
   pnpm test
   ```

   *All unit and integration tests across the test suites will run via Vitest.*
5. **Typecheck workspace**:

   ```bash
   pnpm typecheck
   ```
6. **Run starter application**:

   ```bash
   cd template
   pnpm dev
   ```

---

## 📚 Test Suites Reference

- The official test suites documentation is available at [Test Suite Inventory &amp; Coverage](docs/TESTS.md)

---

## 🤝 Contributing

We welcome contributions of all kinds! Whether you want to fix bugs, optimize VM opcode execution, improve compiler error reporting, add developer tools, or expand benchmark coverage:

1. Fork the repository and create your feature branch (`git checkout -b feature/my-feature`).
2. Run tests to ensure everything passes (`pnpm test`).
3. Ensure TypeScript typechecking passes (`pnpm typecheck`).
4. Open a Pull Request detailing your changes.

Together, let's make DriftJS a production-grade, ultra-fast UI framework!

---

## 📄 License

MIT © Hrutav Modha
