import type { ASTNode, ElementNode, TextNode, InterpolationNode } from './ast.js';

/**
 * DriftJS Parser for transforming template source strings into AST node arrays.
 */
export class DriftJSParser {
  private cursor = 0;

  /**
   * Initializes a new parser instance.
   *
   * @param source - The template source string to parse.
   */
  constructor(private readonly source: string) {}

  /**
   * Parses the template source into an array of AST nodes.
   *
   * @returns Array of parsed AST nodes.
   */
  public parse(): ASTNode[] {
    this.cursor = 0;
    const nodes: ASTNode[] = [];
    while (!this.isEOF()) {
      const node = this.parseNode();
      if (node) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  private parseNode(): ASTNode | null {
    if (this.match('{')) {
      return this.parseInterpolation();
    }
    
    if (this.match('<')) {
      if (this.source.charCodeAt(this.cursor) === 47 /* '/' */) {
        // Closing tag, should be handled by parseElement
        return null;
      }
      return this.parseElement();
    }

    return this.parseText();
  }

  private parseElement(): ASTNode {
    // Expecting to be right after '<'
    const tag = this.parseTagName();
    const attributes: Record<string, string> = {};
    const events: Record<string, string> = {};

    this.consumeWhitespace();

    while (!this.isEOF() && !this.startsWith('>') && !this.startsWith('/>')) {
      const attrName = this.parseAttributeName();
      this.consumeWhitespace();
      
      let attrValue = '';
      if (this.match('=')) {
        this.consumeWhitespace();
        attrValue = this.parseAttributeValue();
      }

      if (attrName.startsWith('on') && attrName.length > 2) {
        // e.g. "onclick" -> "click"
        const eventName = attrName.slice(2).toLowerCase();
        let handlerVal = attrValue;
        if (handlerVal.startsWith('{') && handlerVal.endsWith('}')) {
          handlerVal = handlerVal.slice(1, -1).trim();
        }
        events[eventName] = handlerVal;
      } else {
        attributes[attrName] = attrValue;
      }

      this.consumeWhitespace();
    }

    const isSelfClosing = this.match('/>');
    if (!isSelfClosing && !this.match('>')) {
      // It should have matched '>' above
      this.consume('>');
    }

    if (tag === 'script') {
      const endScriptIdx = this.source.indexOf('</script>', this.cursor);
      if (endScriptIdx === -1) {
        throw new Error('Unclosed script tag');
      }
      const content = this.source.slice(this.cursor, endScriptIdx);
      this.cursor = endScriptIdx;
      this.consume('</script>');
      return { type: 'Script', content: content.trim() } as any;
    }

    const children: ASTNode[] = [];
    if (!isSelfClosing) {
      while (!this.isEOF() && !this.startsWith('</')) {
        const child = this.parseNode();
        if (child) children.push(child);
      }
      this.consume('</');
      const closingTag = this.parseTagName();
      if (closingTag !== tag) {
        throw new Error(`Expected closing tag </${tag}> but got </${closingTag}>`);
      }
      this.consumeWhitespace();
      this.consume('>');
    }

    return {
      type: 'Element',
      tag,
      attributes,
      events,
      children
    };
  }

  private parseText(): TextNode {
    const start = this.cursor;
    while (!this.isEOF()) {
      const ch = this.source.charCodeAt(this.cursor);
      if (ch === 60 /* '<' */ || ch === 123 /* '{' */) {
        break;
      }
      this.cursor++;
    }
    const content = this.source.substring(start, this.cursor);
    return { type: 'Text', content };
  }

  private parseInterpolation(): InterpolationNode {
    const start = this.cursor;
    while (!this.isEOF()) {
      const ch = this.source.charCodeAt(this.cursor);
      if (ch === 125 /* '}' */) {
        break;
      }
      this.cursor++;
    }
    const expression = this.source.substring(start, this.cursor).trim();
    this.consume('}');
    return { type: 'Interpolation', expression };
  }

  private parseTagName(): string {
    const start = this.cursor;
    while (!this.isEOF()) {
      const code = this.source.charCodeAt(this.cursor);
      if (
        (code >= 97 && code <= 122) ||
        (code >= 65 && code <= 90) ||
        (code >= 48 && code <= 57) ||
        code === 45
      ) {
        this.cursor++;
      } else {
        break;
      }
    }
    if (this.cursor === start) throw new Error('Expected tag name');
    return this.source.substring(start, this.cursor);
  }

  private parseAttributeName(): string {
    const start = this.cursor;
    while (!this.isEOF()) {
      const code = this.source.charCodeAt(this.cursor);
      if (
        (code >= 97 && code <= 122) ||
        (code >= 65 && code <= 90) ||
        (code >= 48 && code <= 57) ||
        code === 45 ||
        code === 58 ||
        code === 64
      ) {
        this.cursor++;
      } else {
        break;
      }
    }
    return this.source.substring(start, this.cursor);
  }

  private parseAttributeValue(): string {
    if (this.match('{')) {
      const start = this.cursor;
      let depth = 1;
      while (!this.isEOF() && depth > 0) {
        const ch = this.source.charCodeAt(this.cursor);
        if (ch === 34 /* '"' */ || ch === 39 /* "'" */) {
          const quote = ch;
          this.cursor++;
          while (!this.isEOF() && this.source.charCodeAt(this.cursor) !== quote) {
            if (this.source.charCodeAt(this.cursor) === 92 /* '\' */) {
              this.cursor++;
            }
            this.cursor++;
          }
          if (!this.isEOF()) this.cursor++;
          continue;
        }
        if (ch === 123 /* '{' */) {
          depth++;
        } else if (ch === 125 /* '}' */) {
          depth--;
        }
        if (depth > 0) {
          this.cursor++;
        }
      }
      const val = this.source.substring(start, this.cursor).trim();
      if (depth === 0) {
        this.cursor++; // consume closing '}'
      }
      return `{${val}}`;
    }

    const quoteCode = this.source.charCodeAt(this.cursor);
    if (quoteCode === 34 /* '"' */ || quoteCode === 39 /* "'" */) {
      this.cursor++;
      const start = this.cursor;
      while (!this.isEOF() && this.source.charCodeAt(this.cursor) !== quoteCode) {
        this.cursor++;
      }
      const value = this.source.substring(start, this.cursor);
      this.cursor++; // consume closing quote
      return value;
    }
    
    // Unquoted value
    const start = this.cursor;
    while (!this.isEOF()) {
      const code = this.source.charCodeAt(this.cursor);
      if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 62) {
        break;
      }
      this.cursor++;
    }
    return this.source.substring(start, this.cursor);
  }

  private consumeWhitespace() {
    while (!this.isEOF()) {
      const code = this.source.charCodeAt(this.cursor);
      if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12) {
        this.cursor++;
      } else {
        break;
      }
    }
  }

  private match(str: string): boolean {
    if (this.startsWith(str)) {
      this.cursor += str.length;
      return true;
    }
    return false;
  }

  private consume(str: string) {
    if (!this.match(str)) {
      throw new Error(`Expected "${str}" at index ${this.cursor}`);
    }
  }

  private startsWith(str: string): boolean {
    return this.source.startsWith(str, this.cursor);
  }

  private isEOF(): boolean {
    return this.cursor >= this.source.length;
  }
}

/**
 * Convenience function to parse a template string into an AST node array.
 *
 * @param template - The template string to parse.
 * @returns Array of parsed AST nodes.
 */
export function parseTemplate(template: string): ASTNode[] {
  const parser = new DriftJSParser(template);
  return parser.parse();
}
