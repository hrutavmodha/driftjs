import type { BenchmarkReport } from './types.js';
import { FRAMEWORKS } from './frameworks.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function normalizeId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function saveReport(report: BenchmarkReport, outputDir: string): { jsonPath: string } {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, 'results.json');

  let finalReport = report;

  if (existsSync(jsonPath)) {
    try {
      const existing: BenchmarkReport = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      if (existing && Array.isArray(existing.tables)) {
        for (const newTable of report.tables) {
          const existingTable = existing.tables.find(t => t.category === newTable.category);
          if (existingTable) {
            // Merge rows with normalized id matching
            for (const newRow of newTable.rows) {
              const normNewId = normalizeId(newRow.id);
              const existingRow = existingTable.rows.find(r => normalizeId(r.id) === normNewId);

              if (existingRow) {
                existingRow.id = newRow.id;
                existingRow.name = newRow.name;
                existingRow.description = newRow.description;
                existingRow.unit = newRow.unit;

                Object.assign(existingRow.values, newRow.values);

                const baseline = existingRow.values['vanilla'];
                if (baseline) {
                  for (const [k, v] of Object.entries(existingRow.values)) {
                    existingRow.factors[k] = Math.round((v / baseline) * 100) / 100;
                  }
                }
              } else {
                existingTable.rows.push(newRow);
              }
            }

            // Collect all framework IDs present across rows
            const presentFrameworkIds = new Set<string>();
            for (const row of existingTable.rows) {
              for (const fwId of Object.keys(row.values)) {
                presentFrameworkIds.add(fwId);
              }
            }

            // Build canonical ordered headers
            const orderedHeaders = ['Metric / Benchmark', 'Unit'];
            for (const fw of FRAMEWORKS) {
              if (presentFrameworkIds.has(fw.id)) {
                orderedHeaders.push(fw.name);
              }
            }
            for (const row of existingTable.rows) {
              for (const fwId of Object.keys(row.values)) {
                const fwDef = FRAMEWORKS.find(f => f.id === fwId);
                const name = fwDef ? fwDef.name : fwId;
                if (!orderedHeaders.includes(name)) {
                  orderedHeaders.push(name);
                }
              }
            }

            existingTable.headers = orderedHeaders;
          } else {
            existing.tables.push(newTable);
          }
        }
        existing.timestamp = report.timestamp;
        existing.runs = report.runs;
        finalReport = existing;
      }
    } catch {
      // Fallback to fresh report
    }
  }

  const jsonContent = JSON.stringify(finalReport, null, 2);
  writeFileSync(jsonPath, jsonContent, 'utf-8');

  // Also sync to dist if dist folder exists
  const distDir = resolve(outputDir, '../dist');
  if (existsSync(distDir)) {
    try {
      writeFileSync(resolve(distDir, 'results.json'), jsonContent, 'utf-8');
    } catch {}
  }

  return { jsonPath };
}
