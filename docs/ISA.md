# DriftJS Virtual Machine Instruction Set Architecture (ISA)

This document provides the complete, authoritative specification for the register-based Bytecode Instruction Set Architecture (ISA) implemented by **DriftJS**.

---

## 📐 Architecture Overview

DriftJS compiles `.drift` template ASTs into a compact, binary-serializable bytecode stream accompanied by a constant pool (`constants`). The runtime execution environment consists of:
- **Registers (`r0`, `r1`, ...)**: Fast temporary storage for DOM Nodes, DocumentFragments, and evaluated JavaScript primitives.
- **Constant Pool (`constants[i]`)**: Holds static strings (tag names, attribute keys), AST expression subtrees, and compiled sub-modules (`CompiledModule`).
- **Reactive Region Tracker (`reactiveRegions`)**: Anchors `@if` and `@for` blocks to DOM comment nodes (`<!--if-->`, `<!--for-->`) for fast target dynamic updates.
- **Fast-Path Attribute Patcher (`patchItemAttributes`)**: Evaluates `SET_ATTR` opcodes directly on existing DOM nodes when item data object references remain equal.

---

## 🔢 Opcode Summary Table

| Opcode Name | Hex | Dec | Length (Bytes) | Operands | Category | Summary |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| **`RETURN`** | `0x00` | `0` | 2 | `reg` | Control Flow | Returns DOM node/fragment from register as execution output |
| **`CREATE_ELEMENT`** | `0x01` | `1` | 3 | `dstReg, tagIdx` | DOM Node Creation | Instantiates standard DOM Element with tag `constants[tagIdx]` into `dstReg` |
| **`CREATE_TEXT`** | `0x02` | `2` | 3 | `dstReg, textIdx` | DOM Node Creation | Creates static or evaluated DOM TextNode with content `constants[textIdx]` |
| **`CREATE_COMMENT`** | `0x03` | `3` | 3 | `dstReg, commentIdx` | DOM Node Creation | Creates DOM Comment node with content `constants[commentIdx]` |
| **`APPEND_CHILD`** | `0x04` | `4` | 3 | `parentReg, childReg` | DOM Manipulation | Appends node `childReg` to parent element `parentReg` |
| **`SET_ATTR`** | `0x05` | `5` | 5 | `elemReg, nameIdx, valIdx, isDynamic` | Attribute Patching | Sets attribute `constants[nameIdx]` on element in `elemReg` |
| **`CREATE_FRAGMENT`** | `0x06` | `6` | 2 | `dstReg` | DOM Node Creation | Creates a `DocumentFragment` into register `dstReg` |
| **`INTERPOLATE_TEXT`** | `0x07` | `7` | 3 | `dstReg, exprIdx` | Dynamic Binding | Evaluates expression `constants[exprIdx]` to create/patch TextNode |
| **`EXEC_SCRIPT`** | `0x0C` | `12` | 2 | `scriptIdx` | Scope Initialisation | Executes `<script>` AST `constants[scriptIdx]` into component scope |
| **`REACTIVE_IF`** | `0x0D` | `13` | 6 | `parentReg, condIdx, consIdx, altIdx, depsIdx` | Reactive Block | Binds dynamic conditional `@if` block between comment anchors |
| **`REACTIVE_FOR`** | `0x0E` | `14` | 8 | `parentReg, iterIdx, itemNameIdx, idxNameIdx, keyIdx, bodyIdx, depsIdx` | Reactive Block | Binds dynamic `@for` loop with LIS reconciliation & fast-path patching |
| **`MOUNT_COMPONENT`** | `0x0F` | `15` | 4 | `dstReg, compIdx, propsSpecIdx` | Component Mounting | Instantiates child Single File Component VM with props into `dstReg` |

---

## 📖 Detailed Opcode Specifications

### `RETURN` (`0x00`)
- **Bytecode**: `0x00 <reg>`
- **Length**: 2 bytes
- **Description**: Stops execution of the current module and returns the DOM Node or DocumentFragment stored in register `reg`.

### `CREATE_ELEMENT` (`0x01`)
- **Bytecode**: `0x01 <dstReg> <tagIdx>`
- **Length**: 3 bytes (Fixed)
- **Description**: Instantiates a standard DOM element using the HTML tag name string stored at `constants[tagIdx]` (e.g. `'tr'`, `'div'`, `'button'`) and places the element reference in `dstReg`.

### `MOUNT_COMPONENT` (`0x0F`)
- **Bytecode**: `0x0F <dstReg> <compIdx> <propsSpecIdx>`
- **Length**: 4 bytes (Fixed)
- **Description**: Resolves child Single File Component (SFC) module stored at `constants[compIdx]` from scope or global, evaluates props specification `constants[propsSpecIdx]` against current scope, spawns an isolated child VM instance, and mounts the returned root node into `dstReg`. Re-evaluates props in-place on reactive updates.

### `CREATE_TEXT` (`0x02`)
- **Bytecode**: `0x02 <dstReg> <textIdx>`
- **Length**: 3 bytes
- **Description**: Instantiates a static DOM `TextNode` with text content from `constants[textIdx]` and stores the reference in `dstReg`.

### `CREATE_COMMENT` (`0x03`)
- **Bytecode**: `0x03 <dstReg> <commentIdx>`
- **Length**: 3 bytes
- **Description**: Creates a DOM `Comment` node containing `constants[commentIdx]` and places the reference in `dstReg`.

### `APPEND_CHILD` (`0x04`)
- **Bytecode**: `0x04 <parentReg> <childReg>`
- **Length**: 3 bytes
- **Description**: Appends the DOM node in `childReg` as a child of the element or document fragment in `parentReg`.

### `SET_ATTR` (`0x05`)
- **Bytecode**: `0x05 <elemReg> <nameIdx> <valIdx> <isDynamic>`
- **Length**: 5 bytes
- **Description**: Sets attribute `constants[nameIdx]` on element `elemReg`.
  - If `isDynamic === 0`: uses literal constant `constants[valIdx]`.
  - If `isDynamic === 1`: evaluates AST expression `constants[valIdx]` against scope. Supports fast-path attribute diffing (`targetVal !== currentVal`).

### `CREATE_FRAGMENT` (`0x06`)
- **Bytecode**: `0x06 <dstReg>`
- **Length**: 2 bytes
- **Description**: Creates a lightweight DOM `DocumentFragment` and stores the reference in `dstReg`.

### `INTERPOLATE_TEXT` (`0x07`)
- **Bytecode**: `0x07 <dstReg> <exprIdx>`
- **Length**: 3 bytes
- **Description**: Evaluates AST expression `constants[exprIdx]` against current scope, creates a text node with the string result, and stores it in `dstReg`. Registered in `reactiveBindings` for in-place text updates when bound scope variables change.

### `EXEC_SCRIPT` (`0x0C`)
- **Bytecode**: `0x0C <scriptIdx>`
- **Length**: 2 bytes
- **Description**: Executes the `<script>` AST statement array at `constants[scriptIdx]` inside the virtual machine, initialising component state variables and functions in scope before DOM construction.

### `REACTIVE_IF` (`0x0D`)
- **Bytecode**: `0x0D <parentReg> <condIdx> <consIdx> <altIdx> <depsIdx>`
- **Length**: 6 bytes
- **Description**: Registers a dynamic `@if` conditional block bounded by comment anchors (`<!--if-->` / `<!--/if-->`). Re-evaluates test condition `constants[condIdx]` and mounts consequent sub-module `constants[consIdx]` or alternate sub-module `constants[altIdx]` when variables in `constants[depsIdx]` change.

### `REACTIVE_FOR` (`0x0E`)
- **Bytecode**: `0x0E <parentReg> <iterIdx> <itemNameIdx> <idxNameIdx> <keyIdx> <bodyIdx> <depsIdx>`
- **Length**: 8 bytes
- **Description**: Registers a dynamic `@for` loop bounded by comment anchors (`<!--for-->` / `<!--/for-->`). Iterates over array `constants[iterIdx]` using sub-module template `constants[bodyIdx]`.
- **Features**:
  - Uses Longest Increasing Subsequence (LIS) keyed reconciliation (`reconcileKeyedList`).
  - Uses `patchItemAttributes` fast-path for unchanged item references when scope dependencies in `constants[depsIdx]` change.
