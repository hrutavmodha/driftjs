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

  public claimElement(tag: string, doc: Document): Element {
    const targetTag = tag.toLowerCase();

    // 1. Check unclaimed pool first
    const poolIdx = this.unclaimed.findIndex(
      (n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === targetTag
    );
    if (poolIdx !== -1) {
      const matched = this.unclaimed.splice(poolIdx, 1)[0] as Element;
      return matched;
    }

    // 2. Check current node
    if (
      this.current &&
      this.current.nodeType === 1 &&
      (this.current as Element).tagName.toLowerCase() === targetTag
    ) {
      const node = this.current as Element;
      this.current = this.walker.nextNode();
      return node;
    }

    // 3. Lookahead in TreeWalker preserving uncollected intermediate nodes
    let steps = 0;
    while (this.current && steps < HydrationCursor.MAX_LOOKAHEAD) {
      if (
        this.current.nodeType === 1 &&
        (this.current as Element).tagName.toLowerCase() === targetTag
      ) {
        const node = this.current as Element;
        this.current = this.walker.nextNode();
        return node;
      }
      this.unclaimed.push(this.current);
      this.current = this.walker.nextNode();
      steps++;
    }

    return doc.createElement(tag);
  }

  public claimText(doc: Document): Text {
    // 1. Check unclaimed pool first
    const poolIdx = this.unclaimed.findIndex((n) => n.nodeType === 3);
    if (poolIdx !== -1) {
      const matched = this.unclaimed.splice(poolIdx, 1)[0] as Text;
      return matched;
    }

    // 2. Check current node
    if (this.current && this.current.nodeType === 3) {
      const node = this.current as Text;
      this.current = this.walker.nextNode();
      return node;
    }

    // 3. Lookahead preserving intermediates
    let steps = 0;
    while (this.current && steps < HydrationCursor.MAX_LOOKAHEAD) {
      if (this.current.nodeType === 3) {
        const node = this.current as Text;
        this.current = this.walker.nextNode();
        return node;
      }
      this.unclaimed.push(this.current);
      this.current = this.walker.nextNode();
      steps++;
    }

    return doc.createTextNode('');
  }

  public claimComment(expectedContent: string, doc: Document): Comment {
    const trimmedExpected = expectedContent.trim();

    // 1. Check unclaimed pool first
    const poolIdx = this.unclaimed.findIndex(
      (n) => n.nodeType === 8 && (n as Comment).data.trim() === trimmedExpected
    );
    if (poolIdx !== -1) {
      const matched = this.unclaimed.splice(poolIdx, 1)[0] as Comment;
      return matched;
    }

    // 2. Check current node
    if (
      this.current &&
      this.current.nodeType === 8 &&
      (this.current as Comment).data.trim() === trimmedExpected
    ) {
      const comment = this.current as Comment;
      this.current = this.walker.nextNode();
      return comment;
    }

    // 3. Lookahead preserving intermediates
    let steps = 0;
    while (this.current && steps < HydrationCursor.MAX_LOOKAHEAD) {
      if (
        this.current.nodeType === 8 &&
        (this.current as Comment).data.trim() === trimmedExpected
      ) {
        const comment = this.current as Comment;
        this.current = this.walker.nextNode();
        return comment;
      }
      this.unclaimed.push(this.current);
      this.current = this.walker.nextNode();
      steps++;
    }

    return doc.createComment(expectedContent);
  }
}

