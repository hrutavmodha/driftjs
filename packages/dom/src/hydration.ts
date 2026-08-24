/**
 * HydrationCursor uses browser standard TreeWalker to perform pre-order depth-first
 * matching of SSR-rendered HTML DOM nodes during client-side hydration.
 */
export class HydrationCursor {
  private walker: TreeWalker;
  private current: Node | null;
  private unclaimed: Node[] = [];
  private static readonly MAX_LOOKAHEAD = 16;

  constructor(container: Node, doc: Document) {
    // 1 (SHOW_ELEMENT) | 4 (SHOW_TEXT) | 128 (SHOW_COMMENT) = 133
    const whatToShow = typeof NodeFilter !== 'undefined'
      ? NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
      : 133;

    this.walker = doc.createTreeWalker(container, whatToShow);
    this.current = this.walker.nextNode();
  }

  private claimNode<T extends Node>(predicate: (n: Node) => boolean, fallback: () => T): T {
    // 1. Check unclaimed pool first
    const poolIdx = this.unclaimed.findIndex(predicate);
    if (poolIdx !== -1) {
      return this.unclaimed.splice(poolIdx, 1)[0] as T;
    }

    // 2. Check current node
    if (this.current && predicate(this.current)) {
      const node = this.current as T;
      this.current = this.walker.nextNode();
      return node;
    }

    // 3. Lookahead in TreeWalker preserving uncollected intermediate nodes
    let steps = 0;
    while (this.current && steps < HydrationCursor.MAX_LOOKAHEAD) {
      if (predicate(this.current)) {
        const node = this.current as T;
        this.current = this.walker.nextNode();
        return node;
      }
      this.unclaimed.push(this.current);
      this.current = this.walker.nextNode();
      steps++;
    }

    return fallback();
  }

  public claimElement(tag: string, doc: Document): Element {
    const targetTag = tag.toLowerCase();
    return this.claimNode(
      (n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === targetTag,
      () => doc.createElement(tag)
    );
  }

  public claimText(doc: Document): Text {
    return this.claimNode(
      (n) => n.nodeType === 3,
      () => doc.createTextNode('')
    );
  }

  public claimComment(expectedContent: string, doc: Document): Comment {
    const trimmedExpected = expectedContent.trim();
    return this.claimNode(
      (n) => n.nodeType === 8 && (n as Comment).data.trim() === trimmedExpected,
      () => doc.createComment(expectedContent)
    );
  }
}

