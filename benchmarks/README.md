# DriftJS Benchmark Suite

> **Note:** This benchmark suite is a local, custom implementation modeled after the official [`js-framework-benchmark`](https://github.com/krausest/js-framework-benchmark) architecture. It is designed to rigorously benchmark, validate, and track the performance characteristics of different versions of **DriftJS** as the engine evolves, while comparing against other modern web UI frameworks.

---

## Overview

The DriftJS benchmark suite measures real-world browser performance across three core categories:

1. **CPU Durations** — DOM operations (creation, replacement, partial updates, row selection, swapping, deletion, batch creation, appending, and clearing).
2. **Memory Footprint** — JavaScript heap consumption measured via Chrome DevTools Protocol (`HeapProfiler`) with explicit garbage collection cycles.
3. **Startup & Bundle Metrics** — Raw bundle sizes on disk, gzip-compressed transfer sizes, and First Contentful Paint (FCP) timings.

---

## Directory Structure

```
benchmarks/
├── common/                  # Shared styling and layout assets
│   └── main.css
├── frameworks/              # Implementations of the standard benchmark table
│   ├── angular/             # Angular 22 implementation
│   ├── drift/               # DriftJS Single File Component implementation
│   ├── ember/               # Ember 7.2 implementation
│   ├── react/               # React 19 implementation
│   ├── solid/               # SolidJS 1.9 implementation
│   ├── svelte/              # Svelte 5 implementation
│   ├── vanilla/             # Vanilla JavaScript baseline implementation
│   └── vue/                 # Vue 3.5 implementation
├── runner/                  # Benchmark orchestration engine
│   ├── app/                 # TypeScript + Vite web dashboard displaying results
│   │   ├── index.html
│   │   ├── package.json
│   │   └── src/
│   ├── src/                 # Playwright runner logic, metrics, and CLI
│   │   ├── benchmarks.ts    # Benchmark definitions, runs, and warmup configuration
│   │   ├── cli.ts           # Command-line interface and argument parser
│   │   ├── frameworks.ts    # Target framework definitions and ports
│   │   ├── reporter.ts      # JSON reporting and results serialization
│   │   ├── runner.ts        # Playwright execution loop and statistical aggregation
│   │   ├── server.ts        # Automated local Vite servers for each framework
│   │   ├── stats.ts         # Statistical calculation (arithmetic mean)
│   │   └── types.ts         # Type definitions
│   └── package.json
├── run-benchmarks.sh        # High-performance runner script (sets CPU governor & starts dashboard)
├── package.json
└── README.md
```

---

## Included Benchmarks

### 1. CPU Benchmarks (Measured in `ms`)

| Benchmark                                | Description                                                             | Default Measured Runs | Default Warmup Runs |
| :--------------------------------------- | :---------------------------------------------------------------------- | :-------------------: | :-----------------: |
| **01. Create 1,000 rows**          | Creates 1,000 table rows upon clicking`#run`                          |          15          |          0          |
| **02. Replace 1,000 rows**         | Replaces all 1,000 rows with 1,000 new rows upon clicking`#run`       |          15          |          5          |
| **03. Update every 10th row (1k)** | Mutates every 10th row label in a 1k-row table upon clicking`#update` |          15          |          5          |
| **04. Select row (1k)**            | Highlights the 2nd row in a 1k-row table upon clicking the row          |          25          |          5          |
| **05. Swap rows (1k)**             | Swaps row 2 and row 999 in a 1k-row table upon clicking`#swaprows`    |          15          |          5          |
| **06. Remove single row (1k)**     | Removes the 2nd row from a 1k-row table upon clicking`.remove`        |          15          |          5          |
| **07. Create 10,000 rows**         | Renders a large 10,000-row table on an empty canvas                     |          15          |          0          |
| **08. Append 1,000 rows to 1k**    | Appends 1,000 rows to an existing 1,000-row table (2,000 rows total)    |          15          |          0          |
| **09. Clear 1,000 rows**           | Clears all rows from a 1,000-row table                                  |          15          |          0          |

### 2. Memory Benchmarks (Measured in `MB`)

- **21. Ready Memory** — JS Heap memory immediately after initial page load (1 run, 0 warmup).
- **22. Run Memory (1k rows)** — JS Heap memory after rendering 1,000 rows (1 run, 0 warmup).
- **25. Run-Clear Memory** — JS Heap memory after cycling creation and clearing of 1,000 rows 5 times (1 run, 0 warmup).

### 3. Startup & Size Benchmarks

- **41. Uncompressed Size (`kB`)** — Total uncompressed JavaScript asset size on & Acknowledgementdisk (1 run, 0 warmup).
- **42. Compressed Size (`kB`)** — Gzip-compressed JavaScript transfer size (1 run, 0 warmup).
- **43. First Paint (`ms`)** — Time to First Contentful Paint / Initial Paint (3 runs, 1 warmup).

---

## Running Benchmarks

### Option A: High Performance Mode (Recommended)

Sets your CPU frequency governor / power profile to `performance` mode, runs the complete test matrix across all frameworks, and automatically starts the Vite web results dashboard:

```bash
# From repository root
pnpm run bench:perf

# Or execute script directly
./benchmarks/run-benchmarks.sh
```

### Option B: Standard CLI Runner

```bash
# Run all benchmarks across all frameworks
pnpm bench

# Filter specific frameworks
pnpm bench --frameworks vanilla,drift,react

# Filter specific benchmarks
pnpm bench --benchmarks 01_run1k,02_replace1k

# Run in headed browser mode
pnpm bench --headed
```

---

## Results Dashboard

The benchmark results are outputted to `benchmarks/runner/app/public/results.json`. You can launch the interactive dashboard at any time to review and inspect results:

```bash
pnpm --filter driftjs-benchmark-app dev
```
