import type {
  RouteRecordRaw,
  RouteRecordNormalized,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteParams,
  RouteQuery,
  RouteComponent,
} from '../types/index.js';

/**
 * Safely decodes a URI component.
 */
function safeDecode(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Parses a search query string into a RouteQuery object.
 */
export function parseQuery(search: string): RouteQuery {
  const query: RouteQuery = {};
  if (!search) return query;

  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return query;

  const pairs = raw.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    let key: string;
    let val: string | null = null;

    if (eqIdx === -1) {
      key = safeDecode(pair);
      val = null;
    } else {
      key = safeDecode(pair.slice(0, eqIdx));
      val = safeDecode(pair.slice(eqIdx + 1));
    }

    if (key in query) {
      const existing = query[key];
      if (Array.isArray(existing)) {
        existing.push(val ?? '');
      } else if (existing !== undefined) {
        query[key] = [existing as string, val ?? ''];
      }
    } else {
      query[key] = val;
    }
  }

  return query;
}

/**
 * Serializes a RouteQuery object into an encoded search query string.
 */
export function stringifyQuery(query: RouteQuery): string {
  const keys = Object.keys(query);
  if (keys.length === 0) return '';

  const parts: string[] = [];
  for (const key of keys) {
    const val = query[key];
    if (val === undefined) continue;

    const encKey = encodeURIComponent(key);
    if (val === null) {
      parts.push(encKey);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (item === null || item === undefined) {
          parts.push(encKey);
        } else {
          parts.push(`${encKey}=${encodeURIComponent(item)}`);
        }
      }
    } else {
      parts.push(`${encKey}=${encodeURIComponent(val)}`);
    }
  }

  return parts.length > 0 ? '?' + parts.join('&') : '';
}

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

interface PathTokens {
  regex: RegExp;
  paramNames: string[];
  score: number;
}

/**
 * Compiles a path pattern string into a RegExp and parameter list.
 */
export function compilePathToRegex(path: string): PathTokens {
  const paramNames: string[] = [];
  let score = 0;

  if (path === '/' || path === '') {
    return {
      regex: /^\/?$/,
      paramNames: [],
      score: 1000,
    };
  }

  const segments = path.split('/').filter(Boolean);
  const regexParts: string[] = [];

  for (const segment of segments) {
    if (segment === '*' || segment === '/*') {
      paramNames.push('pathMatch');
      regexParts.push('(?:/(.*))?');
      score += 1;
    } else if (segment.startsWith(':')) {
      const isOptional = segment.endsWith('?');
      const isRepeatable = segment.endsWith('*') || segment.endsWith('+');
      let paramName = segment.slice(1);

      // Check for custom regex constraint like :id(\\d+)
      const regexMatch = paramName.match(/^([a-zA-Z0-9_]+)\((.*)\)[?*+]?$/);
      if (regexMatch && regexMatch[1] && regexMatch[2]) {
        paramName = regexMatch[1];
        paramNames.push(paramName);
        if (isOptional) {
          regexParts.push(`(?:/(${regexMatch[2]}))?`);
          score += 25;
        } else {
          regexParts.push(`/(${regexMatch[2]})`);
          score += 30;
        }
      } else {
        if (isOptional || isRepeatable) {
          paramName = paramName.replace(/[?*+]$/, '');
        }
        paramNames.push(paramName);

        if (isRepeatable) {
          regexParts.push('(?:/(.*))?');
          score += 5;
        } else if (isOptional) {
          regexParts.push('(?:/([^/]+))?');
          score += 15;
        } else {
          regexParts.push('/([^/]+)');
          score += 20;
        }
      }
    } else {
      // Static segment
      regexParts.push('/' + segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      score += 100;
    }
  }

  const regexStr = '^' + regexParts.join('') + '/?$';
  return {
    regex: new RegExp(regexStr),
    paramNames,
    score,
  };
}

/**
 * Creates a normalized route record hierarchy.
 */
export function normalizeRouteRecord(
  raw: RouteRecordRaw,
  parent?: RouteRecordNormalized
): RouteRecordNormalized {
  let fullPath = raw.path;
  if (parent) {
    if (raw.path.startsWith('/')) {
      fullPath = normalizePath(raw.path);
    } else {
      const parentPath = parent.path === '/' ? '' : parent.path;
      fullPath = normalizePath(`${parentPath}/${raw.path}`);
    }
  } else {
    fullPath = normalizePath(raw.path);
  }

  const { regex, paramNames } = compilePathToRegex(fullPath);

  const components: Record<string, RouteComponent> = {};
  if (raw.components) {
    Object.assign(components, raw.components);
  } else if (raw.component) {
    components['default'] = raw.component;
  }

  const beforeEnter: RouteRecordNormalized['beforeEnter'] = raw.beforeEnter
    ? Array.isArray(raw.beforeEnter)
      ? raw.beforeEnter
      : [raw.beforeEnter]
    : undefined;

  let propsRecord: RouteRecordNormalized['props'] = {};
  if (typeof raw.props === 'boolean' || typeof raw.props === 'function') {
    propsRecord['default'] = raw.props;
  } else if (raw.props && typeof raw.props === 'object') {
    propsRecord = raw.props;
  }

  const normalized: RouteRecordNormalized = {
    path: fullPath,
    name: raw.name,
    components,
    children: [],
    meta: raw.meta || {},
    beforeEnter,
    props: propsRecord,
    parent,
    regex,
    paramNames,
    redirect: raw.redirect,
  };

  if (raw.children && raw.children.length > 0) {
    normalized.children = raw.children.map((child) => normalizeRouteRecord(child, normalized));
  }

  return normalized;
}

export interface RouteMatcher {
  resolve(to: RouteLocationRaw, currentLocation?: RouteLocationNormalized): RouteLocationNormalized;
  addRoute(parentOrRoute: string | RouteRecordRaw, route?: RouteRecordRaw): () => void;
  removeRoute(name: string): void;
  hasRoute(name: string): boolean;
  getRoutes(): RouteRecordNormalized[];
}

/**
 * Creates the route matching engine with hierarchy resolution and scored priority matching.
 */
export function createMatcher(routes: readonly RouteRecordRaw[]): RouteMatcher {
  let normalizedRoutes: RouteRecordNormalized[] = [];
  const nameMap = new Map<string, RouteRecordNormalized>();
  const rootRecordList: RouteRecordNormalized[] = [];

  function flattenRoutes(record: RouteRecordNormalized, list: RouteRecordNormalized[]) {
    list.push(record);
    if (record.name) {
      nameMap.set(record.name, record);
    }
    for (const child of record.children) {
      flattenRoutes(child, list);
    }
  }

  function rebuildIndex() {
    nameMap.clear();
    const flattened: RouteRecordNormalized[] = [];
    for (const rootRecord of rootRecordList) {
      flattenRoutes(rootRecord, flattened);
    }
    // Sort routes by score descending so more specific routes match first
    normalizedRoutes = flattened.sort((a, b) => {
      const scoreA = compilePathToRegex(a.path).score;
      const scoreB = compilePathToRegex(b.path).score;
      return scoreB - scoreA;
    });
  }

  for (const raw of routes) {
    rootRecordList.push(normalizeRouteRecord(raw));
  }
  rebuildIndex();

  function matchPath(path: string): { record: RouteRecordNormalized | null; params: RouteParams } {
    const normPath = normalizePath(path);
    for (const record of normalizedRoutes) {
      const match = normPath.match(record.regex);
      if (match) {
        const params: RouteParams = {};
        for (let i = 0; i < record.paramNames.length; i++) {
          const key = record.paramNames[i]!;
          const rawVal = match[i + 1];
          params[key] = rawVal !== undefined ? safeDecode(rawVal) : '';
        }
        return { record, params };
      }
    }
    return { record: null, params: {} };
  }

  function resolve(
    to: RouteLocationRaw,
    currentLocation?: RouteLocationNormalized
  ): RouteLocationNormalized {
    let targetPath = '/';
    let query: RouteQuery = {};
    let hash = '';
    let params: RouteParams = {};
    let name: string | undefined;

    if (typeof to === 'string') {
      const hashIdx = to.indexOf('#');
      let pathAndQuery = to;
      if (hashIdx !== -1) {
        hash = to.slice(hashIdx);
        pathAndQuery = to.slice(0, hashIdx);
      }
      const queryIdx = pathAndQuery.indexOf('?');
      if (queryIdx !== -1) {
        query = parseQuery(pathAndQuery.slice(queryIdx));
        targetPath = pathAndQuery.slice(0, queryIdx);
      } else {
        targetPath = pathAndQuery;
      }
    } else {
      if (to.name) {
        name = to.name;
        const namedRecord = nameMap.get(name);
        if (namedRecord) {
          targetPath = namedRecord.path;
          params = { ...(to.params || {}) };
          // Interpolate params into targetPath
          for (const key of Object.keys(params)) {
            const val = params[key];
            const strVal = Array.isArray(val) ? val.join('/') : String(val);
            targetPath = targetPath.replace(`:${key}`, strVal);
          }
        }
      } else if (to.path) {
        targetPath = to.path;
      }
      if (to.query) {
        query = { ...to.query };
      }
      if (to.hash) {
        hash = to.hash.startsWith('#') ? to.hash : '#' + to.hash;
      }
      if (to.params) {
        params = { ...params, ...to.params };
      }
    }

    targetPath = normalizePath(targetPath);

    // Match path against route records
    const { record, params: matchedParams } = matchPath(targetPath);
    const mergedParams = { ...matchedParams, ...params };

    // Build matched hierarchy from root parent to leaf
    const matched: RouteRecordNormalized[] = [];
    if (record) {
      let curr: RouteRecordNormalized | undefined = record;
      while (curr) {
        matched.unshift(curr);
        curr = curr.parent;
      }
    }

    const queryStr = stringifyQuery(query);
    const fullPath = targetPath + queryStr + hash;

    return {
      path: targetPath,
      fullPath,
      query,
      hash,
      params: mergedParams,
      name: record?.name || name,
      matched,
      meta: record?.meta || {},
      href: fullPath,
    };
  }

  return {
    resolve,
    addRoute(parentOrRoute: string | RouteRecordRaw, route?: RouteRecordRaw): () => void {
      if (typeof parentOrRoute === 'string' && route) {
        const parent = nameMap.get(parentOrRoute);
        if (parent) {
          const norm = normalizeRouteRecord(route, parent);
          parent.children.push(norm);
          rebuildIndex();
          return () => {
            const idx = parent.children.indexOf(norm);
            if (idx !== -1) {
              parent.children.splice(idx, 1);
              rebuildIndex();
            }
          };
        }
      } else if (typeof parentOrRoute === 'object') {
        const norm = normalizeRouteRecord(parentOrRoute);
        rootRecordList.push(norm);
        rebuildIndex();
        return () => {
          const idx = rootRecordList.indexOf(norm);
          if (idx !== -1) {
            rootRecordList.splice(idx, 1);
            rebuildIndex();
          }
        };
      }
      return () => {};
    },
    removeRoute(name: string): void {
      const record = nameMap.get(name);
      if (record) {
        if (record.parent) {
          const idx = record.parent.children.indexOf(record);
          if (idx !== -1) record.parent.children.splice(idx, 1);
        } else {
          const idx = rootRecordList.indexOf(record);
          if (idx !== -1) rootRecordList.splice(idx, 1);
        }
        rebuildIndex();
      }
    },
    hasRoute(name: string): boolean {
      return nameMap.has(name);
    },
    getRoutes(): RouteRecordNormalized[] {
      return [...normalizedRoutes];
    },
  };
}
