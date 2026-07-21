import { TokenType, type Token } from '../../types/index.js';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * DriftJS Lexer for tokenizing template source strings into a token stream.
 */
export class DriftJSLexer {
  private cursor = 0;

  /**
   * Initializes a new lexer instance.
   *
   * @param source - The template source string to tokenize.
   */
  constructor(private readonly source: string) {}

  /**
   * Tokenizes the source string into an array of Tokens.
   *
   * @returns Array of scanned tokens.
   */
  public tokenize(): Token[] {
    this.cursor = 0;
    const tokens: Token[] = [];

    while (!this.isEOF()) {
      if (this.startsWith('{')) {
        tokens.push(this.scanInterpolation());
      } else if (this.startsWith('<')) {
        if (this.source.charCodeAt(this.cursor + 1) === 47 /* '/' */) {
          tokens.push(this.scanTagClose());
        } else {
          const tagTokens = this.scanTagOpenAndAttributes();
          tokens.push(...tagTokens);
        }
      } else {
        const textToken = this.scanText();
        if (textToken) {
          tokens.push(textToken);
        }
      }
    }

    tokens.push({
      type: TokenType.EOF,
      value: '',
      start: this.cursor,
      end: this.cursor
    });

    return tokens;
  }

  private scanTagOpenAndAttributes(): Token[] {
    const tokens: Token[] = [];
    const start = this.cursor;
    this.cursor++; // consume '<'

    const tagNameStart = this.cursor;
    while (!this.isEOF() && this.isTagChar(this.source.charCodeAt(this.cursor))) {
      this.cursor++;
    }
    if (this.cursor === tagNameStart) {
      throw new Error(`Expected tag name at index ${tagNameStart}`);
    }
    const tag = this.source.substring(tagNameStart, this.cursor);
    tokens.push({
      type: TokenType.TagOpen,
      value: tag,
      start,
      end: this.cursor
    });

    this.consumeWhitespace();

    if (tag.toLowerCase() === 'script') {
      if (this.match('>')) {
        tokens.push({
          type: TokenType.TagOpenEnd,
          value: '>',
          start: this.cursor - 1,
          end: this.cursor
        });
      }

      const scriptContentStart = this.cursor;
      const endScriptIdx = this.source.indexOf('</script>', this.cursor);
      if (endScriptIdx === -1) {
        throw new Error('Unclosed script tag');
      }
      const content = this.source.slice(scriptContentStart, endScriptIdx);
      tokens.push({
        type: TokenType.Script,
        value: content.trim(),
        start: scriptContentStart,
        end: endScriptIdx
      });

      this.cursor = endScriptIdx;
      tokens.push({
        type: TokenType.TagClose,
        value: 'script',
        start: endScriptIdx,
        end: endScriptIdx + 9
      });
      this.cursor += 9; // consume '</script>'
      return tokens;
    }

    while (!this.isEOF() && !this.startsWith('>') && !this.startsWith('/>')) {
      const attrStart = this.cursor;
      while (!this.isEOF() && this.isAttrChar(this.source.charCodeAt(this.cursor))) {
        this.cursor++;
      }
      const attrName = this.source.substring(attrStart, this.cursor);
      if (attrName.length > 0) {
        tokens.push({
          type: TokenType.AttributeName,
          value: attrName,
          start: attrStart,
          end: this.cursor
        });
      }

      this.consumeWhitespace();

      if (this.match('=')) {
        this.consumeWhitespace();
        const attrValToken = this.scanAttributeValue();
        tokens.push(attrValToken);
      }

      this.consumeWhitespace();
    }

    if (this.match('/>')) {
      tokens.push({
        type: TokenType.SelfClosingEnd,
        value: '/>',
        start: this.cursor - 2,
        end: this.cursor
      });
    } else if (this.match('>')) {
      tokens.push({
        type: TokenType.TagOpenEnd,
        value: '>',
        start: this.cursor - 1,
        end: this.cursor
      });
    }

    return tokens;
  }

  private scanTagClose(): Token {
    const start = this.cursor;
    this.cursor += 2; // consume '</'

    const tagNameStart = this.cursor;
    while (!this.isEOF() && this.isTagChar(this.source.charCodeAt(this.cursor))) {
      this.cursor++;
    }
    const tag = this.source.substring(tagNameStart, this.cursor);

    this.consumeWhitespace();
    this.consume('>');

    return {
      type: TokenType.TagClose,
      value: tag,
      start,
      end: this.cursor
    };
  }

  private scanAttributeValue(): Token {
    const start = this.cursor;

    if (this.match('{')) {
      let depth = 1;
      while (!this.isEOF() && depth > 0) {
        const ch = this.source.charCodeAt(this.cursor);
        if (ch === 34 /* '"' */ || ch === 39 /* "'" */ || ch === 96 /* '`' */) {
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
      if (depth === 0) {
        this.cursor++; // consume closing '}'
      }
      return {
        type: TokenType.AttributeValue,
        value: this.source.substring(start, this.cursor),
        start,
        end: this.cursor
      };
    }

    const quoteCode = this.source.charCodeAt(this.cursor);
    if (quoteCode === 34 /* '"' */ || quoteCode === 39 /* "'" */) {
      this.cursor++;
      const valStart = this.cursor;
      while (!this.isEOF() && this.source.charCodeAt(this.cursor) !== quoteCode) {
        this.cursor++;
      }
      const value = this.source.substring(valStart, this.cursor);
      this.cursor++; // consume closing quote
      return {
        type: TokenType.AttributeValue,
        value,
        start,
        end: this.cursor
      };
    }

    // Unquoted value
    while (!this.isEOF()) {
      const code = this.source.charCodeAt(this.cursor);
      if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 62) {
        break;
      }
      this.cursor++;
    }
    return {
      type: TokenType.AttributeValue,
      value: this.source.substring(start, this.cursor),
      start,
      end: this.cursor
    };
  }

  private scanText(): Token | null {
    const start = this.cursor;
    while (!this.isEOF()) {
      const ch = this.source.charCodeAt(this.cursor);
      if (ch === 60 /* '<' */ || ch === 123 /* '{' */) {
        break;
      }
      this.cursor++;
    }
    const content = this.source.substring(start, this.cursor);
    if (content.length === 0) return null;

    return {
      type: TokenType.Text,
      value: content,
      start,
      end: this.cursor
    };
  }

  private scanInterpolation(): Token {
    const start = this.cursor;
    this.cursor++; // consume '{'
    let depth = 1;

    while (!this.isEOF() && depth > 0) {
      const ch = this.source.charCodeAt(this.cursor);
      if (ch === 34 /* '"' */ || ch === 39 /* "'" */ || ch === 96 /* '`' */) {
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

    const expression = this.source.substring(start + 1, this.cursor).trim();
    if (depth === 0) {
      this.cursor++; // consume closing '}'
    } else {
      throw new Error(`Unclosed interpolation expression starting at index ${start}`);
    }

    return {
      type: TokenType.Interpolation,
      value: expression,
      start,
      end: this.cursor
    };
  }

  private isTagChar(code: number): boolean {
    return (
      (code >= 97 && code <= 122) ||
      (code >= 65 && code <= 90) ||
      (code >= 48 && code <= 57) ||
      code === 45
    );
  }

  private isAttrChar(code: number): boolean {
    return (
      (code >= 97 && code <= 122) ||
      (code >= 65 && code <= 90) ||
      (code >= 48 && code <= 57) ||
      code === 45 ||
      code === 58 ||
      code === 64
    );
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
 * Convenience function to tokenize template source string into tokens.
 *
 * @param source - Template source string.
 * @returns Token array.
 */
export function tokenize(source: string): Token[] {
  const lexer = new DriftJSLexer(source);
  return lexer.tokenize();
}
