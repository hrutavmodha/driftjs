# driftjs-compiler

> Ahead-of-time (AOT) compiler for **DriftJS** `.drift` Single File Components (SFCs).

Converts `.drift` template markup and `<script>` blocks into compact, linear 32-bit `Uint32Array` register VM bytecode instructions and optimized javascript thunk arrays.

## Installation

```bash
pnpm add driftjs-compiler
# or
npm install driftjs-compiler
```

## Features

- **Lexer:** Fast tokenization with nested template expression and string literal tracking.
- **Parser:** Parses token streams into structured AST nodes (`ElementNode`, `TextNode`, `InterpolationNode`, `ScriptNode`).
- **Analyzer:** Analyzes AST using Acorn, tracks reactive variable scope, transforms state mutations into zero-overhead dirty mask markers (`markDirty`), and assigns 32-bit register indexes.
- **Generator:** Emits binary bytecode, serialized thunks, and update block offsets for execution by the DriftJS VM.

## API Usage

```typescript
import { DriftJSLexer, DriftJSParser, DriftJSAnalyzer, DriftJSGenerator, generate } from 'driftjs-compiler';

const source = `
<script>
  let count = 0;
  function increment() { count++; }
</script>

<button onclick={increment}>Count: {count}</button>
`;

// One-shot compilation helper
const program = generate(source);

console.log(program.bytecode);          // Uint32Array instruction stream
console.log(program.constants);         // Constants pool & compiled thunks
console.log(program.updateBlockOffset); // Bytecode offset for reactive updates
```

## Architecture

The compiler pipeline runs as follows:

```
.drift Source -> Lexer -> Tokens -> Parser -> AST -> Analyzer -> AnalysisResult -> Generator -> CompiledProgram
```

## License

MIT © [Hrutav Modha](https://github.com/hrutavmodha)
