# driftjs-shared

> Shared core utilities, ISA constants, and instruction encoders for **DriftJS**.

Provides opcode declarations and 32-bit binary instruction encoders used across the compiler, client VM runtime, and server renderer packages.

## Installation

```bash
pnpm add driftjs-shared
# or
npm install driftjs-shared
```

## Features

- **Opcode Definitions:** Exports `Opcodes` const object defining instructions (`LOAD_CONST`, `CREATE_ELEMENT`, `EXEC_THUNK`, etc.).
- **Binary Encoders:** Functions for bitpacking opcodes and registers into 32-bit unsigned integer arrays (`encodeInstruction`, `encodeJump`, `encodeInstruction24`).

## Usage

```typescript
import { Opcodes, encodeInstruction } from 'driftjs-shared';

// Encode: CREATE_ELEMENT node_a = 0, node_b = 1
const word = encodeInstruction(Opcodes.CREATE_ELEMENT, 0, 1, 0);
```

## License

MIT © [Hrutav Modha](https://github.com/hrutavmodha)
