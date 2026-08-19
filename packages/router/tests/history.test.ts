import { describe, it, expect, vi } from 'vitest';
import {
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
  normalizeBase,
  stripBase,
  createHref,
} from '../src/history.js';

describe('Router History Drivers (driftjs-router)', () => {
  describe('Base URL Helpers', () => {
    it('normalizes base paths correctly', () => {
      expect(normalizeBase()).toBe('');
      expect(normalizeBase('')).toBe('');
      expect(normalizeBase('/')).toBe('');
      expect(normalizeBase('app')).toBe('/app');
      expect(normalizeBase('/app/')).toBe('/app');
      expect(normalizeBase('/deep/base/path/')).toBe('/deep/base/path');
    });

    it('strips base path from full pathnames', () => {
      expect(stripBase('/app/dashboard', '/app')).toBe('/dashboard');
      expect(stripBase('/app', '/app')).toBe('/');
      expect(stripBase('/other/path', '/app')).toBe('/other/path');
      expect(stripBase('/dashboard', '')).toBe('/dashboard');
    });

    it('creates full href strings with base path', () => {
      expect(createHref('/app', '/dashboard')).toBe('/app/dashboard');
      expect(createHref('', '/dashboard')).toBe('/dashboard');
      expect(createHref('/app', 'profile')).toBe('/app/profile');
    });
  });

  describe('MemoryHistory Driver', () => {
    it('initializes with default or custom initial location', () => {
      const h1 = createMemoryHistory();
      expect(h1.location).toBe('/');
      expect(h1.base).toBe('');

      const h2 = createMemoryHistory('/dashboard', '/base');
      expect(h2.location).toBe('/dashboard');
      expect(h2.base).toBe('/base');
    });

    it('pushes new entries and updates location', () => {
      const history = createMemoryHistory();
      history.push('/step1');
      expect(history.location).toBe('/step1');

      history.push('/step2', { user: 'Alice' });
      expect(history.location).toBe('/step2');
      expect(history.state).toEqual({ user: 'Alice' });
    });

    it('replaces current entry in-place', () => {
      const history = createMemoryHistory();
      history.push('/old');
      history.replace('/new', { replaced: true });
      expect(history.location).toBe('/new');
      expect(history.state).toEqual({ replaced: true });
    });

    it('navigates with go(delta) and truncates forward history on push', () => {
      const history = createMemoryHistory();
      const listener = vi.fn();
      history.listen(listener);

      history.push('/page1');
      history.push('/page2');
      history.push('/page3');

      history.go(-1);
      expect(history.location).toBe('/page2');
      expect(listener).toHaveBeenCalledWith('/page2', '/page3', {
        direction: 'back',
        delta: -1,
        type: 'pop',
      });

      history.go(-1);
      expect(history.location).toBe('/page1');

      history.go(2);
      expect(history.location).toBe('/page3');

      // Go back and push a new branch
      history.go(-1); // At page2
      history.push('/page2-alternate');
      expect(history.location).toBe('/page2-alternate');

      // Forward should not go to /page3 because stack was truncated
      history.go(1);
      expect(history.location).toBe('/page2-alternate');
    });

    it('cleans up state on destroy', () => {
      const history = createMemoryHistory('/init');
      const listener = vi.fn();
      const unlisten = history.listen(listener);

      unlisten();
      history.destroy();
      expect(history.location).toBe('/');
    });
  });

  describe('BrowserHistory Driver', () => {
    it('creates web history and reads location', () => {
      const history = createWebHistory('/my-app');
      expect(history.base).toBe('/my-app');
      expect(typeof history.location).toBe('string');
      expect(typeof history.push).toBe('function');
      expect(typeof history.replace).toBe('function');
      history.destroy();
    });

    it('pushes and replaces state on window.history', () => {
      const history = createWebHistory();
      history.push('/profile', { key: 'val' });
      expect(history.location).toBe('/profile');
      expect(history.state).toEqual({ key: 'val' });

      history.replace('/settings', { updated: true });
      expect(history.location).toBe('/settings');
      expect(history.state).toEqual({ updated: true });
      history.destroy();
    });
  });

  describe('HashHistory Driver', () => {
    it('creates hash history and tracks hash location', () => {
      const history = createWebHashHistory();
      history.push('/items/123');
      expect(history.location).toBe('/items/123');
      expect(window.location.hash).toBe('#/items/123');

      history.replace('/items/456');
      expect(history.location).toBe('/items/456');
      expect(window.location.hash).toBe('#/items/456');
      history.destroy();
    });
  });
});
