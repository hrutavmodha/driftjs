import type { BenchmarkDef, FrameworkDef } from './types.js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';

function getFrameworkBundleSizes(framework?: FrameworkDef): { uncompressedBytes: number; compressedBytes: number } {
  if (!framework) return { uncompressedBytes: 0, compressedBytes: 0 };
  let uncompressedBytes = 0;
  let compressedBytes = 0;

  const distAssets = resolve(framework.dir, 'dist/assets');
  if (existsSync(distAssets)) {
    const files = readdirSync(distAssets).filter(f => f.endsWith('.js'));
    for (const f of files) {
      const buf = readFileSync(resolve(distAssets, f));
      uncompressedBytes += buf.length;
      compressedBytes += gzipSync(buf).length;
    }
  } else {
    const mainJs = resolve(framework.dir, 'src/main.js');
    if (existsSync(mainJs)) {
      const buf = readFileSync(mainJs);
      uncompressedBytes += buf.length;
      compressedBytes += gzipSync(buf).length;
    }
  }

  return { uncompressedBytes, compressedBytes };
}

/**
 * Force garbage collection in Chromium via Chrome DevTools Protocol.
 */
async function forceGC(cdpSession: any) {
  if (cdpSession) {
    try {
      await cdpSession.send('HeapProfiler.collectGarbage');
    } catch {
      // Ignore if not supported
    }
  }
}

/**
 * Ensure table has exactly 1,000 rows.
 */
async function ensure1kRows(page: any) {
  const count = await page.locator('#tbody tr').count();
  if (count !== 1000) {
    await page.click('#run');
    await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 1000, { timeout: 15000 });
  }
}

export const BENCHMARKS: BenchmarkDef[] = [
  // ─── CPU Benchmarks ────────────────────────────────────────────────────────
  {
    id: '01_run1k',
    name: '01. Create 1,000 rows',
    category: 'cpu',
    description: 'Creates 1,000 table rows upon clicking #run.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await page.click('#clear').catch(() => {});
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 0, { timeout: 5000 }).catch(() => {});
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#run');
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 1000, { timeout: 15000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '02_replace1k',
    name: '02. Replace 1,000 rows',
    category: 'cpu',
    description: 'Replaces all 1,000 rows with 1,000 new rows.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#run');
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 1000, { timeout: 15000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '03_update10th1k',
    name: '03. Update every 10th row (1k)',
    category: 'cpu',
    description: 'Updates every 10th row in a table of 1,000 rows.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#update');
      await page.waitForFunction(() => {
        const text = document.querySelector('#tbody tr:first-child td:nth-child(2) a')?.textContent || '';
        return text.includes('!!!');
      }, { timeout: 15000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '04_select1k',
    name: '04. Select row (1k)',
    category: 'cpu',
    description: 'Selects the 2nd row in a table of 1,000 rows.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);

      const start = Date.now();
      await page.evaluate(() => {
        const el = document.querySelector('#tbody tr:nth-child(2) a.lbl') as HTMLElement;
        if (el) el.click();
      });
      await page.waitForFunction(() => {
        const tr = document.querySelector('#tbody tr:nth-child(2)');
        return tr && tr.classList.contains('danger');
      }, { timeout: 10000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '05_swap1k',
    name: '05. Swap rows (1k)',
    category: 'cpu',
    description: 'Swaps row 2 and row 999 in a table of 1,000 rows.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      const initialRow2Text = await page.locator('#tbody tr:nth-child(2) td:nth-child(2)').innerText();
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#swaprows');
      await page.waitForFunction((initial) => {
        const current = document.querySelector('#tbody tr:nth-child(2) td:nth-child(2)')?.textContent || '';
        return current !== initial;
      }, initialRow2Text, { timeout: 10000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '06_remove1k',
    name: '06. Remove single row (1k)',
    category: 'cpu',
    description: 'Removes the 2nd row from a table of 1,000 rows.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);

      const start = Date.now();
      await page.evaluate(() => {
        const el = document.querySelector('#tbody tr:nth-child(2) a.remove') as HTMLElement;
        if (el) el.click();
      });
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 999, { timeout: 10000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '07_create10k',
    name: '07. Create 10,000 rows',
    category: 'cpu',
    description: 'Creates 10,000 rows on an empty table.',
    unit: 'ms',
    warmupRuns: 1,
    run: async (page, cdpSession) => {
      await page.click('#clear').catch(() => {});
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 0, { timeout: 5000 }).catch(() => {});
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#runlots');
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 10000, { timeout: 30000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '08_append1k',
    name: '08. Append 1,000 rows to 1k',
    category: 'cpu',
    description: 'Appends 1,000 rows to a table with 1,000 rows (total 2k rows).',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#add');
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 2000, { timeout: 15000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },
  {
    id: '09_clear1k',
    name: '09. Clear 1,000 rows',
    category: 'cpu',
    description: 'Clears all 1,000 rows from the table.',
    unit: 'ms',
    warmupRuns: 2,
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);

      const start = Date.now();
      await page.click('#clear');
      await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 0, { timeout: 10000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
      return Date.now() - start;
    },
  },

  // ─── Memory Benchmarks ─────────────────────────────────────────────────────
  {
    id: '21_readyMemory',
    name: '21. Ready Memory',
    category: 'memory',
    description: 'JS Heap memory usage immediately after loading the page.',
    unit: 'MB',
    run: async (page, cdpSession) => {
      await forceGC(cdpSession);
      const heapBytes = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
      return Math.round((heapBytes / (1024 * 1024)) * 100) / 100;
    },
  },
  {
    id: '22_runMemory',
    name: '22. Run Memory (1k rows)',
    category: 'memory',
    description: 'JS Heap memory usage after rendering 1,000 rows.',
    unit: 'MB',
    run: async (page, cdpSession) => {
      await ensure1kRows(page);
      await forceGC(cdpSession);
      const heapBytes = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
      return Math.round((heapBytes / (1024 * 1024)) * 100) / 100;
    },
  },
  {
    id: '25_clearMemory',
    name: '25. Run-Clear Memory',
    category: 'memory',
    description: 'JS Heap memory usage after creating and clearing 1k rows 5 times.',
    unit: 'MB',
    run: async (page, cdpSession) => {
      for (let i = 0; i < 5; i++) {
        await page.click('#run');
        await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 1000, { timeout: 10000 });
        await page.click('#clear');
        await page.waitForFunction(() => document.querySelectorAll('#tbody tr').length === 0, { timeout: 10000 });
      }
      await forceGC(cdpSession);
      const heapBytes = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
      return Math.round((heapBytes / (1024 * 1024)) * 100) / 100;
    },
  },

  // ─── Startup & Size Benchmarks ─────────────────────────────────────────────
  {
    id: '41_uncompressedSize',
    name: '41. Uncompressed Size',
    category: 'startup',
    description: 'Total uncompressed JS bundle size on disk.',
    unit: 'kB',
    run: async (page, cdpSession, config, framework) => {
      const { uncompressedBytes } = getFrameworkBundleSizes(framework);
      return Math.round((uncompressedBytes / 1024) * 10) / 10;
    },
  },
  {
    id: '42_compressedSize',
    name: '42. Compressed Size',
    category: 'startup',
    description: 'Total gzipped JS bundle size.',
    unit: 'kB',
    run: async (page, cdpSession, config, framework) => {
      const { compressedBytes } = getFrameworkBundleSizes(framework);
      return Math.round((compressedBytes / 1024) * 10) / 10;
    },
  },
  {
    id: '43_firstPaint',
    name: '43. First Paint',
    category: 'startup',
    description: 'Time in ms to First Contentful Paint / Initial Paint.',
    unit: 'ms',
    run: async (page) => {
      const paintTime = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint');
        const fcp = entries.find((e) => e.name === 'first-contentful-paint') || entries[0];
        return fcp ? fcp.startTime : performance.timing.domInteractive - performance.timing.navigationStart;
      });
      return Math.round(paintTime * 10) / 10;
    },
  },
];
