import { chromium, type Browser, type Page } from 'playwright';
import { BENCHMARKS } from './benchmarks.js';
import { FRAMEWORKS } from './frameworks.js';
import { startFrameworkServer } from './server.js';
import { computeMean } from './stats.js';
import type { BenchmarkReport, BenchmarkSummaryTable, BenchmarkRawResult, RunOptions, FrameworkDef, BenchmarkDef } from './types.js';

export async function runBenchmarks(options: RunOptions): Promise<BenchmarkReport> {
  const selectedFrameworks = options.frameworks && options.frameworks.length > 0
    ? FRAMEWORKS.filter(f => options.frameworks!.includes(f.id))
    : FRAMEWORKS;

  const selectedBenchmarks = options.benchmarks && options.benchmarks.length > 0
    ? BENCHMARKS.filter(b => options.benchmarks!.includes(b.id))
    : BENCHMARKS;

  console.log(`\n🚀 Starting DriftJS Benchmark Suite`);
  console.log(`📊 Frameworks (${selectedFrameworks.length}): ${selectedFrameworks.map(f => f.name).join(', ')}`);
  console.log(`🧪 Benchmarks (${selectedBenchmarks.length}): ${selectedBenchmarks.map(b => b.id).join(', ')}`);
  console.log(`🔁 Iterations: ${options.runs} runs per test (Aggregation: Mean)\n`);

  const browser: Browser = await chromium.launch({
    headless: options.headless,
    args: [
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-component-extensions-with-background-pages',
      '--disable-extensions',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-ipc-flooding-protection',
      '--disable-renderer-backgrounding',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--mute-audio',
    ],
  });

  const rawResults: BenchmarkRawResult[] = [];

  for (const framework of selectedFrameworks) {
    console.log(`\n🔹 Testing Framework: ${framework.name}`);
    let serverInstance: any = null;
    let frameworkUrl: string = '';

    try {
      const { server, url } = await startFrameworkServer(framework);
      serverInstance = server;
      frameworkUrl = url;
    } catch (err: any) {
      console.error(`❌ Failed to start server for ${framework.name}:`, err.message);
      continue;
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page: Page = await context.newPage();
    let cdpSession: any = null;
    try {
      cdpSession = await context.newCDPSession(page);
      await cdpSession.send('HeapProfiler.enable');
    } catch {
      // CDP fallback if not supported
    }

    for (const benchmark of selectedBenchmarks) {
      process.stdout.write(`   • [${benchmark.id}] ${benchmark.name} ... `);
      const measuredValues: number[] = [];

      try {
        // Warmup runs
        const warmupCount = benchmark.warmupRuns ?? options.warmup ?? 1;
        for (let w = 0; w < warmupCount; w++) {
          await page.goto(frameworkUrl, { waitUntil: 'networkidle' });
          await benchmark.run(page, cdpSession, options, framework);
        }

        // Measurement runs
        const runCount = benchmark.runs ?? options.runs ?? 5;
        for (let r = 0; r < runCount; r++) {
          await page.goto(frameworkUrl, { waitUntil: 'networkidle' });
          const val = await benchmark.run(page, cdpSession, options, framework);
          measuredValues.push(val);
        }

        const mean = computeMean(measuredValues);
        const runsInfo = measuredValues.length === 1 ? `1 run` : `runs: [${measuredValues.join(', ')}]`;
        console.log(`Mean: ${mean} ${benchmark.unit} (${runsInfo})`);

        rawResults.push({
          benchmarkId: benchmark.id,
          benchmarkName: benchmark.name,
          category: benchmark.category,
          unit: benchmark.unit,
          frameworkId: framework.id,
          frameworkName: framework.name,
          values: measuredValues,
          mean,
        });
      } catch (err: any) {
        console.log(`FAILED (${err.message})`);
      }
    }

    await page.close();
    await context.close();
    if (serverInstance) {
      await serverInstance.close();
    }
  }

  await browser.close();

  // Aggregate results into category tables
  const categories: { category: 'cpu' | 'memory' | 'startup'; title: string }[] = [
    { category: 'cpu', title: '1. CPU Benchmarks (Duration in ms)' },
    { category: 'memory', title: '2. Memory Footprint (in MB)' },
    { category: 'startup', title: '3. Implementation Size & Startup' },
  ];

  const headers = ['Metric / Benchmark', 'Unit', ...selectedFrameworks.map(f => f.name)];

  const tables: BenchmarkSummaryTable[] = categories.map(({ category, title }) => {
    const categoryBenchmarks = selectedBenchmarks.filter(b => b.category === category);
    const rows = categoryBenchmarks.map(b => {
      const values: Record<string, number> = {};
      const factors: Record<string, number> = {};

      for (const f of selectedFrameworks) {
        const result = rawResults.find(r => r.benchmarkId === b.id && r.frameworkId === f.id);
        if (result) {
          values[f.id] = result.mean;
        }
      }

      const baseline = values['vanilla'];
      if (baseline) {
        for (const [k, v] of Object.entries(values)) {
          factors[k] = Math.round((v / baseline) * 100) / 100;
        }
      }

      return {
        id: b.id,
        name: b.name,
        description: b.description,
        unit: b.unit,
        values,
        factors,
      };
    });

    return {
      category,
      title,
      headers,
      rows,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    runs: options.runs,
    tables,
    rawResults,
  };
}
