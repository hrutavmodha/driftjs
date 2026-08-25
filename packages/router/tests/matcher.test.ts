import { describe, it, expect } from 'vitest';
import {
  parseQuery,
  stringifyQuery,
  compilePathToRegex,
  createMatcher,
  normalizePath,
} from '../src/matcher.js';
import type { RouteRecordRaw } from '../types/index.js';

describe('Route Matcher & Query Parser (driftjs-router)', () => {
  describe('Query Parser & Stringifier', () => {
    it('parses empty and simple query strings', () => {
      expect(parseQuery('')).toEqual({});
      expect(parseQuery('?')).toEqual({});
      expect(parseQuery('?foo=bar')).toEqual({ foo: 'bar' });
      expect(parseQuery('foo=bar&baz=123')).toEqual({ foo: 'bar', baz: '123' });
    });

    it('parses boolean flags and empty values', () => {
      expect(parseQuery('?flag&empty=')).toEqual({ flag: null, empty: '' });
    });

    it('parses multi-value query parameters as arrays', () => {
      expect(parseQuery('?tag=news&tag=tech&tag=drift')).toEqual({
        tag: ['news', 'tech', 'drift'],
      });
    });

    it('decodes percent-encoded characters safely', () => {
      expect(parseQuery('?search=hello%20world&special=%26%3D')).toEqual({
        search: 'hello world',
        special: '&=',
      });
    });

    it('stringifies query objects into search strings', () => {
      expect(stringifyQuery({})).toBe('');
      expect(stringifyQuery({ q: 'drift', page: '2' })).toBe('?q=drift&page=2');
      expect(stringifyQuery({ tag: ['a', 'b'], flag: null })).toBe('?tag=a&tag=b&flag');
    });

    it('strictly filters __proto__, constructor, and prototype to prevent prototype pollution', () => {
      const q = parseQuery('?__proto__[polluted]=true&constructor=admin&prototype=root&valid=123');
      expect(q.valid).toBe('123');
      expect((q as any).__proto__).toBeUndefined();
      expect((q as any).constructor).toBeUndefined();
      expect((q as any).prototype).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Path Regex Compiler & Normalizer', () => {
    it('normalizes redundant and trailing slashes', () => {
      expect(normalizePath('///users//123///')).toBe('/users/123');
      expect(normalizePath('/')).toBe('/');
      expect(normalizePath('')).toBe('/');
    });

    it('compiles static and dynamic paths to regex', () => {
      const staticTokens = compilePathToRegex('/about');
      expect(staticTokens.regex.test('/about')).toBe(true);
      expect(staticTokens.regex.test('/about/')).toBe(true);
      expect(staticTokens.regex.test('/contact')).toBe(false);

      const dynamicTokens = compilePathToRegex('/users/:id');
      expect(dynamicTokens.paramNames).toEqual(['id']);
      expect(dynamicTokens.regex.test('/users/42')).toBe(true);
      expect(dynamicTokens.regex.test('/users')).toBe(false);

      const optionalTokens = compilePathToRegex('/posts/:id?');
      expect(optionalTokens.paramNames).toEqual(['id']);
      expect(optionalTokens.regex.test('/posts')).toBe(true);
      expect(optionalTokens.regex.test('/posts/100')).toBe(true);

      const wildcardTokens = compilePathToRegex('/files/*');
      expect(wildcardTokens.paramNames).toEqual(['pathMatch']);
      expect(wildcardTokens.regex.test('/files/documents/2026/report.pdf')).toBe(true);
    });

    it('supports custom regex param constraints', () => {
      const regexTokens = compilePathToRegex('/items/:id(\\d+)');
      expect(regexTokens.paramNames).toEqual(['id']);
      expect(regexTokens.regex.test('/items/12345')).toBe(true);
      expect(regexTokens.regex.test('/items/abc')).toBe(false);
    });

    it('supports multi-parameter and composite segments without slash splitting (BUG-020)', () => {
      const extTokens = compilePathToRegex('/files/:name.:ext');
      expect(extTokens.paramNames).toEqual(['name', 'ext']);
      expect(extTokens.regex.test('/files/document.pdf')).toBe(true);
      expect(extTokens.regex.test('/files/archive.tar.gz')).toBe(true);
      expect(extTokens.regex.test('/files/document')).toBe(false);

      const compositeTokens = compilePathToRegex('/users-:userId/posts-:postId');
      expect(compositeTokens.paramNames).toEqual(['userId', 'postId']);
      expect(compositeTokens.regex.test('/users-42/posts-100')).toBe(true);
      expect(compositeTokens.regex.test('/users-42/posts-')).toBe(false);

      const prefixTokens = compilePathToRegex('/api/v:version(\\d+)');
      expect(prefixTokens.paramNames).toEqual(['version']);
      expect(prefixTokens.regex.test('/api/v1')).toBe(true);
      expect(prefixTokens.regex.test('/api/v20')).toBe(true);
      expect(prefixTokens.regex.test('/api/vabc')).toBe(false);
    });
  });

  describe('Matcher Resolution & Hierarchy', () => {
    const dummyComp = { bytecode: new Uint32Array(), constants: [] };

    const routes: RouteRecordRaw[] = [
      { path: '/', name: 'home', component: dummyComp },
      { path: '/about', name: 'about', component: dummyComp },
      {
        path: '/users',
        name: 'users',
        component: dummyComp,
        children: [
          { path: ':id', name: 'user-detail', component: dummyComp },
          { path: ':id/settings', name: 'user-settings', component: dummyComp },
        ],
      },
      {
        path: '/docs',
        component: dummyComp,
        children: [
          { path: '/guide', name: 'guide', component: dummyComp }, // Absolute child path
        ],
      },
      { path: '/orders/:orderId(\\d+)', name: 'order-detail', component: dummyComp },
      { path: '/files/:name.:ext', name: 'file-detail', component: dummyComp },
      { path: '/users-:userId/posts-:postId', name: 'user-post', component: dummyComp },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: dummyComp },
    ];

    const matcher = createMatcher(routes);

    it('matches root and static routes', () => {
      const home = matcher.resolve('/');
      expect(home.name).toBe('home');
      expect(home.matched.length).toBe(1);
      expect(home.matched[0]?.name).toBe('home');

      const about = matcher.resolve('/about');
      expect(about.name).toBe('about');
      expect(about.path).toBe('/about');
    });

    it('extracts dynamic route parameters', () => {
      const user = matcher.resolve('/users/42');
      expect(user.name).toBe('user-detail');
      expect(user.params).toEqual({ id: '42' });
      expect(user.matched.length).toBe(2);
      expect(user.matched[0]?.name).toBe('users');
      expect(user.matched[1]?.name).toBe('user-detail');
    });

    it('extracts parameters accurately for composite and multi-parameter segments (BUG-020)', () => {
      const file = matcher.resolve('/files/report.pdf');
      expect(file.name).toBe('file-detail');
      expect(file.params).toEqual({ name: 'report', ext: 'pdf' });

      const userPost = matcher.resolve('/users-42/posts-100');
      expect(userPost.name).toBe('user-post');
      expect(userPost.params).toEqual({ userId: '42', postId: '100' });

      const interpolated = matcher.resolve({
        name: 'file-detail',
        params: { name: 'annual-report', ext: 'docx' },
      });
      expect(interpolated.path).toBe('/files/annual-report.docx');
    });

    it('handles nested multi-segment dynamic routes', () => {
      const settings = matcher.resolve('/users/99/settings');
      expect(settings.name).toBe('user-settings');
      expect(settings.params).toEqual({ id: '99' });
      expect(settings.matched.length).toBe(2);
    });

    it('handles absolute child paths in nested route trees', () => {
      const guide = matcher.resolve('/guide');
      expect(guide.name).toBe('guide');
      expect(guide.path).toBe('/guide');
      expect(guide.matched.length).toBe(2);
    });

    it('respects regex constraints on dynamic parameters', () => {
      const validOrder = matcher.resolve('/orders/1024');
      expect(validOrder.name).toBe('order-detail');
      expect(validOrder.params).toEqual({ orderId: '1024' });

      // Non-numeric param falls back to catch-all
      const invalidOrder = matcher.resolve('/orders/invalid');
      expect(invalidOrder.name).toBe('not-found');
      expect(invalidOrder.params.pathMatch).toBe('orders/invalid');
    });

    it('resolves named routes with parameter interpolation', () => {
      const resolved = matcher.resolve({ name: 'user-detail', params: { id: '77' } });
      expect(resolved.path).toBe('/users/77');
      expect(resolved.params).toEqual({ id: '77' });
      expect(resolved.name).toBe('user-detail');
    });

    it('resolves routes with query and hash strings', () => {
      const res = matcher.resolve('/users/1?tab=activity&view=compact#top');
      expect(res.path).toBe('/users/1');
      expect(res.query).toEqual({ tab: 'activity', view: 'compact' });
      expect(res.hash).toBe('#top');
      expect(res.fullPath).toBe('/users/1?tab=activity&view=compact#top');
    });

    it('supports dynamic addRoute, removeRoute, and hasRoute', () => {
      expect(matcher.hasRoute('blog')).toBe(false);

      const remove = matcher.addRoute({
        path: '/blog',
        name: 'blog',
        component: dummyComp,
      });

      expect(matcher.hasRoute('blog')).toBe(true);
      expect(matcher.resolve('/blog').name).toBe('blog');

      remove();
      expect(matcher.hasRoute('blog')).toBe(false);

      matcher.addRoute({
        path: '/store',
        name: 'store',
        component: dummyComp,
      });
      expect(matcher.hasRoute('store')).toBe(true);
      matcher.removeRoute('store');
      expect(matcher.hasRoute('store')).toBe(false);
    });
  });
});
