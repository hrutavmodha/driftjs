export type BenchmarkCategory = 'cpu' | 'memory' | 'startup';

export interface BenchmarkDef {
  id: string;
  name: string;
  category: BenchmarkCategory;
  description: string;
  unit: string;
  run: (page: any, cdpSession: any, config: RunOptions, framework?: FrameworkDef) => Promise<number>;
  warmupRuns?: number;
}

export interface FrameworkDef {
  id: string;
  name: string;
  dir: string;
  port: number;
}

export interface RunOptions {
  runs: number;
  warmup: number;
  headless: boolean;
  port: number;
  trace: boolean;
  frameworks?: string[];
  benchmarks?: string[];
  outputDir: string;
}

export interface BenchmarkRawResult {
  benchmarkId: string;
  benchmarkName: string;
  category: BenchmarkCategory;
  unit: string;
  frameworkId: string;
  frameworkName: string;
  values: number[]; // raw measured values across runs
  mean: number;     // arithmetic mean ONLY as specified
}

export interface BenchmarkSummaryTable {
  category: BenchmarkCategory;
  title: string;
  headers: string[]; // ['Benchmark', 'VanillaJS', 'DriftJS', 'React 19', ...]
  rows: {
    id: string;
    name: string;
    description: string;
    unit: string;
    values: Record<string, number>; // frameworkId -> mean value
    factors: Record<string, number>; // frameworkId -> relative factor to baseline (VanillaJS)
  }[];
}

export interface BenchmarkReport {
  timestamp: string;
  runs: number;
  tables: BenchmarkSummaryTable[];
  rawResults: BenchmarkRawResult[];
}
