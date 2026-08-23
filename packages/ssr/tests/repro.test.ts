import { describe, it, expect } from 'vitest';
import { DriftServerVM, renderToString, serializeNode } from '../src/index.js';
import { Opcode, type CompiledModule, compile } from 'driftjs-compiler';

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

  it('serializeNode escapes or sanitizes "-->" sequences inside comments to prevent XSS breakout', () => {
    const maliciousCommentModule: CompiledModule = {
      bytecode: [
        Opcode.CREATE_COMMENT, 0, 0,
        Opcode.RETURN, 0,
      ],
      constants: ['--> <script>alert("XSS")</script> <!--'],
    };

    const html = renderToString(maliciousCommentModule);
    expect(html).not.toContain('--> <script>alert("XSS")</script>');
  });

  it('sub-module execution in REACTIVE_IF does not pollute parent VM scope during SSR', () => {
    const template = `
      <script>
        let parentVar = 'initial';
      </script>
      <div>
        @if (true) {
          <script>
            let subVar = 'created in sub';
          </script>
          <span>{subVar}</span>
        }
        <span>{parentVar}</span>
      </div>
    `;

    const compiled = compile(template);
    const vm = new DriftServerVM();
    vm.execute(compiled);

    expect((vm as any).scope.subVar).toBeUndefined();
  });

  it('serializeNode formats empty string attributes with explicit empty string assignment', () => {
    const node: any = {
      type: 'element',
      tag: 'img',
      attrs: new Map([
        ['src', '/logo.png'],
        ['alt', ''],
      ]),
      children: [],
    };

    const html = serializeNode(node);
    expect(html).toBe('<img src="/logo.png" alt="" />');
  });

  it('serializeNode sanitizes "--!>" HTML5 comment bang delimiter to prevent comment breakout', () => {
    const maliciousComment: any = {
      type: 'comment',
      content: '--!><script>alert("XSS")</script>',
    };
    const html = serializeNode(maliciousComment);
    expect(html).not.toContain('--!><script>');
    expect(html).toContain('--! >');
  });

  it('serializeNode preserves boolean false and true on aria-* and data-* attributes', () => {
    const node: any = {
      type: 'element',
      tag: 'div',
      attrs: new Map([
        ['aria-hidden', false],
        ['aria-expanded', true],
        ['data-active', false],
        ['disabled', false],
        ['readonly', true],
      ]),
      children: [],
    };
    const html = serializeNode(node);
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-active="false"');
    expect(html).not.toContain('disabled');
    expect(html).toContain(' readonly');
  });
});

