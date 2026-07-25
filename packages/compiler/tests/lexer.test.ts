import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import { TokenType, DriftLexerError } from '../types/index.js';

describe('DriftLexer Edge Cases', () => {
  it('should handle empty input and whitespace-only input', () => {
    const emptyLexer = new DriftLexer('');
    const emptyTokens = emptyLexer.tokenize();
    expect(emptyTokens.length).toBe(1);
    expect(emptyTokens[0]?.type).toBe(TokenType.EOF);

    const wsLexer = new DriftLexer('   \n\t  ');
    const wsTokens = wsLexer.tokenize();
    expect(wsTokens.length).toBe(2);
    expect(wsTokens[0]?.type).toBe(TokenType.Text);
    expect(wsTokens[0]?.value).toBe('   \n\t  ');
    expect(wsTokens[1]?.type).toBe(TokenType.EOF);
  });

  it('should lex nested braces and strings inside interpolations correctly', () => {
    const input = '<div>{ { a: { b: "hello } world" } }.a.b }</div>';
    const lexer = new DriftLexer(input);
    const tokens = lexer.tokenize();

    const interp = tokens.find((t) => t.type === TokenType.Interpolation);
    expect(interp).toBeDefined();
    expect(interp?.value).toBe(' { a: { b: "hello } world" } }.a.b ');
  });

  it('should lex template literals with backticks inside interpolations', () => {
    const input = '<span>{ `items: ${count}` }</span>';
    const lexer = new DriftLexer(input);
    const tokens = lexer.tokenize();

    const interp = tokens.find((t) => t.type === TokenType.Interpolation);
    expect(interp).toBeDefined();
    expect(interp?.value).toBe(' `items: ${count}` ');
  });

  it('should lex adjacent interpolations without text in between', () => {
    const input = '{first}{second}';
    const lexer = new DriftLexer(input);
    const tokens = lexer.tokenize();

    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.Interpolation,
      TokenType.Interpolation,
      TokenType.EOF,
    ]);
    expect(tokens[0]?.value).toBe('first');
    expect(tokens[1]?.value).toBe('second');
  });

  it('should lex comments containing tags and special characters', () => {
    const input = '<!-- <div class="hidden">Ignore me & my {stuff}</div> -->';
    const lexer = new DriftLexer(input);
    const tokens = lexer.tokenize();

    expect(tokens[0]?.type).toBe(TokenType.Comment);
    expect(tokens[0]?.value).toBe(' <div class="hidden">Ignore me & my {stuff}</div> ');
  });

  it('should lex attributes with hyphen and underscore identifiers', () => {
    const input = '<custom-button data-test-id="123" class_name="primary">Click</custom-button>';
    const lexer = new DriftLexer(input);
    const tokens = lexer.tokenize();

    const identifiers = tokens.filter((t) => t.type === TokenType.Identifier).map((t) => t.value);
    expect(identifiers).toEqual(['custom-button', 'data-test-id', 'class_name', 'custom-button']);
  });

  it('should throw DriftLexerError on unterminated string literal in attribute', () => {
    const input = '<div class="unclosed></div>';
    const lexer = new DriftLexer(input);

    expect(() => lexer.tokenize()).toThrowError(DriftLexerError);
  });

  it('should throw DriftLexerError on unterminated XML comment', () => {
    const input = '<!-- unclosed comment';
    const lexer = new DriftLexer(input);

    expect(() => lexer.tokenize()).toThrowError(DriftLexerError);
  });

  it('should throw DriftLexerError on unexpected character inside tag header', () => {
    const input = '<div %invalid>';
    const lexer = new DriftLexer(input);

    expect(() => lexer.tokenize()).toThrowError(DriftLexerError);
  });
});
