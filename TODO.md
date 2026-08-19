# DriftJS Roadmap & TODOs

## 🚀 Upcoming Core Features & Initiatives

- [x] **Global Context Mechanism**
  - Designed and implemented type-safe Context Tokens (`createContext`, `provide`, `inject`) with dedicated `vm.contextMap` and `parentVM` traversal.
  - Full client DOM (`driftjs-dom`) and SSR (`driftjs-ssr`) support with 100% test coverage.

- [ ] **Official DriftJS Documentation Website (Dogfooding)**
  - Build the complete official documentation and landing website using DriftJS itself to test real-world developer experience, performance, and ergonomics.

- [x] **Native Client-Side Router (`driftjs-router`)**
  - Designed and implemented a dedicated client-side router package with history, hash, and memory drivers, dynamic route parameters, nested routes/outlets, scroll restoration, and navigation guards.
  - Complete with declarative `.drift` SFCs (`src/components/RouterView.drift`, `src/components/RouterLink.drift`, `src/components/Link.drift`), native component helpers, and 100% test coverage across 21 test suites.
