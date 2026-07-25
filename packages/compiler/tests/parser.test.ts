import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import { DriftParser } from '../src/parser.js';
import { ASTNodeType, ElementNode, DriftParserError, TokenType } from '../types/index.js';

describe('DriftParser Edge Cases', () => {
  it('should parse empty template or whitespace-only token stream', () => {
    const lexer = new DriftLexer('');
    const parser = new DriftParser(lexer.tokenize());
    const ast = parser.parse();

    expect(ast.type).toBe(ASTNodeType.Program);
    expect(ast.body).toEqual([]);
  });

  it('should parse deeply nested element structures', () => {
    const input = '<div><main><article><section><p>{text}</p></section></article></main></div>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());
    const ast = parser.parse();

    expect(ast.body.length).toBe(1);
    let current = ast.body[0] as ElementNode;
    expect(current.tagName).toBe('div');

    current = current.children[0] as ElementNode;
    expect(current.tagName).toBe('main');

    current = current.children[0] as ElementNode;
    expect(current.tagName).toBe('article');

    current = current.children[0] as ElementNode;
    expect(current.tagName).toBe('section');

    current = current.children[0] as ElementNode;
    expect(current.tagName).toBe('p');

    expect(current.children[0]?.type).toBe(ASTNodeType.Interpolation);
  });

  it('should parse multiple root-level elements, text, and comments', () => {
    const input = '<!-- Root 1 --><div>One</div><!-- Root 2 --><span>Two</span>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());
    const ast = parser.parse();

    expect(ast.body.length).toBe(4);
    expect(ast.body[0]?.type).toBe(ASTNodeType.Comment);
    expect(ast.body[1]?.type).toBe(ASTNodeType.Element);
    expect(ast.body[2]?.type).toBe(ASTNodeType.Comment);
    expect(ast.body[3]?.type).toBe(ASTNodeType.Element);
  });

  it('should parse multiple attributes of mixed types (string, boolean, interpolated)', () => {
    const input = '<input type="checkbox" checked id="terms" data-bind={isBound} />';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());
    const ast = parser.parse();

    const inputNode = ast.body[0] as ElementNode;
    expect(inputNode.isSelfClosing).toBe(true);
    expect(inputNode.attributes.length).toBe(4);

    expect(inputNode.attributes[0]).toMatchObject({ name: 'type', value: 'checkbox' });
    expect(inputNode.attributes[1]).toMatchObject({ name: 'checked', value: null });
    expect(inputNode.attributes[2]).toMatchObject({ name: 'id', value: 'terms' });
    expect(inputNode.attributes[3]?.name).toBe('data-bind');
    expect(typeof inputNode.attributes[3]?.value).toBe('object');
  });

  it('should throw DriftParserError when unexpected closing tag is encountered at top-level', () => {
    const input = '</div>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());

    expect(() => parser.parse()).toThrowError(DriftParserError);
  });

  it('should throw DriftParserError when attribute value is missing after =', () => {
    const input = '<div class=></div>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());

    expect(() => parser.parse()).toThrowError(DriftParserError);
  });

  it('should throw DriftParserError on mismatched closing tag in nested elements', () => {
    const input = '<div><span>Content</div></span>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());

    expect(() => parser.parse()).toThrowError(DriftParserError);
  });

  it('should throw DriftParserError when closing bracket is missing before content in token stream', () => {
    const dummyLoc = { line: 1, column: 1, offset: 0 };
    const tokens: Token[] = [
      { type: TokenType.TagOpen, value: '<', loc: { start: dummyLoc, end: dummyLoc } },
      { type: TokenType.Identifier, value: 'div', loc: { start: dummyLoc, end: dummyLoc } },
      { type: TokenType.Text, value: 'Hello', loc: { start: dummyLoc, end: dummyLoc } },
      { type: TokenType.EOF, value: '', loc: { start: dummyLoc, end: dummyLoc } },
    ];
    const parser = new DriftParser(tokens);

    expect(() => parser.parse()).toThrowError(DriftParserError);
  });

  it('should throw DriftParserError when interpolation JS expression fails to parse with Acorn', () => {
    const input = '<div>{ count + * invalid }</div>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer.tokenize());

    expect(() => parser.parse()).toThrowError(DriftParserError);
  });
});
