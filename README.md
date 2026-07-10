# Register VM-Based Reactivity Engine

A bytecode-driven runtime engine designed for fine-grained frontend UI updates. This project replaces traditional JavaScript-object-level reactivity (such as Virtual DOM diffing, proxy interception, or closure-based dependency graphs) with an ahead-of-time (AOT) compiler and a register-allocated virtual machine (VM) interpreter.

## Problem Statement

Modern frontend frameworks carry significant structural costs: frequent heap allocations of signal/closure objects increase garbage collection (GC) pressure, structural diffing adds CPU overhead, and polymorphic execution paths trigger JIT compiler de-optimization in engines like V8 and SpiderMonkey. This engine addresses these performance gaps by treating UI reactivity as a compilation target rather than a runtime abstraction.

## Project Objectives

- **Minimize Memory Overhead and GC Interruptions**: Eliminate GC pauses in reactive UI updates via a flat memory execution model backed by `ArrayBuffer` and `TypedArray` layouts.
- **Maximize Runtime Rendering Performance**: Achieve near-native DOM rendering speed by bypassing Virtual DOM traversals and diffing, mapping state changes directly to virtual registers and updates.
- **Optimize Client-Side Execution Footprint**: Shift reactive dependency tracking and AST structural analysis to compile time, delivering lightweight and linear bytecode streams.
- **Assess the Viability of VM-Driven Frontend Architectures**: Establish empirical benchmarks of VM-based UI execution against proxy/VDOM frameworks on resource-constrained environments.

## Major Modules

- **Parser**: Parses declarative UI templates into a structured Abstract Syntax Tree (AST), separating static DOM structure from dynamic state bindings and events.
- **Compiler**: Translates the template AST into a linear bytecode stream, mapping reactive state variables to register IDs and generating the static dependency graph.
- **Virtual Machine (VM)**: A low-overhead interpreter running a fetch-decode-execute loop on typed arrays, executing DOM patches directly from registers.

## Documentation Compilation

A shell script is provided to compile the markdown draft documentation into the final PDF format.

To run the compilation:

```bash
chmod +x ./scripts/compile.sh
./scripts/compile.sh
```

## References

This research builds upon the following foundational systems and compiler literature:

- *The Implementation of Lua 5.0* (Ierusalimschy, R. et al., 2005)
- *Crafting Interpreters* (Nystrom, R., 2021)
- *Svelte Compiler Architecture* (Compile-time dependency tracking)
- *SolidJS Reactivity Engine* (Fine-grained reactive updates)
- *Engineering a Compiler* (Cooper, K. & Torczon, L., 2011)
