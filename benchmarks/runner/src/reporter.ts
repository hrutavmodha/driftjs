import type { BenchmarkReport } from './types.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export function saveReport(report: BenchmarkReport, outputDir: string): { jsonPath: string } {
  mkdirSync(outputDir, { recursive: true });

  const jsonContent = JSON.stringify(report, null, 2);
  const jsonPath = resolve(outputDir, 'results.json');
  writeFileSync(jsonPath, jsonContent, 'utf-8');

  return { jsonPath };
}
