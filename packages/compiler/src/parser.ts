import { DriftLexer } from './lexer.js';
import type {
  Token,
  TokenSource,
  ProgramNode,
  TemplateChildNode,
  ElementNode,
  AttributeNode,
  InterpolationNode,
  IfNode,
  ForNode,
  SwitchNode,
  CaseBranch,
} from '../types/index.js';
import {
  TokenType,
  ASTNodeType,
  DriftParserError,
} from '../types/index.js';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

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
 * Decodes standard named and numeric HTML character references in text nodes and attributes.
 */
export function decodeHTMLEntities(text: string): string {
  if (!text || !text.includes('&')) return text;
  return text.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z0-9]+));/g, (match, dec, hex, named) => {
    if (dec) {
      const code = parseInt(dec, 10);
      try {
        if (!isNaN(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
          return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
        }
        return '\uFFFD';
      } catch {
        return '\uFFFD';
      }
    }
    if (hex) {
      const code = parseInt(hex, 16);
      try {
        if (!isNaN(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
          return String.fromCodePoint ? String.fromCodePoint(code) : String.fromCharCode(code);
        }
        return '\uFFFD';
      } catch {
        return '\uFFFD';
      }
    }
    switch (named) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      case 'nbsp': return '\u00A0';
      case 'copy': return '©';
      case 'reg': return '®';
      case 'trade': return '™';
      case 'mdash': return '—';
      case 'ndash': return '–';
      case 'hellip': return '…';
      case 'laquo': return '«';
      case 'raquo': return '»';
      case 'ldquo': return '“';
      case 'rdquo': return '”';
      case 'lsquo': return '‘';
      case 'rsquo': return '’';
      case 'bull': return '•';
      case 'times': return '×';
      case 'divide': return '÷';
      case 'plusmn': return '±';
      case 'euro': return '€';
      case 'pound': return '£';
      case 'yen': return '¥';
      case 'cent': return '¢';
      case 'deg': return '°';
      case 'para': return '¶';
      case 'sect': return '§';
      case 'micro': return 'µ';
      case 'middot': return '·';
      default:
        return match;
    }
  });
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

    if (token.type === TokenType.DirectiveIf) {
      return this.parseIfDirective();
    }

    if (token.type === TokenType.DirectiveFor) {
      return this.parseForDirective();
    }

    if (token.type === TokenType.DirectiveSwitch) {
      return this.parseSwitchDirective();
    }

    if (token.type === TokenType.Text) {
      this.advance();
      return {
        type: ASTNodeType.Text,
        content: decodeHTMLEntities(token.value),
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

    const closeToken = this.consume(TokenType.TagClose, 'Expected closing bracket after attributes');

    if (VOID_ELEMENTS.has(tagName.toLowerCase())) {
      return {
        type: ASTNodeType.Element,
        tagName,
        attributes,
        children: [],
        isSelfClosing: true,
        loc: { start: startLoc, end: closeToken.loc.end },
      };
    }

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

    if (closingTagToken.value !== tagName && closingTagToken.value.toLowerCase() !== tagName.toLowerCase()) {
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
          value: decodeHTMLEntities(valueToken.value),
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

  private parseIfDirective(): IfNode {
    const ifToken = this.consume(TokenType.DirectiveIf, 'Expected @if directive');
    const startLoc = ifToken.loc.start;
    const test = ifToken.value;

    const consequent: TemplateChildNode[] = [];
    while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
      consequent.push(this.parseChild());
    }
    const endBlockToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @if block');

    let alternate: TemplateChildNode[] | IfNode | null = null;
    let endLoc = endBlockToken.loc.end;

    this.skipWhitespaceTokens();

    if (this.check(TokenType.DirectiveElseIf)) {
      alternate = this.parseElseIfChain();
      endLoc = alternate.loc.end;
    } else if (this.check(TokenType.DirectiveElse)) {
      this.advance(); // consume @else
      const elseBody: TemplateChildNode[] = [];
      while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
        elseBody.push(this.parseChild());
      }
      const elseCloseToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @else block');
      alternate = elseBody;
      endLoc = elseCloseToken.loc.end;
    }

    return {
      type: ASTNodeType.If,
      test,
      consequent,
      alternate,
      loc: { start: startLoc, end: endLoc },
    };
  }

  private parseElseIfChain(): IfNode {
    const elseIfToken = this.consume(TokenType.DirectiveElseIf, 'Expected @else if directive');
    const startLoc = elseIfToken.loc.start;
    const test = elseIfToken.value;

    const consequent: TemplateChildNode[] = [];
    while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
      consequent.push(this.parseChild());
    }
    const endBlockToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @else if block');

    let alternate: TemplateChildNode[] | IfNode | null = null;
    let endLoc = endBlockToken.loc.end;

    this.skipWhitespaceTokens();

    if (this.check(TokenType.DirectiveElseIf)) {
      alternate = this.parseElseIfChain();
      endLoc = alternate.loc.end;
    } else if (this.check(TokenType.DirectiveElse)) {
      this.advance(); // consume @else
      const elseBody: TemplateChildNode[] = [];
      while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
        elseBody.push(this.parseChild());
      }
      const elseCloseToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @else block');
      alternate = elseBody;
      endLoc = elseCloseToken.loc.end;
    }

    return {
      type: ASTNodeType.If,
      test,
      consequent,
      alternate,
      loc: { start: startLoc, end: endLoc },
    };
  }

  private parseForDirective(): ForNode {
    const forToken = this.consume(TokenType.DirectiveFor, 'Expected @for directive');
    const startLoc = forToken.loc.start;
    let header = forToken.value.trim(); // e.g. "item in items" or "(item, index) in items"

    function hasMatchingOuterParens(str: string): boolean {
      if (!str.startsWith('(') || !str.endsWith(')')) return false;
      let depth = 0;
      let inQuote: string | null = null;
      let isEscaped = false;
      for (let i = 0; i < str.length - 1; i++) {
        const ch = str[i]!;
        if (inQuote !== null) {
          if (isEscaped) isEscaped = false;
          else if (ch === '\\') isEscaped = true;
          else if (ch === inQuote) inQuote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') inQuote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth === 0) return false;
      }
      return depth === 1;
    }

    function findInIndex(str: string): number {
      let parenDepth = 0;
      let bracketDepth = 0;
      let braceDepth = 0;
      let inQuote: string | null = null;
      let isEscaped = false;

      for (let i = 0; i <= str.length - 4; i++) {
        const ch = str[i]!;
        if (inQuote !== null) {
          if (isEscaped) {
            isEscaped = false;
          } else if (ch === '\\') {
            isEscaped = true;
          } else if (ch === inQuote) {
            inQuote = null;
          }
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inQuote = ch;
          continue;
        }
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
        else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && str.slice(i, i + 4) === ' in ') {
          return i;
        }
      }
      return -1;
    }

    let inIndex = findInIndex(header);
    if (inIndex === -1 && hasMatchingOuterParens(header)) {
      const stripped = header.slice(1, -1).trim();
      const strippedIn = findInIndex(stripped);
      if (strippedIn !== -1) {
        header = stripped;
        inIndex = strippedIn;
      }
    }

    if (inIndex === -1) {
      throw new DriftParserError(
        `Invalid @for header syntax '${header}'. Expected format: 'item in list' or '(item, index) in list'`,
        forToken.loc.start.line,
        forToken.loc.start.column,
        forToken.loc.start.offset
      );
    }


    const lhs = header.slice(0, inIndex).trim();
    let rawIterable = header.slice(inIndex + 4).trim();
    let key: string | null = null;

    const keyMatchInfo = (() => {
      let parenDepth = 0;
      let bracketDepth = 0;
      let braceDepth = 0;
      let inQuote: string | null = null;
      let isEscaped = false;

      for (let i = 0; i < rawIterable.length; i++) {
        const ch = rawIterable[i]!;
        if (inQuote !== null) {
          if (isEscaped) {
            isEscaped = false;
          } else if (ch === '\\') {
            isEscaped = true;
          } else if (ch === inQuote) {
            inQuote = null;
          }
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inQuote = ch;
          continue;
        }
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
        else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
          const match = rawIterable.slice(i).match(/^(\s+key\s+)(.+)$/);
          if (match && match[1] && match[2]) {
            return {
              iterableEnd: i,
              key: match[2].trim(),
            };
          }
        }
      }
      return null;
    })();

    if (keyMatchInfo) {
      key = keyMatchInfo.key;
      rawIterable = rawIterable.slice(0, keyMatchInfo.iterableEnd).trim();
    }

    const iterable = rawIterable;

    let item = lhs;
    let index: string | null = null;

    while (hasMatchingOuterParens(item)) {
      item = item.slice(1, -1).trim();
    }


    const commaIdx = (() => {
      let parenDepth = 0;
      let bracketDepth = 0;
      let braceDepth = 0;
      let inQuote: string | null = null;
      let isEscaped = false;

      for (let i = 0; i < item.length; i++) {
        const ch = item[i]!;
        if (inQuote !== null) {
          if (isEscaped) isEscaped = false;
          else if (ch === '\\') isEscaped = true;
          else if (ch === inQuote) inQuote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') inQuote = ch;
        else if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        else if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
        else if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
          return i;
        }
      }
      return -1;
    })();

    if (commaIdx !== -1) {
      const firstPart = item.slice(0, commaIdx).trim();
      index = item.slice(commaIdx + 1).trim() || null;
      item = firstPart;
      while (hasMatchingOuterParens(item)) {
        item = item.slice(1, -1).trim();
      }
    }

    const body: TemplateChildNode[] = [];
    while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
      body.push(this.parseChild());
    }
    const endBlockToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @for block');

    return {
      type: ASTNodeType.For,
      item,
      index,
      iterable,
      key,
      body,
      loc: { start: startLoc, end: endBlockToken.loc.end },
    };
  }

  private parseSwitchDirective(): SwitchNode {
    const switchToken = this.consume(TokenType.DirectiveSwitch, 'Expected @switch directive');
    const startLoc = switchToken.loc.start;
    const discriminant = switchToken.value;
    const cases: CaseBranch[] = [];

    this.skipWhitespaceTokens();
    while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
      if (this.check(TokenType.DirectiveCase)) {
        const caseToken = this.advance();
        const caseBody: TemplateChildNode[] = [];
        while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
          caseBody.push(this.parseChild());
        }
        const closeToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @case block');
        cases.push({
          expression: caseToken.value,
          body: caseBody,
          loc: { start: caseToken.loc.start, end: closeToken.loc.end },
        });
      } else if (this.check(TokenType.DirectiveDefault)) {
        const defaultToken = this.advance();
        const defaultBody: TemplateChildNode[] = [];
        while (!this.check(TokenType.BlockClose) && !this.isAtEnd()) {
          defaultBody.push(this.parseChild());
        }
        const closeToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @default block');
        cases.push({
          expression: null,
          body: defaultBody,
          loc: { start: defaultToken.loc.start, end: closeToken.loc.end },
        });
      } else {
        throw new DriftParserError(
          `Unexpected token '${this.peek().value}' inside @switch block. Expected @case or @default.`,
          this.peek().loc.start.line,
          this.peek().loc.start.column,
          this.peek().loc.start.offset
        );
      }
      this.skipWhitespaceTokens();
    }

    const endBlockToken = this.consume(TokenType.BlockClose, 'Expected closing brace } for @switch block');

    return {
      type: ASTNodeType.Switch,
      discriminant,
      cases,
      loc: { start: startLoc, end: endBlockToken.loc.end },
    };
  }

  private skipWhitespaceTokens(): void {
    while (this.check(TokenType.Text) && this.peek().value.trim().length === 0) {
      this.advance();
    }
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
