/**
 * Computes the arithmetic mean of an array of numbers.
 * Note: Per project benchmark rules, only arithmetic mean is used across runs.
 */
export function computeMean(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;
  return Math.round(mean * 100) / 100;
}

/**
 * Formats a metric value with appropriate precision.
 */
export function formatValue(value: number | undefined, unit: string): string {
  if (value === undefined || Number.isNaN(value)) return '-';
  if (unit === 'MB' || unit === 'kB') {
    return value.toFixed(2);
  }
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}
