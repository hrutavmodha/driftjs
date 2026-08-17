import type {
  Token,
  SourceLocation,
  DriftLexerState,
  LexerStateTransition,
  RawTextTagName,
} from '../types/index.js';
import {
  TokenType,
  DriftLexerError,
  LexerStateKind,
} from '../types/index.js';

/**
 * Canonical lexer transition rules for Drift templates.
 *
 * The lexer is parser-driven and emits one token per request. These rules make
 * every legal transition explicit so the lexer can validate its own state
 * changes while scanning Drift templates.
 */
export const LEXER_STATE_TRANSITIONS: {
  readonly [K in LexerStateKind]: readonly LexerStateTransition[];
} = {
  [LexerStateKind.Data]: [
    { to: LexerStateKind.Comment, when: 'The next characters are <!--', emits: 'Comment' },
    { to: LexerStateKind.EndTagOpen, when: 'The next characters are </', emits: 'TagOpenSlash' },
    { to: LexerStateKind.TagOpen, when: "The next character is '<' for a start tag", emits: 'TagOpen' },
    { to: LexerStateKind.Interpolation, when: "The next character is '{' in element content", emits: 'Interpolation' },
    { to: LexerStateKind.Data, when: 'Plain content is consumed up to the next control delimiter', emits: 'Text' },
    { to: LexerStateKind.EOF, when: 'The source has been fully consumed', emits: 'EOF' },
  ],
  [LexerStateKind.TagOpen]: [
    { to: LexerStateKind.BeforeAttributeName, when: 'A valid opening tag name is consumed', emits: 'Identifier' },
  ],
  [LexerStateKind.EndTagOpen]: [
    { to: LexerStateKind.BeforeAttributeName, when: 'A valid closing tag name is consumed', emits: 'Identifier' },
  ],
  [LexerStateKind.BeforeAttributeName]: [
    { to: LexerStateKind.AttributeName, when: 'An attribute name begins in an opening tag', emits: 'Identifier' },
    { to: LexerStateKind.Data, when: "A tag is closed with '>' and raw-text mode does not apply", emits: 'TagClose' },
    { to: LexerStateKind.RawText, when: "A script/style start tag is closed with '>'", emits: 'TagClose' },
    { to: LexerStateKind.Data, when: "A tag is self-closed with '/>'", emits: 'TagSelfClose' },
  ],
  [LexerStateKind.AttributeName]: [
    { to: LexerStateKind.AfterAttributeName, when: 'The attribute identifier has been fully consumed', emits: 'Identifier' },
  ],
  [LexerStateKind.AfterAttributeName]: [
    { to: LexerStateKind.BeforeAttributeValue, when: "The next character is '='", emits: 'Equals' },
    { to: LexerStateKind.BeforeAttributeName, when: 'The attribute is boolean and the lexer moves to the next attribute or tag boundary', emits: 'No token' },
  ],
  [LexerStateKind.BeforeAttributeValue]: [
    { to: LexerStateKind.AttributeValueQuoted, when: 'The attribute value starts with a quote', emits: 'StringLiteral' },
    { to: LexerStateKind.AttributeValueInterpolation, when: "The attribute value starts with '{'", emits: 'Interpolation' },
  ],
  [LexerStateKind.AttributeValueQuoted]: [
    { to: LexerStateKind.BeforeAttributeName, when: 'The closing quote is consumed', emits: 'StringLiteral' },
  ],
  [LexerStateKind.AttributeValueInterpolation]: [
    { to: LexerStateKind.BeforeAttributeName, when: 'The interpolation closes and the attribute value is complete', emits: 'Interpolation' },
  ],
  [LexerStateKind.Comment]: [
    { to: LexerStateKind.Data, when: 'The terminating --> delimiter is consumed', emits: 'Comment' },
  ],
  [LexerStateKind.Interpolation]: [
    { to: LexerStateKind.Data, when: 'A content interpolation closes with a matching brace', emits: 'Interpolation' },
    { to: LexerStateKind.BeforeAttributeName, when: 'An attribute interpolation closes with a matching brace', emits: 'Interpolation' },
  ],
  [LexerStateKind.RawText]: [
    { to: LexerStateKind.RawText, when: 'Plain raw-text content is consumed before the matching closing tag', emits: 'Text' },
    { to: LexerStateKind.EndTagOpen, when: 'The matching raw-text closing tag begins with </', emits: 'TagOpenSlash' },
    { to: LexerStateKind.EOF, when: 'The raw-text block reaches end of input before a closing tag appears', emits: 'EOF' },
  ],
  [LexerStateKind.EOF]: [
    { to: LexerStateKind.EOF, when: 'Additional parser requests are made after end of input', emits: 'EOF' },
  ],
};

export function isRawTextTagName(tagName: string): tagName is RawTextTagName {
  return tagName === 'script' || tagName === 'style';
}

const KNOWN_DIRECTIVES = new Set(['if', 'else', 'for', 'switch', 'case', 'default']);


/**
 * Stateful on-demand lexer for Drift templates.
 *
 * The parser drives tokenization by requesting one token at a time through
 * `nextToken()`. The lexer keeps its current lexical state between calls so it
 * can preserve HTML/XML parsing context without materializing the full token
 * stream up front.
 */
export class DriftLexer {
  private readonly source: string;
  private offset = 0;
  private line = 1;
  private column = 1;
  private emittedTokenCount = 0;
  private eofToken: Token | null = null;
  private state: DriftLexerState = { kind: LexerStateKind.Data };
  private blockDepth = 0;

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Returns exactly one token for each parser request.
   */
  public nextToken(): Token {
    const token = this.readNextToken();
    this.emittedTokenCount++;
    return token;
  }

  public getCurrentState(): DriftLexerState {
    return this.state;
  }

  public getEmittedTokenCount(): number {
    return this.emittedTokenCount;
  }

  private readNextToken(): Token {
    switch (this.state.kind) {
      case LexerStateKind.Data:
        return this.readDataToken();
      case LexerStateKind.TagOpen:
        return this.readTagNameToken(false);
      case LexerStateKind.EndTagOpen:
        return this.readTagNameToken(true);
      case LexerStateKind.BeforeAttributeName:
        return this.readBeforeAttributeNameToken();
      case LexerStateKind.AttributeName:
        return this.readAttributeNameToken();
      case LexerStateKind.AfterAttributeName:
        return this.readAfterAttributeNameToken();
      case LexerStateKind.BeforeAttributeValue:
        return this.readBeforeAttributeValueToken();
      case LexerStateKind.Comment:
      case LexerStateKind.Interpolation:
      case LexerStateKind.AttributeValueQuoted:
      case LexerStateKind.AttributeValueInterpolation:
        throw new Error(`Lexer entered transient state '${this.state.kind}' unexpectedly.`);
      case LexerStateKind.RawText:
        return this.readRawTextToken();
      case LexerStateKind.EOF:
        return this.getOrCreateEOFToken();
    }
  }

  private readDataToken(): Token {
    const startLoc = this.getLocation();

    if (this.isAtEnd()) {
      this.transitionTo({ kind: LexerStateKind.EOF });
      return this.getOrCreateEOFToken(startLoc);
    }

    if (this.startsWith('<!--')) {
      this.consumePattern('<!--');
      this.transitionTo({ kind: LexerStateKind.Comment });
      return this.readCommentToken(startLoc);
    }

    if (this.startsWith('</')) {
      this.consumePattern('</');
      this.transitionTo({ kind: LexerStateKind.EndTagOpen });
      return this.createToken(TokenType.TagOpenSlash, '</', startLoc);
    }

    if (this.peek() === '<') {
      this.advance();
      this.transitionTo({ kind: LexerStateKind.TagOpen });
      return this.createToken(TokenType.TagOpen, '<', startLoc);
    }

    if (this.peek() === '{') {
      this.advance();
      this.transitionTo({
        kind: LexerStateKind.Interpolation,
        context: 'content',
        tagName: null,
      });
      return this.readInterpolationToken(startLoc, 'content', null);
    }

    if (this.peek() === '}' && this.blockDepth > 0) {
      this.advance();
      this.blockDepth--;
      return this.createToken(TokenType.BlockClose, '}', startLoc);
    }

    if (this.peek() === '@') {
      return this.readDirectiveToken(startLoc);
    }

    return this.readTextToken();
  }

  private readDirectiveToken(startLoc: SourceLocation): Token {
    this.advance(); // consume '@'
    let name = '';
    while (!this.isAtEnd() && /[a-zA-Z]/.test(this.peek())) {
      name += this.advance();
    }
    if (!KNOWN_DIRECTIVES.has(name)) {
      throw new DriftLexerError(
        `Unknown directive '@${name}'`,
        startLoc.line,
        startLoc.column,
        startLoc.offset
      );
    }

    if (name === 'if') {
      return this.readDirectiveHeader(startLoc, TokenType.DirectiveIf);
    } else if (name === 'else') {
      this.skipWhitespace();
      if (this.startsWith('if') && !/[a-zA-Z0-9_]/.test(this.peek(2))) {
        this.consumePattern('if');
        return this.readDirectiveHeader(startLoc, TokenType.DirectiveElseIf);
      }
      this.skipWhitespace();
      if (this.peek() === '{') {
        this.advance();
        this.blockDepth++;
        return this.createToken(TokenType.DirectiveElse, '', startLoc);
      }
      throw new DriftLexerError(
        `Expected '{' after @else directive`,
        startLoc.line,
        startLoc.column,
        startLoc.offset
      );
    } else if (name === 'for') {
      return this.readDirectiveHeader(startLoc, TokenType.DirectiveFor);
    } else if (name === 'switch') {
      return this.readDirectiveHeader(startLoc, TokenType.DirectiveSwitch);
    } else if (name === 'case') {
      return this.readDirectiveHeader(startLoc, TokenType.DirectiveCase);
    } else {
      this.skipWhitespace();
      if (this.peek() === '{') {
        this.advance();
        this.blockDepth++;
      }
      return this.createToken(TokenType.DirectiveDefault, '', startLoc);
    }
  }

  private readDirectiveHeader(startLoc: SourceLocation, type: TokenType): Token {
    this.skipWhitespace();
    let headerContent = '';
    let parenDepth = 0;
    let inQuote: string | null = null;
    let isEscaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inRegex = false;
    let inRegexCharClass = false;

    while (!this.isAtEnd()) {
      const ch = this.advance();

      if (inLineComment) {
        headerContent += ch;
        if (ch === '\n') inLineComment = false;
        continue;
      }

      if (inBlockComment) {
        headerContent += ch;
        if (ch === '/' && headerContent.endsWith('*/')) inBlockComment = false;
        continue;
      }

      if (inRegex) {
        headerContent += ch;
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === '[') {
          inRegexCharClass = true;
        } else if (ch === ']' && inRegexCharClass) {
          inRegexCharClass = false;
        } else if (ch === '/' && !inRegexCharClass) {
          inRegex = false;
        }
        continue;
      }

      if (inQuote !== null) {
        headerContent += ch;
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === inQuote) {
          inQuote = null;
        }
        continue;
      }

      if (ch === '/' && !isEscaped) {
        const next = this.peek();
        if (next === '/') {
          inLineComment = true;
          headerContent += ch;
          continue;
        } else if (next === '*') {
          inBlockComment = true;
          headerContent += ch;
          continue;
        } else if (this.isRegexStart(headerContent)) {
          inRegex = true;
          inRegexCharClass = false;
          headerContent += ch;
          continue;
        }
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inQuote = ch;
        headerContent += ch;
        continue;
      }

      if (ch === '(') {
        parenDepth++;
        headerContent += ch;
        continue;
      }

      if (ch === ')') {
        if (parenDepth > 0) parenDepth--;
        headerContent += ch;
        continue;
      }

      if (ch === '{' && parenDepth === 0) {
        this.blockDepth++;
        return this.createToken(type, headerContent.trim(), startLoc);
      }

      headerContent += ch;
    }

    throw new DriftLexerError(
      `Unterminated directive header, expected '{'`,
      startLoc.line,
      startLoc.column,
      startLoc.offset
    );
  }

  private readTagNameToken(isClosingTag: boolean): Token {
    if (this.isAtEnd()) {
      throw this.createUnexpectedEOFError(
        isClosingTag ? 'after closing tag opener' : 'after opening tag opener'
      );
    }

    const startLoc = this.getLocation();
    const ch = this.peek();

    if (!this.isIdentifierStart(ch)) {
      throw new DriftLexerError(
        `Expected tag name but found '${ch || 'EOF'}'`,
        startLoc.line,
        startLoc.column,
        startLoc.offset
      );
    }

    const tagName = this.readIdentifierValue();
    const entersRawText = !isClosingTag && isRawTextTagName(tagName);

    this.transitionTo({
      kind: LexerStateKind.BeforeAttributeName,
      tagName,
      isClosingTag,
      entersRawText,
    });

    return this.createToken(TokenType.Identifier, tagName, startLoc);
  }

  private readBeforeAttributeNameToken(): Token {
    const state = this.state;
    if (state.kind !== LexerStateKind.BeforeAttributeName) {
      throw new Error(`Expected BeforeAttributeName state but found '${state.kind}'.`);
    }

    this.skipWhitespace();

    if (this.isAtEnd()) {
      throw this.createUnexpectedEOFError(`inside tag <${state.tagName}>`);
    }

    const startLoc = this.getLocation();

    if (state.isClosingTag) {
      if (this.peek() !== '>') {
        throw new DriftLexerError(
          `Unexpected character '${this.peek()}' inside closing tag </${state.tagName}>`,
          startLoc.line,
          startLoc.column,
          startLoc.offset
        );
      }

      this.advance();
      this.transitionTo({ kind: LexerStateKind.Data });
      return this.createToken(TokenType.TagClose, '>', startLoc);
    }

    if (this.peek() === '/') {
      let offset = 1;
      while (
        this.peek(offset) === ' ' ||
        this.peek(offset) === '\t' ||
        this.peek(offset) === '\n' ||
        this.peek(offset) === '\r'
      ) {
        offset++;
      }
      if (this.peek(offset) === '>') {
        for (let i = 0; i <= offset; i++) {
          this.advance();
        }
        this.transitionTo({ kind: LexerStateKind.Data });
        return this.createToken(TokenType.TagSelfClose, '/>', startLoc);
      }
    }

    if (this.peek() === '>') {
      this.advance();
      if (state.entersRawText && isRawTextTagName(state.tagName)) {
        this.transitionTo({
          kind: LexerStateKind.RawText,
          tagName: state.tagName,
        });
      } else {
        this.transitionTo({ kind: LexerStateKind.Data });
      }
      return this.createToken(TokenType.TagClose, '>', startLoc);
    }

    if (!this.isIdentifierStart(this.peek())) {
      throw new DriftLexerError(
        `Unexpected character '${this.peek()}' inside tag <${state.tagName}>`,
        startLoc.line,
        startLoc.column,
        startLoc.offset
      );
    }

    this.transitionTo({
      kind: LexerStateKind.AttributeName,
      tagName: state.tagName,
      attributeName: null,
    });

    return this.readAttributeNameToken();
  }

  private readAttributeNameToken(): Token {
    const state = this.state;
    if (state.kind !== LexerStateKind.AttributeName) {
      throw new Error(`Expected AttributeName state but found '${state.kind}'.`);
    }

    const startLoc = this.getLocation();

    if (!this.isIdentifierStart(this.peek())) {
      throw new DriftLexerError(
        `Expected attribute name but found '${this.peek() || 'EOF'}'`,
        startLoc.line,
        startLoc.column,
        startLoc.offset
      );
    }

    const attributeName = this.readIdentifierValue();
    const tagName = state.tagName;

    this.transitionTo({
      kind: LexerStateKind.AfterAttributeName,
      tagName,
      attributeName,
    });

    return this.createToken(TokenType.Identifier, attributeName, startLoc);
  }

  private readAfterAttributeNameToken(): Token {
    const state = this.state;
    if (state.kind !== LexerStateKind.AfterAttributeName) {
      throw new Error(`Expected AfterAttributeName state but found '${state.kind}'.`);
    }

    const tagName = state.tagName;
    const attributeName = state.attributeName;

    this.skipWhitespace();

    if (this.isAtEnd()) {
      throw this.createUnexpectedEOFError(
        `after attribute '${attributeName}' in <${tagName}>`
      );
    }

    if (this.peek() === '=') {
      const startLoc = this.getLocation();
      this.advance();
      this.transitionTo({
        kind: LexerStateKind.BeforeAttributeValue,
        tagName,
        attributeName,
      });
      return this.createToken(TokenType.Equals, '=', startLoc);
    }

    this.transitionTo({
      kind: LexerStateKind.BeforeAttributeName,
      tagName,
      isClosingTag: false,
      entersRawText: isRawTextTagName(tagName),
    });

    return this.readBeforeAttributeNameToken();
  }

  private readBeforeAttributeValueToken(): Token {
    const state = this.state;
    if (state.kind !== LexerStateKind.BeforeAttributeValue) {
      throw new Error(`Expected BeforeAttributeValue state but found '${state.kind}'.`);
    }

    const tagName = state.tagName;
    const attributeName = state.attributeName;

    this.skipWhitespace();

    if (this.isAtEnd()) {
      throw this.createUnexpectedEOFError(
        `before value for attribute '${attributeName}' in <${tagName}>`
      );
    }

    const startLoc = this.getLocation();
    const ch = this.peek();

    if (ch === '"' || ch === "'") {
      this.advance();
      this.transitionTo({
        kind: LexerStateKind.AttributeValueQuoted,
        tagName,
        attributeName,
        quote: ch,
      });
      return this.readQuotedStringToken(startLoc, ch, tagName);
    }

    if (ch === '{') {
      this.advance();
      this.transitionTo({
        kind: LexerStateKind.AttributeValueInterpolation,
        tagName,
        attributeName,
      });
      return this.readInterpolationToken(startLoc, 'attribute', tagName);
    }

    throw new DriftLexerError(
      `Expected quoted string or interpolation for attribute '${attributeName}' in <${tagName}>`,
      startLoc.line,
      startLoc.column,
      startLoc.offset
    );
  }

  private readCommentToken(startLoc: SourceLocation): Token {
    let commentContent = '';

    while (!this.isAtEnd()) {
      if (this.startsWith('-->')) {
        this.consumePattern('-->');
        this.transitionTo({ kind: LexerStateKind.Data });
        return this.createToken(TokenType.Comment, commentContent, startLoc);
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

  private isRegexStart(expr: string): boolean {
    const trimmed = expr.trimEnd();
    if (trimmed.length === 0) return true;
    const lastChar = trimmed[trimmed.length - 1];
    if ('=(,:;!&|?[{}+-*%<>~^'.includes(lastChar!)) return true;
    const lastWord = trimmed.split(/\s+/).pop();
    if (lastWord && ['return', 'yield', 'await', 'case', 'typeof', 'void', 'delete', 'instanceof', 'in', 'do'].includes(lastWord)) return true;
    return false;
  }

  private readInterpolationToken(
    startLoc: SourceLocation,
    context: 'content' | 'attribute',
    tagName: string | null
  ): Token {
    let braceDepth = 1;
    let inStringQuote: string | null = null;
    let isEscaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let inRegex = false;
    let inRegexCharClass = false;
    let templateStack: number[] = [];
    let expression = '';

    while (!this.isAtEnd()) {
      const ch = this.advance();

      if (inLineComment) {
        expression += ch;
        if (ch === '\n') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        expression += ch;
        if (ch === '/' && expression.endsWith('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (inRegex) {
        expression += ch;
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === '[') {
          inRegexCharClass = true;
        } else if (ch === ']' && inRegexCharClass) {
          inRegexCharClass = false;
        } else if (ch === '/' && !inRegexCharClass) {
          inRegex = false;
        }
        continue;
      }

      if (inStringQuote !== null) {
        expression += ch;
        if (isEscaped) {
          isEscaped = false;
        } else if (ch === '\\') {
          isEscaped = true;
        } else if (ch === inStringQuote) {
          inStringQuote = null;
        } else if (inStringQuote === '`' && ch === '{' && expression.endsWith('${')) {
          templateStack.push(braceDepth);
          inStringQuote = null;
          braceDepth++;
        }
        continue;
      }

      if (ch === '/' && !isEscaped) {
        const next = this.peek();
        if (next === '/') {
          inLineComment = true;
          expression += ch;
          continue;
        } else if (next === '*') {
          inBlockComment = true;
          expression += ch;
          continue;
        } else if (this.isRegexStart(expression)) {
          inRegex = true;
          inRegexCharClass = false;
          expression += ch;
          continue;
        }
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
        if (templateStack.length > 0 && braceDepth === templateStack[templateStack.length - 1]) {
          templateStack.pop();
          inStringQuote = '`';
        }

        if (braceDepth === 0) {
          if (context === 'attribute' && tagName !== null) {
            this.transitionTo({
              kind: LexerStateKind.BeforeAttributeName,
              tagName,
              isClosingTag: false,
              entersRawText: isRawTextTagName(tagName),
            });
          } else {
            this.transitionTo({ kind: LexerStateKind.Data });
          }

          return this.createToken(TokenType.Interpolation, expression, startLoc);
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

  private readRawTextToken(): Token {
    const state = this.state;
    if (state.kind !== LexerStateKind.RawText) {
      throw new Error(`Expected RawText state but found '${state.kind}'.`);
    }

    const startLoc = this.getLocation();
    const closingSequence = `</${state.tagName}`;

    if (this.isAtEnd()) {
      this.transitionTo({ kind: LexerStateKind.EOF });
      return this.getOrCreateEOFToken(startLoc);
    }

    if (this.isRawTextClosingTagAhead(closingSequence)) {
      this.consumePattern('</');
      this.transitionTo({ kind: LexerStateKind.EndTagOpen });
      return this.createToken(TokenType.TagOpenSlash, '</', startLoc);
    }

    let text = '';

    while (!this.isAtEnd()) {
      if (this.isRawTextClosingTagAhead(closingSequence)) {
        break;
      }
      text += this.advance();
    }

    if (text.length > 0) {
      return this.createToken(TokenType.Text, text, startLoc);
    }

    this.transitionTo({ kind: LexerStateKind.EOF });
    return this.getOrCreateEOFToken(startLoc);
  }

  private readTextToken(): Token {
    const startLoc = this.getLocation();
    let text = '';

    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === '<' || ch === '{' || ch === '@' || (ch === '}' && this.blockDepth > 0)) {
        break;
      }
      text += this.advance();
    }

    return this.createToken(TokenType.Text, text, startLoc);
  }

  private readQuotedStringToken(
    startLoc: SourceLocation,
    quote: '"' | "'",
    tagName: string
  ): Token {
    let value = '';

    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === quote) {
        this.advance();
        this.transitionTo({
          kind: LexerStateKind.BeforeAttributeName,
          tagName,
          isClosingTag: false,
          entersRawText: isRawTextTagName(tagName),
        });
        return this.createToken(TokenType.StringLiteral, value, startLoc);
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

  private readIdentifierValue(): string {
    let value = '';

    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      value += this.advance();
    }

    return value;
  }

  private getOrCreateEOFToken(startLoc: SourceLocation = this.getLocation()): Token {
    if (this.eofToken !== null) {
      return this.eofToken;
    }

    this.eofToken = {
      type: TokenType.EOF,
      value: '',
      loc: { start: startLoc, end: startLoc },
    };

    return this.eofToken;
  }

  private createToken(type: TokenType, value: string, start: SourceLocation): Token {
    return {
      type,
      value,
      loc: { start, end: this.getLocation() },
    };
  }

  private createUnexpectedEOFError(context: string): DriftLexerError {
    const loc = this.getLocation();
    return new DriftLexerError(
      `Unexpected end of input ${context}`,
      loc.line,
      loc.column,
      loc.offset
    );
  }

  private transitionTo(nextState: DriftLexerState): void {
    const allowedTransitions = LEXER_STATE_TRANSITIONS[this.state.kind];
    const isAllowed = allowedTransitions.some((transition) => transition.to === nextState.kind);

    if (!isAllowed) {
      throw new Error(`Invalid lexer transition from '${this.state.kind}' to '${nextState.kind}'.`);
    }

    this.state = nextState;
  }

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

  private startsWith(pattern: string): boolean {
    return this.source.startsWith(pattern, this.offset);
  }

  private consumePattern(pattern: string): void {
    for (let i = 0; i < pattern.length; i++) {
      this.advance();
    }
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
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 95 ||
      code === 36
    );
  }

  private isIdentifierChar(ch: string): boolean {
    if (ch.length === 0) return false;
    const code = ch.charCodeAt(0);
    return (
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 95 ||
      code === 36 ||
      code === 45
    );
  }

  private isRawTextClosingTagAhead(closingSequence: string): boolean {
    if (!this.startsWith(closingSequence)) {
      return false;
    }

    const boundary = this.peek(closingSequence.length);
    return boundary === '' || boundary === '>' || boundary === ' ' || boundary === '\t' || boundary === '\r' || boundary === '\n';
  }
}
