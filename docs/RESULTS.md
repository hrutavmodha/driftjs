# DriftJS Benchmark Results & Framework Ladder

This document maintains official benchmark results for **DriftJS** against competing UI frameworks using the [`js-framework-benchmark`](https://github.com/krausest/js-framework-benchmark) (`webdriver-ts`) benchmark suite.

---

## 🏆 Level 1: Ember JS (`v7.3.0`) Comparison — DEFEATED

*Status: **DEFEATED** (DriftJS won 13 of 15 benchmarks).*

### 1. CPU Benchmarks (Duration in ms)
*Values reported as **Mean Duration** in milliseconds (with **Scripting Time** in parentheses).*

| Metric / Benchmark | VanillaJS | DriftJS (`v0.0.0`) | Ember (`v7.3.0`) | Result |
| :--- | :---: | :---: | :---: | :--- |
| **01. Create 1,000 rows** | `160.1` *(22.8)* | `242.2` *(84.1)* | `375.8` *(210.3)* | ✅ DriftJS (~1.55× faster) |
| **02. Replace 1,000 rows** | `169.2` *(24.3)* | `249.9` *(106.6)* | `400.1` *(233.4)* | ✅ DriftJS (~1.60× faster) |
| **03. Update every 10th row (1k)** | `85.7` *(2.6)* | `246.4` *(72.6)* | `132.7` *(48.7)* | ❌ Ember (~1.85× faster) |
| **04. Select row (1k)** | `24.7` *(2.4)* | `121.0` *(71.9)* | `65.6` *(67.0)* | ❌ Ember (~1.84× faster) |
| **05. Swap rows (1k)** | `90.8` *(0.9)* | `119.0` *(11.0)* | `172.9` *(52.0)* | ✅ DriftJS (~1.45× faster) |
| **06. Remove single row (1k)** | `100.0` *(2.1)* | `101.3` *(7.5)* | `115.3` *(28.7)* | ✅ DriftJS (~1.14× faster) |
| **07. Create 10,000 rows** | `1336.6` *(183.2)* | `1842.9` *(515.4)* | `2746.1` *(1321.6)* | ✅ DriftJS (~1.49× faster) |
| **08. Append 1,000 rows to 1k** | `178.8` *(17.9)* | `261.5` *(89.5)* | `403.5` *(213.1)* | ✅ DriftJS (~1.54× faster) |
| **09. Clear 1,000 rows** | `56.0` *(64.2)* | `92.4` *(78.8)* | `144.3` *(131.2)* | ✅ DriftJS (~1.56× faster) |

### 2. Memory Footprint (in MB)

| Metric / Benchmark | VanillaJS | DriftJS (`v0.0.0`) | Ember (`v7.3.0`) | Result |
| :--- | :---: | :---: | :---: | :--- |
| **21. Ready Memory** | `0.55` | `0.68` | `5.37` | ✅ DriftJS (~7.9× less memory) |
| **22. Run Memory (1k rows)** | `1.90` | `2.70` | `11.93` | ✅ DriftJS (~4.4× less memory) |
| **25. Run-Clear Memory** | `0.62` | `1.04` | `6.27` | ✅ DriftJS (~6.0× less memory) |

### 3. Implementation Size & Startup

| Metric / Benchmark | VanillaJS | DriftJS (`v0.0.0`) | Ember (`v7.3.0`) | Result |
| :--- | :---: | :---: | :---: | :--- |
| **41. Uncompressed Size (kB)** | `11.3` | `33.1` | `136.7` | ✅ DriftJS (~4.1× smaller) |
| **42. Compressed Size (kB)** | `2.5` | `7.4` | `38.4` | ✅ DriftJS (~5.2× smaller) |
| **43. First Paint (ms)** | `219.9` | `283.1` | `470.2` | ✅ DriftJS (~1.66× faster) |

---

## 🏆 Level 2: React 19 (`react-hooks`) Comparison — DEFEATED

*Status: **DEFEATED** (DriftJS won 13 of 15 benchmarks including 7/9 CPU benchmarks, all memory benchmarks, and bundle size).*

### 1. CPU Benchmarks (Duration in ms)

| Metric / Benchmark | VanillaJS | DriftJS (`v0.0.0`) | React 19 (`react-hooks`) | Result |
| :--- | :---: | :---: | :---: | :--- |
| **01. Create 1,000 rows** | `160.1` *(22.8)* | `242.2` *(84.1)* | `364.3` *(88.3)* | ✅ DriftJS (~1.51× FASTER) |
| **02. Replace 1,000 rows** | `169.2` *(24.3)* | `249.9` *(106.6)* | `388.0` *(109.7)* | ✅ DriftJS (~1.55× FASTER) |
| **03. Update every 10th row (1k)** | `85.7` *(2.6)* | `246.4` *(72.6)* | `199.7` *(41.2)* | ❌ React (~1.23× faster) |
| **04. Select row (1k)** | `24.7` *(2.4)* | `121.0` *(71.9)* | `55.7` *(14.0)* | ❌ React (~2.17× faster) |
| **05. Swap rows (1k)** | `90.8` *(0.9)* | `119.0` *(11.0)* | `1,285.7` *(169.9)* | 🚀 DriftJS (~10.8× FASTER!) |
| **06. Remove single row (1k)** | `100.0` *(2.1)* | `101.3` *(7.5)* | `167.4` *(11.9)* | ✅ DriftJS (~1.65× FASTER) |
| **07. Create 10,000 rows** | `1,336.6` *(183.2)* | `1,842.9` *(515.4)* | `3,804.5` *(896.6)* | 🚀 DriftJS (~2.06× FASTER!) |
| **08. Append 1,000 rows to 1k** | `178.8` *(17.9)* | `261.5` *(89.5)* | `451.0` *(83.8)* | ✅ DriftJS (~1.72× FASTER) |
| **09. Clear 1,000 rows** | `56.0` *(64.2)* | `92.4` *(78.8)* | `282.0` *(224.7)* | 🚀 DriftJS (~3.05× FASTER!) |

### 2. Memory Footprint (in MB)

| Metric / Benchmark | VanillaJS | DriftJS (`v0.0.0`) | React 19 (`react-hooks`) | Result |
| :--- | :---: | :---: | :---: | :--- |
| **21. Ready Memory** | `0.55` | `0.59` | `1.16` | ✅ DriftJS (~1.7× less memory) |
| **22. Run Memory (1k rows)** | `1.90` | `2.70` | `4.45` | ✅ DriftJS (~1.65× less memory) |
| **25. Run-Clear Memory** | `0.62` | `1.04` | `1.96` | ✅ DriftJS (~1.88× less memory) |

### 3. Implementation Size & Startup

| Metric / Benchmark | VanillaJS | DriftJS (`v0.0.0`) | React 19 (`react-hooks`) | Result |
| :--- | :---: | :---: | :---: | :--- |
| **41. Uncompressed Size (kB)** | `11.3` | `33.1` | `190.3` | ✅ DriftJS (~5.75× smaller) |
| **42. Compressed Size (kB)** | `2.5` | `7.4` | `51.4` | ✅ DriftJS (~6.95× smaller) |
| **43. First Paint (ms)** | `219.9` | `283.1` | `1,041.2` | ✅ DriftJS (~3.68× faster) |
