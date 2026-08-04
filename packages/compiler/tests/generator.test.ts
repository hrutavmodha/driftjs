import { describe, it, expect } from 'vitest';
import { DriftLexer } from '../src/lexer.js';
import { DriftParser } from '../src/parser.js';
import { DriftTransformer } from '../src/transformer.js';
import { DriftGenerator } from '../src/generator.js';
import { interpret } from '../src/index.js';
import { Opcode } from '../types/index.js';

describe('DriftGenerator', () => {
  function compile(src: string) {
    const lexer = new DriftLexer(src);
    const parser = new DriftParser(lexer);
    const ast = parser.parse();
    const transformer = new DriftTransformer(ast);
    const transformedAst = transformer.transform();
    const generator = new DriftGenerator(transformedAst);
    return generator.generate();
  }

  it('generates fragment and return for empty templates', () => {
    const module = compile('');

    expect(module.constants).toEqual([]);
    expect(module.bytecode).toEqual([Opcode.CREATE_FRAGMENT, 0, Opcode.RETURN, 0]);
  });

  it('generates direct root element for single top-level element', () => {
    const module = compile('<div>Hello World</div>');

    expect(module.constants).toContain('div');
    expect(module.constants).toContain('Hello World');

    const tagIdx = module.constants.indexOf('div');
    const textIdx = module.constants.indexOf('Hello World');

    expect(module.bytecode[0]).toBe(Opcode.CREATE_ELEMENT);
    expect(module.bytecode[1]).toBe(0); // rootReg = 0
    expect(module.bytecode[2]).toBe(tagIdx);

    expect(module.bytecode[module.bytecode.length - 2]).toBe(Opcode.RETURN);
    expect(module.bytecode[module.bytecode.length - 1]).toBe(0);
  });

  it('generates fragment container for multiple top-level nodes', () => {
    const module = compile('<h1>Title</h1><p>Paragraph</p>');

    expect(module.bytecode[0]).toBe(Opcode.CREATE_FRAGMENT);
    expect(module.bytecode[1]).toBe(0); // fragment reg

    expect(module.constants).toContain('h1');
    expect(module.constants).toContain('p');
  });

  it('generates static, dynamic, and boolean attributes', () => {
    const module = compile('<input type="checkbox" checked data-id={id} />');

    expect(module.constants).toContain('type');
    expect(module.constants).toContain('checkbox');
    expect(module.constants).toContain('checked');
    expect(module.constants).toContain('data-id');

    // SET_ATTR opcode is present
    expect(module.bytecode).toContain(Opcode.SET_ATTR);
  });

  it('generates interpolated text and comments', () => {
    const module = compile('<!-- header --><div>{ user.name }</div>');

    expect(module.constants).toContain(' header ');
    expect(module.bytecode).toContain(Opcode.CREATE_COMMENT);
    expect(module.bytecode).toContain(Opcode.INTERPOLATE_TEXT);
  });

  it('generates REACTIVE_IF opcode for @if, @else if, and @else control flows', () => {
    const src = `@if isLoggedIn { <span>Welcome</span> } @else if isGuest { <span>Guest</span> } @else { <span>Login</span> }`;
    const module = compile(src);

    // New reactive encoding: no flat jumps for @if
    expect(module.bytecode).toContain(Opcode.REACTIVE_IF);
    expect(module.bytecode).not.toContain(Opcode.JUMP_IF_FALSE);
    expect(module.bytecode).not.toContain(Opcode.EVAL_EXPR);

    // The condition AST, consequent sub-module, and deps array must all be in the constant pool
    const reactiveIfIdx = module.bytecode.indexOf(Opcode.REACTIVE_IF);
    expect(reactiveIfIdx).toBeGreaterThan(-1);

    // Operand layout: REACTIVE_IF parentReg condIdx consIdx altIdx depsIdx
    expect(module.bytecode.length).toBeGreaterThan(reactiveIfIdx + 5);
  });

  it('generates REACTIVE_FOR opcode for @for loop directives', () => {
    const src = `@for (item, index) in list { <li>{item}</li> }`;
    const module = compile(src);

    // New reactive encoding: no flat LOOP_ITER for @for
    expect(module.bytecode).toContain(Opcode.REACTIVE_FOR);
    expect(module.bytecode).not.toContain(Opcode.LOOP_ITER);
    expect(module.bytecode).not.toContain(Opcode.EVAL_EXPR);

    const reactiveForIdx = module.bytecode.indexOf(Opcode.REACTIVE_FOR);
    expect(reactiveForIdx).toBeGreaterThan(-1);

    // Operand layout: REACTIVE_FOR parentReg iterIdx itemNameIdx indexNameIdx bodyIdx depsIdx
    expect(module.bytecode.length).toBeGreaterThan(reactiveForIdx + 6);
  });

  it('generates bytecode for @switch, @case, and @default directives', () => {
    const src = `@switch role { @case "admin" { <p>Admin</p> } @default { <p>User</p> } }`;
    const module = compile(src);

    expect(module.bytecode).toContain(Opcode.REACTIVE_IF);
  });

  it('works end-to-end via interpret() function', () => {
    const template = `
      <ul>
        @for (item, index) in list {
          <li key={index}>{item}</li>
        }
      </ul>
    `;
    const module = interpret(template, false);

    expect(module.bytecode.length).toBeGreaterThan(0);
    expect(module.constants.length).toBeGreaterThan(0);
  });
});
