/**
 * Comprehensive tests for @if conditional variants in DriftJS:
 *   1. Only-@if (no alternate branch)
 *   2. @if / @else
 *   3. @else if ladder (multiple @else if chains)
 *   4. Nested @if / @else (if inside if)
 *
 * Tests cover Lexer tokens, Parser AST shape, and Generator bytecode output.
 */

import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import { DriftParser } from '../src/parser.js';
import { DriftTransformer } from '../src/transformer.js';
import { DriftGenerator } from '../src/generator.js';
import { ASTNodeType, TokenType, Opcode } from '../types/index.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectTokenTypes(src: string): string[] {
  const lexer = new DriftLexer(src);
  const types: string[] = [];
  while (true) {
    const tok = lexer.nextToken();
    types.push(tok.type);
    if (tok.type === TokenType.EOF) break;
  }
  return types;
}

function parse(src: string) {
  return new DriftParser(new DriftLexer(src)).parse();
}

function compile(src: string) {
  const ast = parse(src);
  const transformed = new DriftTransformer(ast).transform();
  return new DriftGenerator(transformed).generate();
}

// ─── 1. Only @if ─────────────────────────────────────────────────────────────

describe('Only @if (no else branch)', () => {
  it('lexer emits DirectiveIf token with the condition as value', () => {
    const types = collectTokenTypes('@if isVisible { <p>Hello</p> }');
    expect(types[0]).toBe(TokenType.DirectiveIf);
  });

  it('lexer captures the full condition expression as the token value', () => {
    const lexer = new DriftLexer('@if count > 0 { <span>positive</span> }');
    const tok = lexer.nextToken();
    expect(tok.type).toBe(TokenType.DirectiveIf);
    expect(tok.value).toBe('count > 0');
  });

  it('parser builds an IfNode with correct test and null alternate', () => {
    const ast = parse('@if show { <div>visible</div> }');
    expect(ast.body).toHaveLength(1);
    const ifNode = ast.body[0] as any;
    expect(ifNode.type).toBe(ASTNodeType.If);
    expect(ifNode.test).toBe('show');
    expect(ifNode.alternate).toBeNull();
  });

  it('parser puts child nodes inside consequent array', () => {
    const ast = parse('@if flag { <p>text</p> }');
    const ifNode = ast.body[0] as any;
    const elem = ifNode.consequent.find((n: any) => n.type === ASTNodeType.Element);
    expect(elem).toBeDefined();
    expect(elem.tagName).toBe('p');
  });

  it('parser handles a complex JS condition expression', () => {
    const ast = parse('@if user.role === "admin" && isActive { <span>ok</span> }');
    const ifNode = ast.body[0] as any;
    expect(ifNode.test).toBe('user.role === "admin" && isActive');
    expect(ifNode.alternate).toBeNull();
  });

  it('generator emits REACTIVE_IF opcode for only-@if', () => {
    const mod = compile('@if isReady { <button>Go</button> }');
    expect(mod.bytecode).toContain(Opcode.REACTIVE_IF);
    // No JUMP_IF_FALSE — only-@if uses reactive sub-module encoding
    expect(mod.bytecode).not.toContain(Opcode.JUMP_IF_FALSE);
  });

  it('generator stores the condition string in the constant pool', () => {
    const mod = compile('@if isReady { <button>Go</button> }');
    // The condition "isReady" or its AST form must be in the constants
    const condPresent = mod.constants.some(
      (c) => c === 'isReady' || (typeof c === 'object' && JSON.stringify(c).includes('isReady'))
    );
    expect(condPresent).toBe(true);
  });

  it('generator altIdx is 0xFF when there is no alternate branch', () => {
    const mod = compile('@if show { <p>hi</p> }');
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    expect(ifPos).toBeGreaterThan(-1);
    // Operand layout: REACTIVE_IF parentReg condIdx consIdx altIdx depsIdx
    const altIdx = mod.bytecode[ifPos + 4];
    expect(altIdx).toBe(0xFF);
  });

  it('generator works for only-@if with an interpolation inside the block', () => {
    const mod = compile('@if show { <p>{message}</p> }');
    expect(mod.bytecode).toContain(Opcode.REACTIVE_IF);
    // The consequent sub-module will include INTERPOLATE_TEXT
    const consModIdx = mod.bytecode[mod.bytecode.indexOf(Opcode.REACTIVE_IF) + 3]!;
    const consMod = mod.constants[consModIdx] as any;
    expect(consMod.bytecode).toContain(Opcode.INTERPOLATE_TEXT);
  });
});

// ─── 2. @if / @else ──────────────────────────────────────────────────────────

describe('@if / @else (simple two-branch)', () => {
  it('lexer emits DirectiveIf then DirectiveElse tokens', () => {
    const types = collectTokenTypes('@if ok { <b>yes</b> } @else { <b>no</b> }');
    expect(types).toContain(TokenType.DirectiveIf);
    expect(types).toContain(TokenType.DirectiveElse);
    expect(types.indexOf(TokenType.DirectiveIf)).toBeLessThan(
      types.indexOf(TokenType.DirectiveElse)
    );
  });

  it('parser builds an IfNode with an array alternate for @else', () => {
    const ast = parse('@if loggedIn { <span>Hi</span> } @else { <span>Login</span> }');
    const ifNode = ast.body[0] as any;
    expect(ifNode.type).toBe(ASTNodeType.If);
    expect(Array.isArray(ifNode.alternate)).toBe(true);
  });

  it('parser puts the correct elements inside the alternate branch', () => {
    const ast = parse('@if a { <div>A</div> } @else { <div>B</div> }');
    const ifNode = ast.body[0] as any;
    const elseElem = ifNode.alternate.find((n: any) => n.type === ASTNodeType.Element);
    expect(elseElem).toBeDefined();
    expect(elseElem.tagName).toBe('div');
  });

  it('parser correctly sets test condition for @if', () => {
    const ast = parse('@if x > 5 { <p>big</p> } @else { <p>small</p> }');
    const ifNode = ast.body[0] as any;
    expect(ifNode.test).toBe('x > 5');
  });

  it('generator emits REACTIVE_IF with a valid altIdx (not 0xFF)', () => {
    const mod = compile('@if on { <p>on</p> } @else { <p>off</p> }');
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    expect(ifPos).toBeGreaterThan(-1);
    const altIdx = mod.bytecode[ifPos + 4]!;
    expect(altIdx).not.toBe(0xFF);
    // altIdx must point to a valid constant
    expect(mod.constants[altIdx]).toBeDefined();
  });

  it('generator packages consequent and alternate as separate sub-modules', () => {
    const mod = compile('@if flag { <i>A</i> } @else { <b>B</b> }');
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    const consIdx = mod.bytecode[ifPos + 3]!;
    const altIdx = mod.bytecode[ifPos + 4]!;
    const consMod = mod.constants[consIdx] as any;
    const altMod = mod.constants[altIdx] as any;
    // Both sub-modules should have their own bytecode arrays
    expect(Array.isArray(consMod.bytecode)).toBe(true);
    expect(Array.isArray(altMod.bytecode)).toBe(true);
    // They should be distinct objects
    expect(consMod).not.toBe(altMod);
  });

  it('generator produces REACTIVE_IF and no JUMP_IF_FALSE for @if/@else', () => {
    const mod = compile('@if cond { <p>yes</p> } @else { <p>no</p> }');
    expect(mod.bytecode).toContain(Opcode.REACTIVE_IF);
    expect(mod.bytecode).not.toContain(Opcode.JUMP_IF_FALSE);
  });
});

// ─── 3. @else if ladder ──────────────────────────────────────────────────────

describe('@else if ladder (chained conditions)', () => {
  it('lexer emits DirectiveIf and DirectiveElseIf tokens', () => {
    const types = collectTokenTypes(
      '@if a { <p>a</p> } @else if b { <p>b</p> } @else { <p>c</p> }'
    );
    expect(types).toContain(TokenType.DirectiveIf);
    expect(types).toContain(TokenType.DirectiveElseIf);
    expect(types).toContain(TokenType.DirectiveElse);
  });

  it('lexer captures the condition in the @else if token value', () => {
    const lexer = new DriftLexer('@if a { <p>a</p> } @else if b > 10 { <p>b</p> }');
    const tokens: any[] = [];
    while (true) {
      const tok = lexer.nextToken();
      tokens.push(tok);
      if (tok.type === TokenType.EOF) break;
    }
    const elseIfTok = tokens.find((t) => t.type === TokenType.DirectiveElseIf);
    expect(elseIfTok).toBeDefined();
    expect(elseIfTok.value).toBe('b > 10');
  });

  it('parser nests @else if as an IfNode inside the alternate', () => {
    const ast = parse('@if a { <p>A</p> } @else if b { <p>B</p> } @else { <p>C</p> }');
    const ifNode = ast.body[0] as any;
    // The alternate of the first @if should be another IfNode
    expect(ifNode.alternate).not.toBeNull();
    expect(ifNode.alternate.type).toBe(ASTNodeType.If);
    expect(ifNode.alternate.test).toBe('b');
  });

  it('parser chains three @else if conditions correctly', () => {
    const src = '@if x === 1 { <p>one</p> } @else if x === 2 { <p>two</p> } @else if x === 3 { <p>three</p> } @else { <p>other</p> }';
    const ast = parse(src);
    const n1 = ast.body[0] as any;
    expect(n1.test).toBe('x === 1');

    const n2 = n1.alternate;
    expect(n2.type).toBe(ASTNodeType.If);
    expect(n2.test).toBe('x === 2');

    const n3 = n2.alternate;
    expect(n3.type).toBe(ASTNodeType.If);
    expect(n3.test).toBe('x === 3');

    // The final @else is an array alternate on n3
    expect(Array.isArray(n3.alternate)).toBe(true);
    const finalElem = n3.alternate.find((n: any) => n.type === ASTNodeType.Element);
    expect(finalElem.tagName).toBe('p');
  });

  it('parser handles @else if ladder without a trailing @else', () => {
    const ast = parse('@if p { <p>p</p> } @else if q { <p>q</p> }');
    const ifNode = ast.body[0] as any;
    const elseIfNode = ifNode.alternate;
    expect(elseIfNode.type).toBe(ASTNodeType.If);
    expect(elseIfNode.test).toBe('q');
    // No trailing @else means null alternate on the last @else if node
    expect(elseIfNode.alternate).toBeNull();
  });

  it('generator emits exactly one REACTIVE_IF for a two-branch @else if ladder', () => {
    const mod = compile('@if a { <p>a</p> } @else if b { <p>b</p> } @else { <p>c</p> }');
    // The outer IfNode produces one REACTIVE_IF;
    // the nested IfNode is compiled inside the alternate sub-module (no extra top-level REACTIVE_IF)
    const count = mod.bytecode.filter((b) => b === Opcode.REACTIVE_IF).length;
    expect(count).toBe(1);
  });

  it('generator packs @else if inside the alternate sub-module', () => {
    const mod = compile('@if a { <p>A</p> } @else if b { <p>B</p> } @else { <p>C</p> }');
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    const altIdx = mod.bytecode[ifPos + 4]!;
    const altMod = mod.constants[altIdx] as any;
    // The alternate sub-module must itself contain a REACTIVE_IF for the @else if branch
    expect(altMod.bytecode).toContain(Opcode.REACTIVE_IF);
  });
});

// ─── 4. Nested @if / @else ───────────────────────────────────────────────────

describe('Nested @if / @else (if inside if)', () => {
  it('parser builds doubly-nested IfNodes correctly', () => {
    const src = `
      @if outer {
        @if inner { <span>inner-true</span> } @else { <span>inner-false</span> }
      } @else {
        <p>outer-false</p>
      }
    `;
    const ast = parse(src);
    const outerIf = ast.body.find((n: any) => n.type === ASTNodeType.If) as any;
    expect(outerIf).toBeDefined();
    expect(outerIf.test).toBe('outer');

    const innerIf = outerIf.consequent.find((n: any) => n.type === ASTNodeType.If);
    expect(innerIf).toBeDefined();
    expect(innerIf.test).toBe('inner');
    expect(Array.isArray(innerIf.alternate)).toBe(true);
  });

  it('parser preserves the outer @else when the inner @if/@else is in the consequent', () => {
    const src = `
      @if outer {
        @if inner { <span>yes</span> }
      } @else {
        <p>no</p>
      }
    `;
    const ast = parse(src);
    const outerIf = ast.body.find((n: any) => n.type === ASTNodeType.If) as any;
    // Outer alternate should be an array (plain @else), not an IfNode
    expect(Array.isArray(outerIf.alternate)).toBe(true);
  });

  it('generator wraps the inner @if into the outer consequent sub-module', () => {
    const mod = compile('@if outer { @if inner { <b>yes</b> } } @else { <i>no</i> }');
    // Top-level bytecode should have exactly one REACTIVE_IF
    const topLevelCount = mod.bytecode.filter((b) => b === Opcode.REACTIVE_IF).length;
    expect(topLevelCount).toBe(1);

    // The consequent sub-module should itself contain a REACTIVE_IF for the inner @if
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    const consIdx = mod.bytecode[ifPos + 3]!;
    const consMod = mod.constants[consIdx] as any;
    expect(consMod.bytecode).toContain(Opcode.REACTIVE_IF);
  });

  it('parser handles triple nesting depth', () => {
    const src = `
      @if a {
        @if b {
          @if c { <span>deep</span> }
        }
      }
    `;
    const ast = parse(src);
    const n1 = ast.body.find((n: any) => n.type === ASTNodeType.If) as any;
    const n2 = n1.consequent.find((n: any) => n.type === ASTNodeType.If);
    const n3 = n2.consequent.find((n: any) => n.type === ASTNodeType.If);
    expect(n1.test).toBe('a');
    expect(n2.test).toBe('b');
    expect(n3.test).toBe('c');
    expect(n3.alternate).toBeNull();
  });

  it('generator produces correct opcodes for triply-nested @if', () => {
    const mod = compile('@if a { @if b { @if c { <span>deep</span> } } }');
    // Top-level has exactly 1 REACTIVE_IF
    const topCount = mod.bytecode.filter((b) => b === Opcode.REACTIVE_IF).length;
    expect(topCount).toBe(1);

    // Consequent of top contains 1 REACTIVE_IF (for @if b)
    const ifPos = mod.bytecode.indexOf(Opcode.REACTIVE_IF);
    const consIdx1 = mod.bytecode[ifPos + 3]!;
    const consMod1 = mod.constants[consIdx1] as any;
    expect(consMod1.bytecode).toContain(Opcode.REACTIVE_IF);

    // Consequent of second level contains 1 REACTIVE_IF (for @if c)
    const innerIfPos = consMod1.bytecode.indexOf(Opcode.REACTIVE_IF);
    const consIdx2 = consMod1.bytecode[innerIfPos + 3]!;
    const consMod2 = consMod1.constants[consIdx2] as any;
    expect(consMod2.bytecode).toContain(Opcode.REACTIVE_IF);
  });

  it('nested @if with @else if at the outer level parses correctly', () => {
    const src = `
      @if role === "admin" {
        @if hasPermission { <p>Admin+Permission</p> } @else { <p>Admin only</p> }
      } @else if role === "user" {
        <p>User</p>
      } @else {
        <p>Guest</p>
      }
    `;
    const ast = parse(src);
    const rootIf = ast.body.find((n: any) => n.type === ASTNodeType.If) as any;
    expect(rootIf.test).toContain('admin');

    // Consequent contains a nested IfNode
    const innerIf = rootIf.consequent.find((n: any) => n.type === ASTNodeType.If);
    expect(innerIf).toBeDefined();
    expect(innerIf.test).toBe('hasPermission');
    expect(Array.isArray(innerIf.alternate)).toBe(true);

    // Alternate of root is an @else if, so it's an IfNode
    expect(rootIf.alternate.type).toBe(ASTNodeType.If);
    expect(rootIf.alternate.test).toContain('user');
  });
});
