import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import { DriftParser } from '../src/parser.js';
import { DriftTransformer } from '../src/transformer.js';
import { ASTNodeType, ElementNode, TextNode, InterpolationNode } from '../types/index.js';

describe('DriftTransformer', () => {
  it('should strip redundant whitespace and newline text nodes between elements', () => {
    const input = `
      <div>
        <span>Hello</span>
      </div>
    `;
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer);
    const rawAst = parser.parse();

    const transformer = new DriftTransformer(rawAst);
    const transformedAst = transformer.transform();

    // Top-level body should contain only 1 ElementNode (div), whitespace TextNodes removed
    expect(transformedAst.body.length).toBe(1);
    const div = transformedAst.body[0] as ElementNode;
    expect(div.tagName).toBe('div');

    // div.children should contain only 1 ElementNode (span), whitespace TextNodes removed
    expect(div.children.length).toBe(1);
    const span = div.children[0] as ElementNode;
    expect(span.tagName).toBe('span');
    expect((span.children[0] as TextNode).content).toBe('Hello');
  });

  it('should transform raw interpolation strings into Acorn JS AST nodes', () => {
    const input = '<h1>{ user.name }</h1>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer);
    const rawAst = parser.parse();

    const transformer = new DriftTransformer(rawAst);
    const transformedAst = transformer.transform();

    const h1 = transformedAst.body[0] as ElementNode;
    const interp = h1.children[0] as InterpolationNode;
    expect(interp.type).toBe(ASTNodeType.Interpolation);

    const expr = interp.expression as any;
    expect(expr.type).toBe('MemberExpression');
    expect(expr.object.name).toBe('user');
    expect(expr.property.name).toBe('name');
  });

  it('should transform script tag text child into stripped Acorn JS statement AST', () => {
    const input = '<script>let count = 0;</script>';
    const lexer = new DriftLexer(input);
    const parser = new DriftParser(lexer);
    const rawAst = parser.parse();

    const transformer = new DriftTransformer(rawAst);
    const transformedAst = transformer.transform();

    const script = transformedAst.body[0] as ElementNode;
    expect(script.tagName).toBe('script');

    const scriptTextNode = script.children[0] as TextNode;
    const jsContent = scriptTextNode.content as any;
    expect(jsContent.type).toBe('VariableDeclaration');
    expect(jsContent.kind).toBe('let');
    expect(jsContent.declarations[0].id.name).toBe('count');
  });
});
