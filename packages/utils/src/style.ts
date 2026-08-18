/**
 * List of CSS properties that are unitless numbers.
 */
const UNITLESS_PROPERTIES = new Set([
  'animationIterationCount',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
]);

/**
 * Converts camelCase property names to kebab-case (e.g., backgroundColor -> background-color).
 */
export function camelToKebab(str: string): string {
  if (str.startsWith('--')) return str;
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

/**
 * Normalizes a style input (string, object, or array of objects) into a valid CSS style string.
 *
 * @example
 * normalizeStyle({ backgroundColor: '#3b82f6', borderRadius: 12, opacity: 0.9 })
 * // returns "background-color: #3b82f6; border-radius: 12px; opacity: 0.9"
 */
export function normalizeStyle(value: any): string {
  if (value == null || value === false || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeStyle(item))
      .filter((s) => Boolean(s && s.length > 0))
      .join('; ');
  }

  if (typeof value === 'object') {
    const parts: string[] = [];
    for (const [key, rawVal] of Object.entries(value)) {
      if (rawVal == null || rawVal === false || rawVal === '') continue;

      const propName = camelToKebab(key);
      let propVal = rawVal;
      if (typeof rawVal === 'number' && rawVal !== 0 && !UNITLESS_PROPERTIES.has(key)) {
        propVal = `${rawVal}px`;
      }
      parts.push(`${propName}: ${propVal}`);
    }
    return parts.join('; ');
  }

  return String(value);
}
