import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import { DriftParser } from '../src/parser.js';
import {
  ASTNodeType,
  type ElementNode,
  DriftParserError,
  DriftLexerError,
  TokenType,
  type Token,
  type TextNode,
} from '../types/index.js';

describe('DriftParser', () => {
  it('parses empty templates', () => {
    const parser = new DriftParser(new DriftLexer(''));
    const ast = parser.parse();

    expect(ast.type).toBe(ASTNodeType.Program);
    expect(ast.body).toEqual([]);
  });

  it('lets the parser drive token consumption lazily', () => {
    const lexer = new DriftLexer('<div><span>Hello</span></div>');
    const parser = new DriftParser(lexer);

    expect(lexer.getEmittedTokenCount()).toBe(0);

    const ast = parser.parse();

    expect(ast.body).toHaveLength(1);
    expect(lexer.getEmittedTokenCount()).toBeGreaterThan(0);
  });

  it('parses deeply nested element structures', () => {
    const parser = new DriftParser(
      new DriftLexer('<div><main><article><section><p>{text}</p></section></article></main></div>')
    );
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

  it('parses multiple root-level elements, text, and comments', () => {
    const parser = new DriftParser(
      new DriftLexer('<!-- Root 1 --><div>One</div><!-- Root 2 --><span>Two</span>')
    );
    const ast = parser.parse();

    expect(ast.body.length).toBe(4);
    expect(ast.body[0]?.type).toBe(ASTNodeType.Comment);
    expect(ast.body[1]?.type).toBe(ASTNodeType.Element);
    expect(ast.body[2]?.type).toBe(ASTNodeType.Comment);
    expect(ast.body[3]?.type).toBe(ASTNodeType.Element);
  });

  it('parses attributes of mixed kinds', () => {
    const parser = new DriftParser(
      new DriftLexer('<input type="checkbox" checked id="terms" data-bind={isBound} />')
    );
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

  it('parses script tag content as a raw text child', () => {
    const parser = new DriftParser(
      new DriftLexer('<script>if (a < b) { console.log("ok"); }</script>')
    );
    const ast = parser.parse();

    const scriptElement = ast.body[0] as ElementNode;
    expect(scriptElement.tagName).toBe('script');
    expect(scriptElement.children.length).toBe(1);
    const scriptText = scriptElement.children[0] as TextNode;
    expect(scriptText.type).toBe(ASTNodeType.Text);
    expect(scriptText.content).toBe('if (a < b) { console.log("ok"); }');
  });

  it('parses complex JS interpolations into raw expression strings', () => {
    const parser = new DriftParser(
      new DriftLexer('<div>{ isTrue ? "yes" : "no" }</div><span>{ (x) => x * 2 }</span><p>{ user?.name ?? "Guest" }</p>')
    );
    const ast = parser.parse();

    const div = ast.body[0] as ElementNode;
    const divInterpolation = div.children[0] as any;
    expect(divInterpolation.type).toBe(ASTNodeType.Interpolation);
    expect(divInterpolation.expression).toBe(' isTrue ? "yes" : "no" ');

    const span = ast.body[1] as ElementNode;
    const spanInterpolation = span.children[0] as any;
    expect(spanInterpolation.expression).toBe(' (x) => x * 2 ');
  });

  it('parses interpolated attribute values as raw expression strings', () => {
    const parser = new DriftParser(
      new DriftLexer('<button onclick={ (e) => handleClick(e) } />')
    );
    const ast = parser.parse();

    const button = ast.body[0] as ElementNode;
    const attr = button.attributes[0];
    expect(attr?.name).toBe('onclick');

    const interpolationValue = attr?.value as any;
    expect(interpolationValue.type).toBe(ASTNodeType.Interpolation);
    expect(interpolationValue.expression).toBe(' (e) => handleClick(e) ');
  });

  it('throws when an unexpected closing tag appears at the top level', () => {
    const parser = new DriftParser(new DriftLexer('</div>'));
    expect(() => parser.parse()).toThrow(DriftParserError);
  });

  it('throws when an attribute value is missing after =', () => {
    const parser = new DriftParser(new DriftLexer('<div class=></div>'));
    expect(() => parser.parse()).toThrow(DriftLexerError);
  });

  it('throws on mismatched nested closing tags', () => {
    const parser = new DriftParser(new DriftLexer('<div><span>Content</div></span>'));
    expect(() => parser.parse()).toThrow(DriftParserError);
  });

  it('throws when the closing bracket is missing in a manual token stream', () => {
    const dummyLoc = { line: 1, column: 1, offset: 0 };
    const tokens: Token[] = [
      { type: TokenType.TagOpen, value: '<', loc: { start: dummyLoc, end: dummyLoc } },
      { type: TokenType.Identifier, value: 'div', loc: { start: dummyLoc, end: dummyLoc } },
      { type: TokenType.Text, value: 'Hello', loc: { start: dummyLoc, end: dummyLoc } },
      { type: TokenType.EOF, value: '', loc: { start: dummyLoc, end: dummyLoc } },
    ];

    const parser = new DriftParser(tokens);
    expect(() => parser.parse()).toThrow(DriftParserError);
  });

  it('parses @if, @else if, and @else directives cleanly', () => {
    const parser = new DriftParser(
      new DriftLexer('@if isLoggedIn { <span>Welcome back</span> } @else if isGuest { <span>Welcome guest</span> } @else { <span>Please log in</span> }')
    );
    const ast = parser.parse();

    expect(ast.body).toHaveLength(1);
    const ifNode = ast.body[0] as any;
    expect(ifNode.type).toBe(ASTNodeType.If);
    expect(ifNode.test).toBe('isLoggedIn');
    const firstSpan = ifNode.consequent.find((n: any) => n.type === ASTNodeType.Element);
    expect(firstSpan.tagName).toBe('span');

    // Alternate is nested IfNode for @else if
    const elseIfNode = ifNode.alternate as any;
    expect(elseIfNode.type).toBe(ASTNodeType.If);
    expect(elseIfNode.test).toBe('isGuest');

    // Else branch is array of nodes in alternate of nested IfNode
    expect(Array.isArray(elseIfNode.alternate)).toBe(true);
    const elseSpan = elseIfNode.alternate.find((n: any) => n.type === ASTNodeType.Element);
    expect(elseSpan.tagName).toBe('span');
  });

  it('parses @for directives cleanly', () => {
    const parser = new DriftParser(
      new DriftLexer('@for (item, index) in items { <li>{item}</li> }')
    );
    const ast = parser.parse();

    expect(ast.body).toHaveLength(1);
    const forNode = ast.body[0] as any;
    expect(forNode.type).toBe(ASTNodeType.For);
    expect(forNode.item).toBe('item');
    expect(forNode.index).toBe('index');
    expect(forNode.iterable).toBe('items');
    const forLi = forNode.body.find((n: any) => n.type === ASTNodeType.Element);
    expect(forLi.tagName).toBe('li');
  });

  it('parses @for directive without index with index set to null', () => {
    const parser = new DriftParser(
      new DriftLexer('@for item in items { <li>{item}</li> }')
    );
    const ast = parser.parse();

    const forNode = ast.body[0] as any;
    expect(forNode.item).toBe('item');
    expect(forNode.index).toBeNull();
  });

  it('parses @for directive with canonical key expression', () => {
    const parser = new DriftParser(
      new DriftLexer('@for (item, idx) in items key item.id { <li>{item.name}</li> }')
    );
    const ast = parser.parse();
    const forNode = ast.body[0] as any;
    expect(forNode.item).toBe('item');
    expect(forNode.index).toBe('idx');
    expect(forNode.iterable).toBe('items');
    expect(forNode.key).toBe('item.id');
  });

  it('parses @switch, @case, and @default directives cleanly', () => {
    const parser = new DriftParser(
      new DriftLexer('@switch userRole { @case "admin" { <p>Admin</p> } @case "user" { <p>User</p> } @default { <p>Unknown</p> } }')
    );
    const ast = parser.parse();

    expect(ast.body).toHaveLength(1);
    const switchNode = ast.body[0] as any;
    expect(switchNode.type).toBe(ASTNodeType.Switch);
    expect(switchNode.discriminant).toBe('userRole');
    expect(switchNode.cases).toHaveLength(3);
    expect(switchNode.cases[0].expression).toBe('"admin"');
    expect(switchNode.cases[1].expression).toBe('"user"');
    expect(switchNode.cases[2].expression).toBeNull();
  });

  it('parses deeply nested mixed control flows (nested @if inside @for inside @switch)', () => {
    const input = `
      @switch status {
        @case "active" {
          @for (item, idx) in list {
            @if item.isVisible {
              <div>{idx}: {item.title}</div>
            }
          }
        }
        @default {
          <p>No active items</p>
        }
      }
    `;
    const parser = new DriftParser(new DriftLexer(input));
    const ast = parser.parse();

    const switchNode = ast.body.find((n: any) => n.type === ASTNodeType.Switch) as any;
    expect(switchNode).toBeDefined();
    expect(switchNode.type).toBe(ASTNodeType.Switch);
    expect(switchNode.discriminant).toBe('status');

    const activeCase = switchNode.cases[0];
    const forNode = activeCase.body.find((n: any) => n.type === ASTNodeType.For);
    expect(forNode.item).toBe('item');
    expect(forNode.index).toBe('idx');

    const ifNode = forNode.body.find((n: any) => n.type === ASTNodeType.If);
    expect(ifNode.test).toBe('item.isVisible');
  });

  it('throws on unclosed directive blocks', () => {
    const parser = new DriftParser(new DriftLexer('@if isLoggedIn { <div>Hello</div>'));
    expect(() => parser.parse()).toThrow(DriftParserError);
  });

  it('throws on invalid @for header syntax missing in keyword', () => {
    const parser = new DriftParser(new DriftLexer('@for item items { <li>{item}</li> }'));
    expect(() => parser.parse()).toThrow(DriftParserError);
  });

  it('throws on invalid content inside @switch blocks that is not @case or @default', () => {
    const parser = new DriftParser(new DriftLexer('@switch mode { <div>invalid direct child</div> }'));
    expect(() => parser.parse()).toThrow(DriftParserError);
  });

  it('automatically parses HTML void elements as self-closing without requiring explicit closing tags', () => {
    const parser = new DriftParser(
      new DriftLexer('<div><input type="text"><img src="test.jpg"><br><hr></div>')
    );
    const ast = parser.parse();

    expect(ast.body).toHaveLength(1);
    const divNode = ast.body[0] as any;
    expect(divNode.tagName).toBe('div');
    expect(divNode.children).toHaveLength(4);

    const inputNode = divNode.children[0];
    expect(inputNode.tagName).toBe('input');
    expect(inputNode.isSelfClosing).toBe(true);

    const imgNode = divNode.children[1];
    expect(imgNode.tagName).toBe('img');
    expect(imgNode.isSelfClosing).toBe(true);

    const brNode = divNode.children[2];
    expect(brNode.tagName).toBe('br');
    expect(brNode.isSelfClosing).toBe(true);

    const hrNode = divNode.children[3];
    expect(hrNode.tagName).toBe('hr');
    expect(hrNode.isSelfClosing).toBe(true);
  });

  describe('@if conditional AST structures', () => {
    it('parses @if with complex JS condition expressions', () => {
      const ast = new DriftParser(new DriftLexer('@if user.role === "admin" && isActive { <span>ok</span> }')).parse();
      const ifNode = ast.body[0] as any;
      expect(ifNode.type).toBe(ASTNodeType.If);
      expect(ifNode.test).toBe('user.role === "admin" && isActive');
      expect(ifNode.alternate).toBeNull();
    });

    it('chains multiple @else if branches into nested alternate IfNodes', () => {
      const src = '@if x === 1 { <p>1</p> } @else if x === 2 { <p>2</p> } @else if x === 3 { <p>3</p> } @else { <p>other</p> }';
      const ast = new DriftParser(new DriftLexer(src)).parse();
      const n1 = ast.body[0] as any;
      const n2 = n1.alternate;
      const n3 = n2.alternate;
      expect(n1.test).toBe('x === 1');
      expect(n2.test).toBe('x === 2');
      expect(n3.test).toBe('x === 3');
      expect(Array.isArray(n3.alternate)).toBe(true);
    });

    it('parses doubly-nested and triply-nested @if blocks', () => {
      const src = '@if a { @if b { @if c { <span>deep</span> } } }';
      const ast = new DriftParser(new DriftLexer(src)).parse();
      const n1 = ast.body[0] as any;
      const n2 = n1.consequent.find((n: any) => n.type === ASTNodeType.If);
      const n3 = n2.consequent.find((n: any) => n.type === ASTNodeType.If);
      expect(n1.test).toBe('a');
      expect(n2.test).toBe('b');
      expect(n3.test).toBe('c');
    });
  });

  it('parses self-closing void elements with attributes and following sibling elements correctly', () => {
    const src = '<input type="text" value="hello" / ><p>Sibling</p>';
    const ast = new DriftParser(new DriftLexer(src)).parse();
    expect(ast.body).toHaveLength(2);
    const inputNode = ast.body[0] as ElementNode;
    expect(inputNode.type).toBe(ASTNodeType.Element);
    expect(inputNode.tagName).toBe('input');
    expect(inputNode.isSelfClosing).toBe(true);
    expect(inputNode.children).toHaveLength(0);

    const pNode = ast.body[1] as ElementNode;
    expect(pNode.type).toBe(ASTNodeType.Element);
    expect(pNode.tagName).toBe('p');
  });
});

