# driftjs-dom

> Register VM runtime engine for browser DOM execution in **DriftJS**.

Replaces traditional VDOM diffing and Proxy reactivity with a linear fetch-decode-execute instruction loop over a `Uint32Array` bytecode stream.

## Installation

```bash
pnpm add driftjs-dom
# or
npm install driftjs-dom
```

## Highlights

- **Direct DOM Manipulation:** Zero virtual DOM or tree diffing. Instructions directly create, append, text-set, and property-set native DOM elements.
- **O(1) Bitmask Reactivity:** State mutations set a 32-bit dirty mask. Updates evaluate bitwise dependency masks (`(dirtyMask & depMask) === 0`) to skip unchanged reactive thunks instantly.
- **Microtask Batching:** Coalesces synchronous state mutations within the same tick into a single batched patch execution.
- **Delegated Event System:** Attaches a single root listener per event type using `data-drift-node` element indexing.

## API Usage

```typescript
import { interpret, mount } from 'driftjs-dom';
import App from './App.drift';

// Mount compiled DriftJS component to DOM container
const vm = mount(App, document.getElementById('app')!);

// Programmatic unmount & cleanup
// vm.unmount();
```

## Instruction Set Architecture (ISA)

The runtime interprets 32-bit instructions encoded as:
`[ Opcode (8-bit) | Register A (8-bit) | Register B (8-bit) | Register C (8-bit) ]`

Opcodes include `LOAD_CONST`, `LOAD_NODE`, `EXEC_THUNK`, `CREATE_ELEMENT`, `CREATE_TEXT`, `APPEND_CHILD`, `MOUNT`, `SET_TEXT`, `SET_ATTRIBUTE`, `BIND_EVENT`, `JUMP`, `RETURN`, `SET_PROPERTY`.

## License

MIT © [Hrutav Modha](https://github.com/hrutavmodha)
