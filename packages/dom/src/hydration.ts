/**
 * HydrationCursor uses browser standard TreeWalker to perform pre-order depth-first
 * matching of SSR-rendered HTML DOM nodes during client-side hydration.
 */
export class HydrationCursor {
  private walker: TreeWalker;
  private current: Node | null;

  constructor(container: Node, doc: Document) {
    // 1 (SHOW_ELEMENT) | 4 (SHOW_TEXT) | 128 (SHOW_COMMENT) = 133
    const whatToShow = typeof NodeFilter !== 'undefined'
      ? NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
      : 133;

    this.walker = doc.createTreeWalker(container, whatToShow);
    this.current = this.walker.nextNode();
  }

  public claimElement(tag: string, doc: Document): Element {
    while (this.current && this.current.nodeType !== 1) {
      this.current = this.walker.nextNode();
    }
    if (this.current && this.current.nodeType === 1 && (this.current as Element).tagName.toLowerCase() === tag.toLowerCase()) {
      const node = this.current as Element;
      this.current = this.walker.nextNode();
      return node;
    }
    return doc.createElement(tag);
  }

  public claimText(doc: Document): Text {
    while (this.current && this.current.nodeType !== 3) {
      this.current = this.walker.nextNode();
    }
    if (this.current && this.current.nodeType === 3) {
      const node = this.current as Text;
      this.current = this.walker.nextNode();
      return node;
    }
    return doc.createTextNode('');
  }

  public claimComment(expectedContent: string, doc: Document): Comment {
    while (this.current && this.current.nodeType !== 8) {
      this.current = this.walker.nextNode();
    }
    if (this.current && this.current.nodeType === 8) {
      const node = this.current as Comment;
      this.current = this.walker.nextNode();
      return node;
    }
    return doc.createComment(expectedContent);
  }
}
