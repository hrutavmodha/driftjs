import { DriftLexer } from './lexer.js';
import {
  Token,
  TokenType,
  ProgramNode,
  TemplateChildNode,
  ElementNode,
  AttributeNode,
  InterpolationNode,
  ASTNodeType,
  DriftParserError,
} from '../types/index.js';

interface TokenSource {
  nextToken(): Token;
}

class ArrayTokenSource implements TokenSource {
  private readonly tokens: readonly Token[];
  private current = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  public nextToken(): Token {
    if (this.current >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]!;
    }

    const token = this.tokens[this.current]!;
    this.current++;
    return token;
  }
}

/**
 * Parser for Drift template tokens producing a structured AST.
 *
 * The parser lazily pulls tokens from the lexer on demand and keeps a small
 * lookahead buffer for local decisions.
 */
export class DriftParser {
  private readonly tokenSource: TokenSource;
  private readonly lookahead: Token[] = [];

  constructor(input: DriftLexer | readonly Token[]) {
    this.tokenSource = Array.isArray(input) ? new ArrayTokenSource(input) : (input as DriftLexer);
  }

  public parse(): ProgramNode {
    this.lookahead.length = 0;
    return this.parseProgram();
  }

  private parseProgram(): ProgramNode {
    const startLoc = this.peek().loc.start;
    const body: TemplateChildNode[] = [];

    while (!this.isAtEnd()) {
      body.push(this.parseChild());
    }

    const endLoc = this.peek().loc.end;

    return {
      type: ASTNodeType.Program,
      body,
      loc: { start: startLoc, end: endLoc },
    };
  }

  private parseChild(): TemplateChildNode {
    const token = this.peek();

    if (token.type === TokenType.Comment) {
      this.advance();
      return {
        type: ASTNodeType.Comment,
        content: token.value,
        loc: token.loc,
      };
    }

    if (token.type === TokenType.Interpolation) {
      this.advance();
      return {
        type: ASTNodeType.Interpolation,
        expression: token.value,
        loc: token.loc,
      };
    }

    if (token.type === TokenType.TagOpen) {
      return this.parseElement();
    }

    if (token.type === TokenType.Text) {
      this.advance();
      return {
        type: ASTNodeType.Text,
        content: token.value,
        loc: token.loc,
      };
    }

    if (token.type === TokenType.TagOpenSlash) {
      throw new DriftParserError(
        `Unexpected closing tag '</${this.peek(1).value}>' without opening tag`,
        token.loc.start.line,
        token.loc.start.column,
        token.loc.start.offset
      );
    }

    throw new DriftParserError(
      `Unexpected token '${token.value}' of type '${token.type}'`,
      token.loc.start.line,
      token.loc.start.column,
      token.loc.start.offset
    );
  }

  private parseElement(): ElementNode {
    const openToken = this.consume(TokenType.TagOpen, 'Expected opening tag bracket');
    const startLoc = openToken.loc.start;

    const tagToken = this.consume(TokenType.Identifier, 'Expected tag name after opening bracket');
    const tagName = tagToken.value;

    const attributes: AttributeNode[] = [];
    while (
      !this.check(TokenType.TagClose) &&
      !this.check(TokenType.TagSelfClose) &&
      !this.isAtEnd()
    ) {
      attributes.push(this.parseAttribute());
    }

    if (this.check(TokenType.TagSelfClose)) {
      const selfCloseToken = this.advance();
      return {
        type: ASTNodeType.Element,
        tagName,
        attributes,
        children: [],
        isSelfClosing: true,
        loc: { start: startLoc, end: selfCloseToken.loc.end },
      };
    }

    this.consume(TokenType.TagClose, 'Expected closing bracket after attributes');

    const children: TemplateChildNode[] = [];
    while (!this.check(TokenType.TagOpenSlash) && !this.isAtEnd()) {
      children.push(this.parseChild());
    }

    if (this.isAtEnd()) {
      throw new DriftParserError(
        `Unclosed element '<${tagName}>', expected closing tag '</${tagName}>'`,
        startLoc.line,
        startLoc.column,
        startLoc.offset
      );
    }

    this.consume(TokenType.TagOpenSlash, `Expected closing tag '</${tagName}>'`);
    const closingTagToken = this.consume(
      TokenType.Identifier,
      'Expected closing tag name'
    );

    if (closingTagToken.value !== tagName) {
      throw new DriftParserError(
        `Mismatched closing tag. Expected '</${tagName}>' but got '</${closingTagToken.value}>'`,
        closingTagToken.loc.start.line,
        closingTagToken.loc.start.column,
        closingTagToken.loc.start.offset
      );
    }

    const closeBracketToken = this.consume(
      TokenType.TagClose,
      `Expected '>' after closing tag name`
    );

    return {
      type: ASTNodeType.Element,
      tagName,
      attributes,
      children,
      isSelfClosing: false,
      loc: { start: startLoc, end: closeBracketToken.loc.end },
    };
  }

  private parseAttribute(): AttributeNode {
    const nameToken = this.consume(TokenType.Identifier, 'Expected attribute name');
    const startLoc = nameToken.loc.start;
    const name = nameToken.value;

    if (this.matchToken(TokenType.Equals)) {
      const valueToken = this.peek();

      if (valueToken.type === TokenType.StringLiteral) {
        this.advance();
        return {
          type: ASTNodeType.Attribute,
          name,
          value: valueToken.value,
          loc: { start: startLoc, end: valueToken.loc.end },
        };
      }

      if (valueToken.type === TokenType.Interpolation) {
        this.advance();
        const interpNode: InterpolationNode = {
          type: ASTNodeType.Interpolation,
          expression: valueToken.value,
          loc: valueToken.loc,
        };
        return {
          type: ASTNodeType.Attribute,
          name,
          value: interpNode,
          loc: { start: startLoc, end: valueToken.loc.end },
        };
      }

      throw new DriftParserError(
        `Expected string literal or interpolation after '=' for attribute '${name}'`,
        valueToken.loc.start.line,
        valueToken.loc.start.column,
        valueToken.loc.start.offset
      );
    }

    return {
      type: ASTNodeType.Attribute,
      name,
      value: null,
      loc: { start: startLoc, end: nameToken.loc.end },
    };
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(relativeOffset = 0): Token {
    this.ensureLookahead(relativeOffset);
    return this.lookahead[Math.min(relativeOffset, this.lookahead.length - 1)]!;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== TokenType.EOF) {
      this.lookahead.shift();
    }
    return token;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private matchToken(type: TokenType): boolean {
    if (!this.check(type)) {
      return false;
    }

    this.advance();
    return true;
  }

  private consume(type: TokenType, errorMessage: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    const token = this.peek();
    throw new DriftParserError(
      errorMessage,
      token.loc.start.line,
      token.loc.start.column,
      token.loc.start.offset
    );
  }

  private ensureLookahead(relativeOffset: number): void {
    while (this.lookahead.length <= relativeOffset) {
      const nextToken = this.tokenSource.nextToken();
      this.lookahead.push(nextToken);

      if (nextToken.type === TokenType.EOF) {
        break;
      }
    }
  }
}
