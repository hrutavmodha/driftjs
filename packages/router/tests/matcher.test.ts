import { describe, it, expect } from 'vitest';
import { matchRoute, normalizeRoutes, parseQuery, stringifyQuery } from '../Matcher.js';
import type { RouteDefinition } from '../types.js';

const routes: RouteDefinition[] = [
  { path: '/', component: {} as any },
  { path: '/about', component: {} as any },
  { path: '/user/:id', component: {} as any },
  { path: '/post/:id/comment/:commentId', component: {} as any },
  { path: '/files/*', component: {} as any },
  {
    path: '/dashboard',
    component: {} as any,
    children: [
      { path: '', component: {} as any, name: 'dashboard-index' },
      { path: 'settings', component: {} as any, name: 'dashboard-settings' }
    ]
  }
];

describe('Matcher', () => {
  describe('static and dynamic route matching', () => {
    it('should match a static root route', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/');
      expect(match?.chain).toHaveLength(1);
      expect(match?.params).toEqual({});
    });

    it('should match a static nested-name route like /about', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/about');
      expect(match?.chain[0]?.path).toBe('/about');
    });

    it('should extract a single dynamic param from /user/:id', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/user/42');
      expect(match?.params).toEqual({ id: '42' });
    });

    it('should extract multiple dynamic params from /post/:id/comment/:commentId', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/post/7/comment/99');
      expect(match?.params).toEqual({ id: '7', commentId: '99' });
    });

    it('should decode URI-encoded dynamic param values', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/user/john%20doe');
      expect(match?.params.id).toBe('john doe');
    });
  });

  describe('wildcard route matching', () => {
    it('should capture the remaining path under the "*" param for /files/*', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/files/a/b/c.png');
      expect(match?.params['*']).toBe('a/b/c.png');
    });
  });

  describe('nested and layout routes', () => {
    it('should match a layout + index child chain for /dashboard', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/dashboard');
      expect(match?.chain.map((r) => r.name)).toEqual([undefined, 'dashboard-index']);
    });

    it('should match a layout + named child chain for /dashboard/settings', () => {
      const records = normalizeRoutes(routes);
      const match = matchRoute(records, '/dashboard/settings');
      expect(match?.chain.map((r) => r.name)).toEqual([undefined, 'dashboard-settings']);
    });
  });

  describe('no match', () => {
    it('should return null for a pathname with no matching route', () => {
      const records = normalizeRoutes(routes);
      expect(matchRoute(records, '/does/not/exist')).toBeNull();
    });
  });

  describe('query string parsing', () => {
    it('should parse a multi-key query string into an object', () => {
      expect(parseQuery('?page=2&sort=price')).toEqual({ page: '2', sort: 'price' });
    });

    it('should return an empty object for an empty query string', () => {
      expect(parseQuery('')).toEqual({});
    });

    it('should round-trip stringifyQuery -> parseQuery', () => {
      const query = { a: '1', b: 'two words' };
      expect(parseQuery(stringifyQuery(query))).toEqual(query);
    });
  });
});
