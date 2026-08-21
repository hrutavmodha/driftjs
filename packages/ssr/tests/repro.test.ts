import { describe, it, expect } from 'vitest';
import { DriftServerVM, renderToString, serializeNode } from '../src/index.js';
import { Opcode, type CompiledModule } from 'driftjs-compiler';

describe('DriftServerVM (SSR Engine) - Reproduction Test Cases', () => {
  it('child component props take precedence over parent scope variables of the same name', () => {
    const childModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // span
        Opcode.CREATE_TEXT, 1, 1,    // eval(scope.title)
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: [
        'span',
        { __drift_fn__: '(scope) => (scope.title || (scope.props && scope.props.title))' },
      ],
    };

    const parentModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // div
        Opcode.MOUNT_COMPONENT, 1, 1, 2, // Mount Child with propsSpec { title: 'CustomChildTitle' }
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: [
        'div',
        'Child',
        { __drift_props__: true, title: 'CustomChildTitle' },
      ],
      scope: {
        Child: childModule,
        title: 'ParentTitle',
      },
    };

    const html = renderToString(parentModule);
    expect(html).toBe('<div><span>CustomChildTitle</span></div>');
  });

  it('serializeNode does not escape HTML entities inside <script> and <style> tags', () => {
    const scriptModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // script
        Opcode.CREATE_TEXT, 1, 1,    // "if (a < b && c > d) {}"
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['script', 'if (a < b && c > d) {}'],
    };

    const styleModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // style
        Opcode.CREATE_TEXT, 1, 1,    // "div > span { color: red; }"
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['style', 'div > span { color: red; }'],
    };

    const scriptHtml = renderToString(scriptModule);
    const styleHtml = renderToString(styleModule);

    expect(scriptHtml).toBe('<script>if (a < b && c > d) {}</script>');
    expect(styleHtml).toBe('<style>div > span { color: red; }</style>');
  });

  it('serializeNode validates or escapes attribute names to prevent tag breakout', () => {
    const maliciousNode: any = {
      type: 'element',
      tag: 'div',
      attrs: new Map([
        ['test" onclick="alert(1)"', 'value'],
      ]),
      children: [],
    };

    const html = serializeNode(maliciousNode);
    expect(html).not.toContain('onclick="alert(1)"');
  });

  it('serializeNode escapes </script> and </style> sequences inside raw text blocks to prevent XSS breakout', () => {
    const maliciousScriptModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // script
        Opcode.CREATE_TEXT, 1, 1,    // payload
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['script', 'const data = "</script><script>alert(document.domain)</script>";'],
    };

    const html = renderToString(maliciousScriptModule);
    expect(html).not.toContain('</script><script>alert');
  });

  it('serializeNode validates tag names against invalid characters to prevent HTML tag injection', () => {
    const maliciousNode: any = {
      type: 'element',
      tag: 'div onclick=alert(1)',
      attrs: new Map(),
      children: [],
    };

    const html = serializeNode(maliciousNode);
    expect(html).not.toContain('onclick=alert(1)');
  });
});
