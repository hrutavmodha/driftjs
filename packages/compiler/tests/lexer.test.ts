import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import {
  Token,
  TokenType,
  DriftLexerError,
  LexerStateKind,
} from '../types/index.js';

function collectTokens(lexer: DriftLexer): Token[] {
  const tokens: Token[] = [];

  while (true) {
    const token = lexer.nextToken();
    tokens.push(token);
    if (token.type === TokenType.EOF) {
      return tokens;
    }
  }
}

describe('DriftLexer', () => {
  it('returns one token per invocation and tracks lexical state transitions', () => {
    const lexer = new DriftLexer('<div class="hero">Hello</div>');

    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.Data);

    expect(lexer.nextToken().type).toBe(TokenType.TagOpen);
    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.TagOpen);

    expect(lexer.nextToken()).toMatchObject({ type: TokenType.Identifier, value: 'div' });
    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.BeforeAttributeName);

    expect(lexer.nextToken()).toMatchObject({ type: TokenType.Identifier, value: 'class' });
    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.AfterAttributeName);

    expect(lexer.nextToken()).toMatchObject({ type: TokenType.Equals, value: '=' });
    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.BeforeAttributeValue);

    expect(lexer.nextToken()).toMatchObject({ type: TokenType.StringLiteral, value: 'hero' });
    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.BeforeAttributeName);

    expect(lexer.nextToken().type).toBe(TokenType.TagClose);
    expect(lexer.getCurrentState().kind).toBe(LexerStateKind.Data);

    expect(lexer.nextToken()).toMatchObject({ type: TokenType.Text, value: 'Hello' });
    expect(lexer.nextToken().type).toBe(TokenType.TagOpenSlash);
    expect(lexer.nextToken()).toMatchObject({ type: TokenType.Identifier, value: 'div' });
    expect(lexer.nextToken().type).toBe(TokenType.TagClose);
    expect(lexer.nextToken().type).toBe(TokenType.EOF);
  });

  it('handles empty input and whitespace-only input', () => {
    const emptyLexer = new DriftLexer('');
    const emptyTokens = collectTokens(emptyLexer);
    expect(emptyTokens).toHaveLength(1);
    expect(emptyTokens[0]?.type).toBe(TokenType.EOF);

    const wsLexer = new DriftLexer('   \n\t  ');
    const wsTokens = collectTokens(wsLexer);
    expect(wsTokens).toHaveLength(2);
    expect(wsTokens[0]).toMatchObject({ type: TokenType.Text, value: '   \n\t  ' });
    expect(wsTokens[1]?.type).toBe(TokenType.EOF);
  });

  it('lexes nested braces and strings inside interpolations correctly', () => {
    const lexer = new DriftLexer('<div>{ { a: { b: "hello } world" } }.a.b }</div>');
    const tokens = collectTokens(lexer);

    const interpolation = tokens.find((token) => token.type === TokenType.Interpolation);
    expect(interpolation?.value).toBe(' { a: { b: "hello } world" } }.a.b ');
  });

  it('lexes template literals with backticks inside interpolations', () => {
    const lexer = new DriftLexer('<span>{ `items: ${count}` }</span>');
    const tokens = collectTokens(lexer);

    const interpolation = tokens.find((token) => token.type === TokenType.Interpolation);
    expect(interpolation?.value).toBe(' `items: ${count}` ');
  });

  it('lexes adjacent interpolations without text in between', () => {
    const lexer = new DriftLexer('{first}{second}');
    const tokens = collectTokens(lexer);

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.Interpolation,
      TokenType.Interpolation,
      TokenType.EOF,
    ]);
    expect(tokens[0]?.value).toBe('first');
    expect(tokens[1]?.value).toBe('second');
  });

  it('lexes comments containing tags and special characters', () => {
    const lexer = new DriftLexer('<!-- <div class="hidden">Ignore me & my {stuff}</div> -->');
    const tokens = collectTokens(lexer);

    expect(tokens[0]).toMatchObject({
      type: TokenType.Comment,
      value: ' <div class="hidden">Ignore me & my {stuff}</div> ',
    });
  });

  it('lexes attributes with hyphen and underscore identifiers', () => {
    const lexer = new DriftLexer('<custom-button data-test-id="123" class_name="primary">Click</custom-button>');
    const tokens = collectTokens(lexer);

    const identifiers = tokens
      .filter((token) => token.type === TokenType.Identifier)
      .map((token) => token.value);

    expect(identifiers).toEqual(['custom-button', 'data-test-id', 'class_name', 'custom-button']);
  });

  it('treats script and style contents as raw text blocks', () => {
    const lexer = new DriftLexer('<script>if (a < b) { console.log("ok"); }</script><style>.x { color: red; }</style>');
    const tokens = collectTokens(lexer);

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.TagOpen,
      TokenType.Identifier,
      TokenType.TagClose,
      TokenType.Text,
      TokenType.TagOpenSlash,
      TokenType.Identifier,
      TokenType.TagClose,
      TokenType.TagOpen,
      TokenType.Identifier,
      TokenType.TagClose,
      TokenType.Text,
      TokenType.TagOpenSlash,
      TokenType.Identifier,
      TokenType.TagClose,
      TokenType.EOF,
    ]);
    expect(tokens[3]?.value).toBe('if (a < b) { console.log("ok"); }');
    expect(tokens[10]?.value).toBe('.x { color: red; }');
  });

  it('throws on unterminated string literal in attributes', () => {
    const lexer = new DriftLexer('<div class="unclosed></div>');
    expect(() => collectTokens(lexer)).toThrow(DriftLexerError);
  });

  it('throws on unterminated XML comments', () => {
    const lexer = new DriftLexer('<!-- unclosed comment');
    expect(() => collectTokens(lexer)).toThrow(DriftLexerError);
  });

  it('throws on unexpected characters inside tag headers', () => {
    const lexer = new DriftLexer('<div %invalid>');
    expect(() => collectTokens(lexer)).toThrow(DriftLexerError);
  });
});
