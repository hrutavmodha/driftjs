import type { MatchResult, RouteDefinition, RouteParams, RouteRecord } from './types.js';

let recordSeq = 0;

/**
 * Recursively normalizes a public `RouteDefinition[]` tree into `RouteRecord[]`,
 * assigning a stable identity `id` to each node (used to diff mounted VM
 * instances across navigations) and linking `parent` for chain traversal.
 */
export function normalizeRoutes(defs: RouteDefinition[], parent: RouteRecord | null = null): RouteRecord[] {
  return defs.map((def) => {
    const record: RouteRecord = {
      id: ++recordSeq,
      path: def.path,
      name: def.name,
      component: def.component,
      redirect: def.redirect,
      children: [],
      beforeEnter: def.beforeEnter,
      meta: def.meta ?? {},
      parent
    };
    record.children = def.children ? normalizeRoutes(def.children, record) : [];
    return record;
  });
}

/**
 * Attempts to match a single route's own `path` segments against the head of
 * `segments`. Returns the extracted params and the unconsumed remainder, or
 * `null` if the route does not match. A `*` segment is always terminal and
 * swallows everything remaining (available as `params['*']`).
 */
function matchOwnPath(pattern: string, segments: string[]): { params: RouteParams; rest: string[] } | null {
  const patternSegments = pattern.split('/').filter(Boolean);

  if (patternSegments.length === 0) {
    // Index route ("" or "/"): matches without consuming any segments.
    return { params: {}, rest: segments };
  }

  const params: RouteParams = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSeg = patternSegments[i]!;

    if (patternSeg === '*') {
      params['*'] = segments.slice(i).join('/');
      return { params, rest: [] };
    }

    const seg = segments[i];
    if (seg === undefined) return null;

    if (patternSeg.startsWith(':')) {
      params[patternSeg.slice(1)] = decodeURIComponent(seg);
    } else if (patternSeg !== seg) {
      return null;
    }
  }

  return { params, rest: segments.slice(patternSegments.length) };
}

/**
 * Recursively resolves `segments` against a level of the route tree. Layout
 * routes (records with `children`) must fully delegate their remainder to a
 * matching child (usually an index route with `path: ''`); leaf routes must
 * consume every remaining segment.
 */
function matchLevel(records: RouteRecord[], segments: string[], inherited: RouteParams): MatchResult | null {
  for (const record of records) {
    const own = matchOwnPath(record.path, segments);
    if (!own) continue;

    const params = { ...inherited, ...own.params };

    if (record.children.length > 0) {
      const childMatch = matchLevel(record.children, own.rest, params);
      if (childMatch) {
        return { chain: [record, ...childMatch.chain], params: childMatch.params };
      }
      // Layout route with a redirect/component of its own and nothing left to consume
      // can still act as a terminal match (e.g. a layout with no index child).
      if (own.rest.length === 0 && record.component) {
        return { chain: [record], params };
      }
      continue;
    }

    if (own.rest.length === 0) {
      return { chain: [record], params };
    }
  }

  return null;
}

/** Matches a pathname against the normalized route tree, falling back to a `path: '*'` route if present. */
export function matchRoute(records: RouteRecord[], pathname: string): MatchResult | null {
  const segments = pathname.split('/').filter(Boolean);
  return matchLevel(records, segments, {});
}

/** Parses `location.search` (with or without leading `?`) into a plain object. */
export function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (!normalized) return query;
  for (const pair of normalized.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const value = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1));
    query[key] = value;
  }
  return query;
}

/** Serializes a query object back into a `?a=1&b=2` string (empty string if no keys). */
export function stringifyQuery(query: Record<string, string>): string {
  const keys = Object.keys(query);
  if (keys.length === 0) return '';
  return '?' + keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k]!)}`).join('&');
}
