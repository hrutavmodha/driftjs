import type {
  RouteRecordRaw,
  RouteRecordNormalized,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteParams,
  RouteQuery,
  RouteComponent,
} from '../types/index.js';
import { normalizePath } from './path.js';

export { normalizePath };

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
 * Parses a search query string into a RouteQuery object using URLSearchParams.
 */
export function parseQuery(search: string): RouteQuery {
  const query: RouteQuery = Object.create(null);
  if (!search) return query;

  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return query;

  const params = new URLSearchParams(raw);
  const seenKeys = new Set<string>();

  for (const key of params.keys()) {
    if (key === '__proto__' || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const values = params.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] ?? null);
  }

  // Handle boolean flags without '=' (e.g. '?flag&tag=a')
  for (const segment of raw.split('&')) {
    if (!segment) continue;
    const eqIdx = segment.indexOf('=');
    if (eqIdx === -1) {
      try {
        const decoded = decodeURIComponent(segment);
        if (decoded !== '__proto__' && query[decoded] === '') {
          query[decoded] = null;
        }
      } catch {
        if (segment !== '__proto__' && query[segment] === '') {
          query[segment] = null;
        }
      }
    }
  }

  return query;
}

/**
 * Serializes a RouteQuery object into an encoded search query string using URLSearchParams.
 */
export function stringifyQuery(query: RouteQuery): string {
  const keys = Object.keys(query);
  if (keys.length === 0) return '';

  const parts: string[] = [];
  for (const key of keys) {
    if (key === '__proto__') continue;
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


import { pathToRegexp, compile as compilePath, type Key } from 'path-to-regexp';

function sanitizeForPathToRegexp(path: string): string {
  const res = path.replace(/\/\*$/, '/(.*)');
  let i = 0;
  let out = '';
  while (i < res.length) {
    if (res[i] === ':' && /[a-zA-Z0-9_$]/.test(res[i + 1] || '')) {
      let pName = '';
      i++;
      while (i < res.length && /[a-zA-Z0-9_$]/.test(res[i]!)) {
        pName += res[i]!;
        i++;
      }
      if (res[i] === '(') {
        let depth = 1;
        let cReg = '';
        i++;
        while (i < res.length && depth > 0) {
          if (res[i] === '\\') {
            cReg += res[i]! + (res[i + 1] || '');
            i += 2;
            continue;
          }
          if (res[i] === '(') {
            depth++;
            cReg += '(?:';
            i++;
            continue;
          }
          if (res[i] === ')') {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          cReg += res[i]!;
          i++;
        }
        out += `:${pName}(${cReg})`;
      } else {
        out += `:${pName}`;
      }
    } else {
      out += res[i]!;
      i++;
    }
  }
  return out;
}

function interpolatePathParams(path: string, params: Record<string, any>): string {
  const cleanParams: Record<string, any> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      cleanParams[k] = v;
    }
  }

  try {
    const normalized = sanitizeForPathToRegexp(path.replace(/\/\*$/, '/:pathMatch(.*)'));
    const toPath = compilePath(normalized, { validate: false, encode: (v) => v });
    return toPath(cleanParams);
  } catch {
    let result = path;
    for (const [k, v] of Object.entries(cleanParams)) {
      if (k === 'pathMatch') {
        result = result.replace(/\/\*$/, '/' + (Array.isArray(v) ? v.join('/') : String(v)));
      } else {
        result = result.replace(new RegExp(`:${k}\\b(?:\\([^)]+\\))?[?*+]?`, 'g'), Array.isArray(v) ? v.join('/') : String(v));
      }
    }
    result = result.replace(/\/:[a-zA-Z0-9_$]+\?/g, '').replace(/:[a-zA-Z0-9_$]+\?/g, '');
    return result;
  }
}

interface PathTokens {
  regex: RegExp;
  paramNames: string[];
  score: number;
}

/**
 * Compiles a path pattern string into a RegExp and parameter list using path-to-regexp.
 */
export function compilePathToRegex(path: string): PathTokens {
  if (path === '/' || path === '') {
    return {
      regex: /^\/?$/,
      paramNames: [],
      score: 1000,
    };
  }

  const normalized = sanitizeForPathToRegexp(path);
  const keys: Key[] = [];
  const regex = pathToRegexp(normalized, keys, {
    sensitive: false,
    strict: false,
    end: true,
  });

  const paramNames = keys.map((k) => (typeof k.name === 'number' ? 'pathMatch' : String(k.name)));

  let score = 0;
  for (const segment of path.split('/').filter(Boolean)) {
    if (segment === '*' || segment.includes('(.*)')) {
      score += 1;
    } else if (segment.includes(':')) {
      if (segment.includes('(')) {
        score += 30;
      } else if (segment.includes('?')) {
        score += 15;
      } else {
        score += 20;
      }
    } else {
      score += 100;
    }
  }

  return {
    regex,
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

  const { regex, paramNames, score } = compilePathToRegex(fullPath);

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
    score,
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
    // Sort routes by pre-computed score descending so more specific routes match first
    normalizedRoutes = flattened.sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
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
          targetPath = interpolatePathParams(targetPath, params);
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
