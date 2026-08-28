import { runBenchmarks } from './runner.js';
import { saveReport } from './reporter.js';
import { FRAMEWORKS } from './frameworks.js';
import type { RunOptions } from './types.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const defaultOutDir = resolve(__dirname, '../results');

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {
    runs: 5,
    warmup: 1,
    headless: true,
    port: 5200,
    trace: false,
    outputDir: defaultOutDir,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--runs' && args[i + 1]) {
      options.runs = parseInt(args[++i]!, 10);
    } else if (arg === '--warmup' && args[i + 1]) {
      options.warmup = parseInt(args[++i]!, 10);
    } else if (arg === '--frameworks' && args[i + 1]) {
      options.frameworks = args[++i]!.split(',').map(s => s.trim());
    } else if (arg === '--benchmarks' && args[i + 1]) {
      options.benchmarks = args[++i]!.split(',').map(s => s.trim());
    } else if (arg === '--out' && args[i + 1]) {
      options.outputDir = resolve(process.cwd(), args[++i]!);
    } else if (arg === '--no-headless' || arg === '--headed') {
      options.headless = false;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  console.log(`Starting benchmark execution with options:`, options);

  const selectedFrameworks = options.frameworks && options.frameworks.length > 0
    ? FRAMEWORKS.filter(f => options.frameworks!.includes(f.id))
    : FRAMEWORKS;

  const report = await runBenchmarks(options);
  const { htmlPath, jsonPath } = saveReport(report, selectedFrameworks, options.outputDir);

  console.log(`\n✅ Benchmarks complete!`);
  console.log(`📄 HTML Report: ${htmlPath}`);
  console.log(`📊 JSON Data:   ${jsonPath}\n`);
}

main().catch(err => {
  console.error(`❌ Benchmark error:`, err);
  process.exit(1);
});
