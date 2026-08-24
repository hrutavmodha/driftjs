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
  const query: RouteQuery = Object.create(null);
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

    if (key === '__proto__') continue;

    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const existing = query[key];
      if (Array.isArray(existing)) {
        (existing as (string | null)[]).push(val);
      } else if (existing !== undefined) {
        query[key] = [existing as string | null, val];
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

function interpolatePathParams(path: string, params: Record<string, any>): string {
  let result = '';
  let i = 0;
  const len = path.length;

  while (i < len) {
    const ch = path[i]!;

    if (ch === '/') {
      // Check for wildcard /*
      if (path[i + 1] === '*') {
        if ('pathMatch' in params) {
          const val = params['pathMatch'];
          if (val !== undefined && val !== null) {
            result += '/' + (Array.isArray(val) ? val.join('/') : String(val));
          }
        }
        i += 2;
        continue;
      }
      // Check for optional param following /: e.g. /:id? or /:id(\d+)?
      if (path[i + 1] === ':') {
        let peek = i + 2;
        let pName = '';
        while (peek < len && /[a-zA-Z0-9_$]/.test(path[peek]!)) {
          pName += path[peek]!;
          peek++;
        }
        if (peek < len && path[peek] === '(') {
          peek++;
          let depth = 1;
          while (peek < len && depth > 0) {
            if (path[peek] === '\\') {
              peek += 2;
              continue;
            }
            if (path[peek] === '(') depth++;
            if (path[peek] === ')') {
              depth--;
              if (depth === 0) {
                peek++;
                break;
              }
            }
            peek++;
          }
        }
        let modifier = '';
        if (peek < len && (path[peek] === '?' || path[peek] === '*' || path[peek] === '+')) {
          modifier = path[peek]!;
          peek++;
        }

        if (modifier === '?' && (peek === len || path[peek] === '/')) {
          const val = params[pName];
          if (val !== undefined && val !== null) {
            result += '/' + (Array.isArray(val) ? val.join('/') : String(val));
          }
          i = peek;
          continue;
        }
      }

      result += '/';
      i++;
      continue;
    }

    if (ch === '*') {
      if ('pathMatch' in params) {
        const val = params['pathMatch'];
        if (val !== undefined && val !== null) {
          result += Array.isArray(val) ? val.join('/') : String(val);
        }
      }
      i++;
      continue;
    }

    if (ch === ':') {
      i++;
      let paramName = '';
      while (i < len && /[a-zA-Z0-9_$]/.test(path[i]!)) {
        paramName += path[i]!;
        i++;
      }

      if (i < len && path[i] === '(') {
        i++;
        let depth = 1;
        while (i < len && depth > 0) {
          if (path[i] === '\\') {
            i += 2;
            continue;
          }
          if (path[i] === '(') depth++;
          if (path[i] === ')') {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          i++;
        }
      }

      if (i < len && (path[i] === '?' || path[i] === '*' || path[i] === '+')) {
        i++;
      }

      if (paramName in params) {
        const val = params[paramName];
        if (val !== undefined && val !== null) {
          result += Array.isArray(val) ? val.join('/') : String(val);
        }
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

interface PathTokens {
  regex: RegExp;
  paramNames: string[];
  score: number;
}

function toNonCapturing(pattern: string): string {
  let result = '';
  let inCharClass = false;
  let isEscaped = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;

    if (isEscaped) {
      result += ch;
      isEscaped = false;
      continue;
    }

    if (ch === '\\') {
      result += ch;
      isEscaped = true;
      continue;
    }

    if (inCharClass) {
      result += ch;
      if (ch === ']') {
        inCharClass = false;
      }
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      result += ch;
      continue;
    }

    if (ch === '(') {
      if (pattern[i + 1] === '?') {
        result += ch;
      } else {
        result += '(?:';
      }
      continue;
    }

    result += ch;
  }

  return result;
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

  let regexStr = '^';
  let i = 0;
  const len = path.length;

  while (i < len) {
    const ch = path[i]!;

    if (ch === '/') {
      // Wildcard /*
      if (path[i + 1] === '*') {
        paramNames.push('pathMatch');
        regexStr += '(?:/(.*))?';
        score += 1;
        i += 2;
        continue;
      }

      // Check if following parameter is an optional segment (e.g. /:id? or /:id(\d+)?)
      if (path[i + 1] === ':') {
        let peek = i + 2;
        let pName = '';
        while (peek < len && /[a-zA-Z0-9_$]/.test(path[peek]!)) {
          pName += path[peek]!;
          peek++;
        }

        let customRegex: string | null = null;
        if (peek < len && path[peek] === '(') {
          peek++;
          let depth = 1;
          let inCharClass = false;
          let isEscaped = false;
          let cReg = '';
          while (peek < len && depth > 0) {
            const c = path[peek]!;
            if (isEscaped) {
              cReg += c;
              isEscaped = false;
              peek++;
              continue;
            }
            if (c === '\\') {
              cReg += c;
              isEscaped = true;
              peek++;
              continue;
            }
            if (inCharClass) {
              cReg += c;
              if (c === ']') inCharClass = false;
              peek++;
              continue;
            }
            if (c === '[') {
              inCharClass = true;
              cReg += c;
              peek++;
              continue;
            }
            if (c === '(') {
              depth++;
              cReg += c;
              peek++;
              continue;
            }
            if (c === ')') {
              depth--;
              if (depth === 0) {
                peek++;
                break;
              } else {
                cReg += c;
                peek++;
                continue;
              }
            }
            cReg += c;
            peek++;
          }
          customRegex = cReg;
        }

        let modifier = '';
        if (peek < len && (path[peek] === '?' || path[peek] === '*' || path[peek] === '+')) {
          modifier = path[peek]!;
          peek++;
        }

        if (modifier === '?' && (peek === len || path[peek] === '/')) {
          paramNames.push(pName);
          if (customRegex !== null) {
            const nonCap = toNonCapturing(customRegex);
            regexStr += `(?:/(${nonCap}))?`;
            score += 25;
          } else {
            regexStr += '(?:/([^/]+))?';
            score += 15;
          }
          i = peek;
          continue;
        }
      }

      regexStr += '/';
      score += 10;
      i++;
      continue;
    }

    if (ch === '*') {
      paramNames.push('pathMatch');
      regexStr += '(?:/(.*))?';
      score += 1;
      i++;
      continue;
    }

    if (ch === ':') {
      i++;
      let paramName = '';
      while (i < len && /[a-zA-Z0-9_$]/.test(path[i]!)) {
        paramName += path[i]!;
        i++;
      }

      let customRegex: string | null = null;
      if (i < len && path[i] === '(') {
        i++;
        let depth = 1;
        let inCharClass = false;
        let isEscaped = false;
        let cReg = '';
        while (i < len && depth > 0) {
          const c = path[i]!;
          if (isEscaped) {
            cReg += c;
            isEscaped = false;
            i++;
            continue;
          }
          if (c === '\\') {
            cReg += c;
            isEscaped = true;
            i++;
            continue;
          }
          if (inCharClass) {
            cReg += c;
            if (c === ']') inCharClass = false;
            i++;
            continue;
          }
          if (c === '[') {
            inCharClass = true;
            cReg += c;
            i++;
            continue;
          }
          if (c === '(') {
            depth++;
            cReg += c;
            i++;
            continue;
          }
          if (c === ')') {
            depth--;
            if (depth === 0) {
              i++;
              break;
            } else {
              cReg += c;
              i++;
              continue;
            }
          }
          cReg += c;
          i++;
        }
        customRegex = cReg;
      }

      let modifier = '';
      if (i < len && (path[i] === '?' || path[i] === '*' || path[i] === '+')) {
        modifier = path[i]!;
        i++;
      }

      paramNames.push(paramName);

      if (customRegex !== null) {
        const nonCap = toNonCapturing(customRegex);
        if (modifier === '?') {
          regexStr += `(${nonCap})?`;
          score += 25;
        } else if (modifier === '*') {
          regexStr += `(${nonCap})*`;
          score += 5;
        } else if (modifier === '+') {
          regexStr += `(${nonCap})+`;
          score += 30;
        } else {
          regexStr += `(${nonCap})`;
          score += 30;
        }
      } else {
        if (modifier === '?') {
          regexStr += '([^/]+)?';
          score += 15;
        } else if (modifier === '*') {
          regexStr += '(.*)';
          score += 5;
        } else if (modifier === '+') {
          regexStr += '([^/]+)';
          score += 20;
        } else {
          regexStr += '([^/]+)';
          score += 20;
        }
      }
      continue;
    }

    if (/[.*+?^${}()|[\]\\]/.test(ch)) {
      regexStr += '\\' + ch;
    } else {
      regexStr += ch;
    }
    score += 10;
    i++;
  }

  regexStr += '/?$';

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
