/**
 * Normalizes a URL path string (strips redundant slashes and trailing slashes).
 */
export function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  let norm = path.replace(/\/+/g, '/');
  if (!norm.startsWith('/')) norm = '/' + norm;
  if (norm.length > 1 && norm.endsWith('/')) norm = norm.slice(0, -1);
  return norm;
}

/**
 * Normalizes a base URL to ensure consistent leading and no redundant trailing slashes.
 */
export function normalizeBase(base?: string): string {
  if (!base) return '';
  let normalized = base.trim();
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized === '/' ? '' : normalized;
}

/**
 * Strips the base path from the beginning of a pathname.
 */
export function stripBase(pathname: string, base: string): string {
  if (!base) return pathname;
  if (pathname.startsWith(base)) {
    const stripped = pathname.slice(base.length);
    return stripped.startsWith('/') ? stripped : '/' + stripped;
  }
  return pathname;
}

/**
 * Constructs a full URL href by combining the base path with the location.
 */
export function createHref(base: string, location: string): string {
  const normLoc = location.startsWith('/') ? location : '/' + location;
  return base ? base + normLoc : normLoc;
}

/**
 * Constructs a full hash URL href by combining the base path with the hash location.
 */
export function formatHashHref(base: string, location: string): string {
  const cleanLoc = location.startsWith('/') ? location : '/' + location;
  return (base ? base : '') + '#' + cleanLoc;
}
