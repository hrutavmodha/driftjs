import type { DriftRouter } from './Router.js';

/**
 * Decides whether a click on an anchor should be intercepted for client-side
 * navigation. Mirrors the standard rules browsers/users expect: modifier
 * clicks, middle-click, `target="_blank"`, `download`, and cross-origin
 * links all fall through to native browser handling.
 */
export function shouldIntercept(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false; // Only left-click; preserves middle-click "open in new tab".
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return false;

  return !isExternal(anchor);
}

/** True when the anchor points at a different origin than the current document. */
export function isExternal(anchor: HTMLAnchorElement): boolean {
  return anchor.origin !== window.location.origin;
}

/**
 * Installs a single delegated click listener (mirroring the runtime VM's own
 * event-delegation pattern) that intercepts clicks on any
 * `<a data-drift-link href="...">` beneath `root` and routes them through
 * `router.push`/`router.replace` instead of a full page navigation.
 * `<a>` tags are plain, native anchors — DriftJS has no component layer to
 * wrap them in, so opting an anchor into client-side routing is a matter of
 * adding the `data-drift-link` attribute in the `.drift` template.
 *
 * @returns A teardown function that removes the listener.
 */
export function installLinkInterception(
  router: DriftRouter,
  root: Document | HTMLElement = document
): () => void {
  const handler = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest<HTMLAnchorElement>('a[data-drift-link]') ?? null;
    if (!anchor || !shouldIntercept(event, anchor)) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    event.preventDefault();
    const to = href.startsWith(window.location.origin) ? href.slice(window.location.origin.length) : href;
    if (anchor.hasAttribute('data-drift-replace')) {
      void router.replace(to);
    } else {
      void router.push(to);
    }
  };

  root.addEventListener('click', handler as EventListener);
  return () => root.removeEventListener('click', handler as EventListener);
}
