// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shouldIntercept, isExternal, installLinkInterception } from '../Link.js';

function makeAnchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.appendChild(a);
  return a;
}

function click(opts: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...opts });
}

describe('Link', () => {
  describe('shouldIntercept', () => {
    it('should intercept a plain left-click on an internal link', () => {
      const a = makeAnchor('/about');
      expect(shouldIntercept(click(), a)).toBe(true);
    });

    it('should NOT intercept a middle-click (button 1)', () => {
      const a = makeAnchor('/about');
      expect(shouldIntercept(click({ button: 1 }), a)).toBe(false);
    });

    it('should NOT intercept a ctrl/cmd-click', () => {
      const a = makeAnchor('/about');
      expect(shouldIntercept(click({ ctrlKey: true }), a)).toBe(false);
      expect(shouldIntercept(click({ metaKey: true }), a)).toBe(false);
    });

    it('should NOT intercept a shift-click or alt-click', () => {
      const a = makeAnchor('/about');
      expect(shouldIntercept(click({ shiftKey: true }), a)).toBe(false);
      expect(shouldIntercept(click({ altKey: true }), a)).toBe(false);
    });

    it('should NOT intercept links with target="_blank"', () => {
      const a = makeAnchor('/about', { target: '_blank' });
      expect(shouldIntercept(click(), a)).toBe(false);
    });

    it('should NOT intercept links with a download attribute', () => {
      const a = makeAnchor('/file.pdf', { download: '' });
      expect(shouldIntercept(click(), a)).toBe(false);
    });

    it('should NOT intercept external URLs', () => {
      const a = makeAnchor('https://example.com/other');
      expect(isExternal(a)).toBe(true);
      expect(shouldIntercept(click(), a)).toBe(false);
    });

    it('should NOT intercept mailto: or tel: links', () => {
      expect(shouldIntercept(click(), makeAnchor('mailto:hi@example.com'))).toBe(false);
      expect(shouldIntercept(click(), makeAnchor('tel:+15551234567'))).toBe(false);
    });
  });

  describe('installLinkInterception', () => {
    it('should call router.push with the href for a data-drift-link click', () => {
      const a = makeAnchor('/about', { 'data-drift-link': '' });
      const push = vi.fn();
      const router = { push, replace: vi.fn() } as any;
      const uninstall = installLinkInterception(router, document);

      a.dispatchEvent(click());

      expect(push).toHaveBeenCalledWith('/about');
      uninstall();
    });

    it('should call router.replace when data-drift-replace is present', () => {
      const a = makeAnchor('/about', { 'data-drift-link': '', 'data-drift-replace': '' });
      const replace = vi.fn();
      const router = { push: vi.fn(), replace } as any;
      const uninstall = installLinkInterception(router, document);

      a.dispatchEvent(click());

      expect(replace).toHaveBeenCalledWith('/about');
      uninstall();
    });

    it('should ignore anchors without data-drift-link', () => {
      const a = makeAnchor('/about');
      const push = vi.fn();
      const router = { push, replace: vi.fn() } as any;
      const uninstall = installLinkInterception(router, document);

      a.dispatchEvent(click());

      expect(push).not.toHaveBeenCalled();
      uninstall();
    });

    it('should stop intercepting after the returned teardown is called', () => {
      const a = makeAnchor('/about', { 'data-drift-link': '' });
      const push = vi.fn();
      const router = { push, replace: vi.fn() } as any;
      const uninstall = installLinkInterception(router, document);
      uninstall();

      a.dispatchEvent(click());

      expect(push).not.toHaveBeenCalled();
    });
  });
});
