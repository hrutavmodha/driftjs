# DriftJS — Implementation Flaw Analysis

> [!NOTE]
> DriftJS is a template compiler + register-based VM runtime. The compiler pipeline is: **Lexer → Parser → Transformer (Acorn enrichment) → Generator (bytecode)**, and the runtime is a **Client VM** that executes the bytecode against a DOM Document.

## Test Results Summary

| Suite | Status | Pass / Total |
|---|---|---|
| Lexer | ✅ | 18/18 |
| Parser | ✅ | 20/20 |
| Transformer | ✅ | 5/5 |
| Generator | ✅ | 9/9 |
| **VM Runtime** | **❌** | **2/4** |

---

## 🔴 Critical Bugs (Cause test failures)

### 1. VM `EVAL_EXPR` cannot evaluate Acorn AST nodes — only does trivial scope lookups

**File:** [client/index.ts](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L17-L23)

The `resolveValue` function is the heart of expression evaluation, but it only handles three cases:
- Raw strings → scope key lookup
- `Identifier` AST nodes → `scope[name]`
- `Literal` AST nodes → `node.value`

It **cannot** evaluate `BinaryExpression`, `MemberExpression`, `CallExpression`, `ConditionalExpression`, or any other compound Acorn AST node. This means `@if`, `@for`, and `@switch` with non-trivial expressions will silently return the raw AST object instead of a computed value. The VM claims "100% CSP compliant" by avoiding `eval`/`new Function`, but achieves this by **simply not evaluating expressions at all**.

### 2. VM `JUMP_IF_FALSE` branching is broken — both branches execute

**File:** [client/index.ts](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L140-L153)

The conditional test confirms this: when `isLoggedIn = true`, the output is `<span>User</span><span>Guest</span>` — **both branches render**. The `JUMP` instruction at [line 141](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L141) sets `pc` correctly, but the test's handcrafted bytecode has `JUMP` targeting byte offset 24 while `RETURN` is at offset 24. The VM's `JUMP` handler does `pc = target`, which is correct. However, the issue is that after the consequent branch, the `JUMP` goes to offset 24 which is `RETURN`, but the alternate branch (offset 17–23) also gets a `RETURN` at byte 24. Looking more carefully at the bytecode layout:

```
Byte 0:  CREATE_FRAGMENT r0        (2 bytes, ends at 1)
Byte 2:  EVAL_EXPR r1 c0           (3 bytes, ends at 4)
Byte 5:  JUMP_IF_FALSE r1 -> 17    (4 bytes, ends at 8)
Byte 9:  CREATE_ELEMENT r2 c1      (3 bytes, ends at 11)
Byte 12: CREATE_TEXT r3 c2          (3 bytes, ends at 14)
Byte 15: APPEND_CHILD r2 r3        (3 bytes, ends at 17)
Byte 18: APPEND_CHILD r0 r2        (3 bytes, ends at 20)
Byte 21: JUMP -> 24                (3 bytes, but wrong!)
```

Wait — the bytecode array in the test has raw values without proper byte offset accounting. The `JUMP 0, 24` tries to jump to byte 24, but the subsequent `APPEND_CHILD` instructions shift everything. The real problem is that `JUMP_IF_FALSE` jumps to byte offset 17, which is `APPEND_CHILD r0 r2` (appending the "User" span), not the start of the else branch. **The jump target `17` in the test is miscalculated.** This is partially a test bug, but it exposes that the compiler's jump patching and the VM's PC advancement are fragile with no validation.

### 3. VM `LOOP_ITER` — `resolveValue` re-resolves an already-resolved register value

**File:** [client/index.ts](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L155-L191)

At [line 166](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L166), `resolveValue(this.registers[arrayReg], scope)` is called. But `arrayReg` already holds the result of a prior `EVAL_EXPR` — if that was a string like `"list"`, `resolveValue` does `scope["list"]` which works. But if EVAL_EXPR already resolved the value to an actual array (which it can't due to Bug #1), there's a double-resolve problem. The for loop test fails with `result` being `null` because the VM returns `null` at [line 198](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L198) — the `RETURN` instruction is never reached, meaning PC overruns the bytecode.

---

## 🟡 Significant Design Flaws

### 4. `@else if` lookahead check in lexer is wrong

**File:** [lexer.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L218)

```typescript
if (this.startsWith('if') && !/[a-zA-Z0-9_]/.test(this.peek(2))) {
```

`this.peek(2)` reads 2 characters **ahead of the current offset**, but `this.startsWith('if')` checks from the current offset. After consuming `@else`, whitespace is skipped, and the cursor is on `i`. So `this.peek(2)` is the character **2 positions ahead** of `i`, which is the character after `f` — that's correct. BUT, the regex test `!/[a-zA-Z0-9_]/.test(this.peek(2))` fails if `this.peek(2)` returns `''` (end of input). `''.test(...)` returns `true` for negated pattern, so it accidentally works. However, `this.peek(2)` checks `offset + 2`, which is relative to the *current* offset. Since `startsWith('if')` means the characters at offset and offset+1 are `i` and `f`, `peek(2)` correctly checks the character after `f`. This is **fragile but currently works** — it would break on `@else iffy` since `iffy` starts with `if` but `peek(2)` gives `f`, which matches `[a-zA-Z]`, correctly rejecting it. OK, so this is actually correct but poorly expressed.

### 5. `parseForDirective` uses first `" in "` — breaks on expressions containing `" in "`

**File:** [parser.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L343)

```typescript
const inIndex = header.indexOf(' in ');
```

This naively finds the first `" in "` substring. A template like `@for item in items.filter(x => 'in' in x) { ... }` would split on the wrong `in`, producing a malformed LHS/RHS.

### 6. Vite config `__dirname` calculation is incorrect

**File:** [compiler/vite.config.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/vite.config.ts#L5-L6)

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename);    // ❌ Should be dirname(), not resolve()
```

`resolve(__filename)` returns the **absolute path of the file itself**, not its directory. The `lib.entry` then computes `resolve(__dirname, '../src/index.ts')` which is `resolve('/path/to/vite.config.ts', '../src/index.ts')` — this accidentally works because `resolve` with a file path as base strips the filename and goes up one directory. But it's semantically wrong and fragile; the correct code is:

```typescript
import { dirname } from 'path';
const __dirname = dirname(__filename);
```

### 7. Runtime `vite.config.ts` uses CJS-style `__dirname` without ESM polyfill

**File:** [runtime/vite.config.ts](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/vite.config.ts#L7)

```typescript
entry: path.resolve(__dirname, 'src/index.ts'),
```

The project is `"type": "module"` (ESM), where `__dirname` is **not defined**. This should use `fileURLToPath(import.meta.url)` + `dirname()`, like the compiler's config does (minus that config's own bug). This likely works only because Vite pre-processes config files specially, but it's technically incorrect.

### 8. `package.json` `main` vs `exports` mismatch

**Files:** [compiler/package.json](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/package.json), [runtime/package.json](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/package.json)

- Compiler: `"main": "./dist/index.js"` but `"exports": { ".": "./dist/drift-es.js" }`. The Vite build produces `drift.mjs` and `drift.cjs`, not `index.js` or `drift-es.js`. **Both `main` and `exports` point to non-existent files.**
- Runtime: `"main": "./dist/index.js"` but `"exports": { ".": "./dist/drift-runtime-es.js" }`. The build produces `drift-runtime.mjs` and `drift-runtime.cjs`. Again, **both point to non-existent files.**

### 9. Generator `compileElement` has dead `isRoot` branch

**File:** [generator.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L99-L105)

```typescript
if (isRoot) {
  this.emit(Opcode.CREATE_ELEMENT, targetReg, tagConstIdx);
} else {
  this.emit(Opcode.CREATE_ELEMENT, targetReg, tagConstIdx);
}
```

Both branches emit **identical bytecode**. The `isRoot` parameter is meaningless.

### 10. Generator constant deduplication uses `JSON.stringify` — fragile for AST nodes

**File:** [generator.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/generator.ts#L280-L286)

`JSON.stringify` comparison for Acorn AST nodes with circular references or `undefined` values will either crash or produce incorrect equality. For large ASTs, this is also an O(n²) scan per constant insertion.

### 11. Runtime imports types across package boundary via relative paths

**File:** [runtime/types/index.ts](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/types/index.ts#L1)

```typescript
export * from '../../compiler/types/opcodes.js';
```

This creates a hard filesystem coupling between the `runtime` and `compiler` packages, bypassing the package manager entirely. The runtime should declare `@driftjs/compiler` as a dependency and import from it, or the shared types should live in a dedicated `@driftjs/types` package.

### 12. `interprete` function name is a typo

**File:** [compiler/src/index.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/index.ts#L18)

The public API function is named `interprete` — the correct English word is **`interpret`** (or `compile`, which would be more accurate given that it returns a `CompiledModule`, not an interpreted result).

---

## 🔵 Minor Issues

### 13. `isWhitespaceOnly` returns `true` for empty strings

**File:** [transformer.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/transformer.ts#L198-L206)

An empty string `""` will pass the `isWhitespaceOnly` check (the loop body never executes, returns `true`), causing empty `TextNode`s to be silently stripped. This may or may not be intended.

### 14. Lexer `KNOWN_DIRECTIVES` is re-created on every directive token

**File:** [lexer.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L204)

```typescript
const KNOWN_DIRECTIVES = new Set(['if', 'else', 'for', 'switch', 'case', 'default']);
```

This allocates a new `Set` for every `@directive` encountered. Should be a module-level constant.

### 15. `@else` without a following `{` silently emits a token and continues

**File:** [lexer.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/lexer.ts#L222-L228)

If the user writes `@else` with no block brace, the lexer emits a `DirectiveElse` token with an empty value and *does not increment `blockDepth`*, but the parser will then try to parse children until `BlockClose` which will never appear, leading to a confusing error far from the actual mistake.

### 16. `parseForDirective` and `parseSwitchDirective` return `any`

**File:** [parser.ts](file:///home/hrutav-modha/Documents/driftjs/packages/compiler/src/parser.ts#L338-L432)

These methods return `any` instead of `ForNode` and `SwitchNode` respectively, breaking type safety for callers.

### 17. VM register array is fixed at 256 entries with no bounds check

**File:** [client/index.ts](file:///home/hrutav-modha/Documents/driftjs/packages/runtime/src/client/index.ts#L30)

The `allocRegister()` in the generator increments without limit, but the VM's register file is `new Array(256)`. A sufficiently complex template will silently write to `undefined` slots without error.

---

## Summary

| Severity | Count | Key Concerns |
|---|---|---|
| 🔴 Critical | 3 | VM can't evaluate expressions; branching is broken; for-loops fail |
| 🟡 Significant | 9 | Incorrect build configs, cross-package coupling, dead code, API naming |
| 🔵 Minor | 5 | Allocations, type safety, edge cases |
