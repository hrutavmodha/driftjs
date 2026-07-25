import {
  Token,
  TokenType,
  SourceLocation,
  DriftLexerError,
} from '../types/index.js';

/**
 * Lexer for Drift templates converting raw template string into a token stream.
 * Time Complexity: O(N) where N is the length of the source template string.
 * Space Complexity: O(T) where T is the total number of tokens produced.
 */
export class DriftLexer {
  private readonly source: string;
  private offset = 0;
  private line = 1;
  private column = 1;
  private inTagHeader = false;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenizes the entire source string and returns an array of tokens ending with an EOF token.
   * @returns Array of tokens.
   */
  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token !== null) {
        tokens.push(token);
      }
    }
    const eofLoc = this.getLocation();
    tokens.push({
      type: TokenType.EOF,
      value: '',
      loc: { start: eofLoc, end: eofLoc },
    });
    return tokens;
  }

  /**
   * Reads the next token from source based on current lexer state.
   */
  private nextToken(): Token | null {
    if (this.inTagHeader) {
      this.skipWhitespace();
      if (this.isAtEnd()) {
        return null;
      }
      return this.nextTagHeaderToken();
    }
    return this.nextContentToken();
  }

  /**
   * Scans tokens while inside an XML tag header (attributes, closing bracket).
   */
  private nextTagHeaderToken(): Token {
    const startLoc = this.getLocation();
    const ch = this.peek();

    if (ch === '>') {
      this.advance();
      this.inTagHeader = false;
      return { type: TokenType.TagClose, value: '>', loc: { start: startLoc, end: this.getLocation() } };
    }

    if (ch === '/' && this.peek(1) === '>') {
      this.advance();
      this.advance();
      this.inTagHeader = false;
      return { type: TokenType.TagSelfClose, value: '/>', loc: { start: startLoc, end: this.getLocation() } };
    }

    if (ch === '=') {
      this.advance();
      return { type: TokenType.Equals, value: '=', loc: { start: startLoc, end: this.getLocation() } };
    }

    if (ch === '"' || ch === "'") {
      return this.readString(ch);
    }

    if (ch === '{') {
      return this.readInterpolation();
    }

    if (this.isIdentifierStart(ch)) {
      return this.readIdentifier();
    }

    throw new DriftLexerError(
      `Unexpected character '${ch}' inside tag header`,
      startLoc.line,
      startLoc.column,
      startLoc.offset
    );
  }

  /**
   * Scans tokens while in template content (children of tags).
   */
  private nextContentToken(): Token {
    const startLoc = this.getLocation();

    if (this.match('<!--')) {
      return this.readComment(startLoc);
    }

    if (this.match('</')) {
      this.inTagHeader = true;
      return { type: TokenType.TagOpenSlash, value: '</', loc: { start: startLoc, end: this.getLocation() } };
    }

    if (this.peek() === '<') {
      this.advance();
      this.inTagHeader = true;
      return { type: TokenType.TagOpen, value: '<', loc: { start: startLoc, end: this.getLocation() } };
    }

    if (this.peek() === '{') {
      return this.readInterpolation();
    }

    return this.readText();
  }

  /**
   * Scans XML comment <!-- comment -->
   */
  private readComment(startLoc: SourceLocation): Token {
    let commentContent = '';
    while (!this.isAtEnd()) {
      if (this.match('-->')) {
        return {
          type: TokenType.Comment,
          value: commentContent,
          loc: { start: startLoc, end: this.getLocation() },
        };
      }
      commentContent += this.advance();
    }

    throw new DriftLexerError(
      'Unterminated XML comment',
      startLoc.line,
      startLoc.column,
      startLoc.offset
    );
  }

  /**
   * Scans an interpolation expression enclosed in `{...}`.
   */
  private readInterpolation(): Token {
    const startLoc = this.getLocation();
    this.advance(); // consume opening '{'

    let braceDepth = 1;
    let inStringQuote: string | null = null;
    let isEscaped = false;
    let expression = '';

    while (!this.isAtEnd()) {
      const ch = this.advance();

      if (inStringQuote !== null) {
        expression += ch;
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === inStringQuote) {
          inStringQuote = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inStringQuote = ch;
        expression += ch;
        continue;
      }

      if (ch === '{') {
        braceDepth++;
        expression += ch;
        continue;
      }

      if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          return {
            type: TokenType.Interpolation,
            value: expression,
            loc: { start: startLoc, end: this.getLocation() },
          };
        }
        expression += ch;
        continue;
      }

      expression += ch;
    }

    throw new DriftLexerError(
      'Unterminated interpolation expression, expected closing brace \'}\'',
      startLoc.line,
      startLoc.column,
      startLoc.offset
    );
  }

  /**
   * Scans text content up to next '<', '{', or '<!--'.
   */
  private readText(): Token {
    const startLoc = this.getLocation();
    let text = '';

    while (!this.isAtEnd()) {
      if (this.peek() === '<' || this.peek() === '{') {
        break;
      }
      text += this.advance();
    }

    return {
      type: TokenType.Text,
      value: text,
      loc: { start: startLoc, end: this.getLocation() },
    };
  }

  /**
   * Scans a string literal enclosed in double or single quotes.
   */
  private readString(quote: string): Token {
    const startLoc = this.getLocation();
    this.advance(); // consume quote

    let value = '';
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === quote) {
        this.advance(); // consume closing quote
        return {
          type: TokenType.StringLiteral,
          value,
          loc: { start: startLoc, end: this.getLocation() },
        };
      }
      value += this.advance();
    }

    throw new DriftLexerError(
      `Unterminated string literal, expected closing quote ${quote}`,
      startLoc.line,
      startLoc.column,
      startLoc.offset
    );
  }

  /**
   * Scans an identifier (tag name, attribute name).
   */
  private readIdentifier(): Token {
    const startLoc = this.getLocation();
    let value = '';

    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      value += this.advance();
    }

    return {
      type: TokenType.Identifier,
      value,
      loc: { start: startLoc, end: this.getLocation() },
    };
  }

  /**
   * Returns current source location.
   */
  private getLocation(): SourceLocation {
    return {
      line: this.line,
      column: this.column,
      offset: this.offset,
    };
  }

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private peek(relativeOffset = 0): string {
    const target = this.offset + relativeOffset;
    if (target >= this.source.length) {
      return '';
    }
    return this.source[target] ?? '';
  }

  private advance(): string {
    const ch = this.source[this.offset] ?? '';
    this.offset++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(pattern: string): boolean {
    if (this.source.startsWith(pattern, this.offset)) {
      for (let i = 0; i < pattern.length; i++) {
        this.advance();
      }
      return true;
    }
    return false;
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private isIdentifierStart(ch: string): boolean {
    if (ch.length === 0) return false;
    const code = ch.charCodeAt(0);
    return (
      (code >= 65 && code <= 90) ||  // A-Z
      (code >= 97 && code <= 122) // a-z
    );
  }

  private isIdentifierChar(ch: string): boolean {
    if (ch.length === 0) return false;
    const code = ch.charCodeAt(0);
    return (
      (code >= 65 && code <= 90) ||  // A-Z
      (code >= 97 && code <= 122) || // a-z
      (code >= 48 && code <= 57) ||  // 0-9
      code === 95 ||                 // _
      code === 45                    // -
    );
  }
}
