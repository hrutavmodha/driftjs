import { describe, it, expect } from 'vitest';
import { DriftServerVM, renderToString, serializeNode } from '../src/index.js';
import { Opcode, type CompiledModule } from 'driftjs-compiler';

describe('DriftServerVM (SSR Engine) - Reproduction Test Cases for Identified Bugs', () => {
  // BUG-07: Parent scope variables overwrite child component props during Server-Side Rendering
  it('BUG-07 [Correctness]: child component props take precedence over parent scope variables of the same name', () => {
    // Child component that renders <span>{props.title}</span>
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

    // Parent component has title = "ParentTitle" in scope, but passes title="CustomChildTitle" as prop
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
        title: 'ParentTitle', // Same variable name in parent scope
      },
    };

    const html = renderToString(parentModule);

    // Expected true behavior: Child receives prop 'CustomChildTitle' and renders <span>CustomChildTitle</span>
    // Buggy current behavior: { props: propsObj, ...propsObj, ...this.scope } spreads parent scope AFTER propsObj,
    // overwriting child's title with 'ParentTitle' -> <span>ParentTitle</span>
    expect(html).toBe('<div><span>CustomChildTitle</span></div>');
  });

  // BUG-08: HTML entity escaping in SSR corrupts <script> JavaScript and <style> CSS blocks
  it('BUG-08 [Correctness]: serializeNode does not escape HTML entities inside <script> and <style> tags', () => {
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

    // Expected true behavior: raw JavaScript and CSS without HTML entity escaping
    // Buggy current behavior: &lt;, &gt;, &amp; are emitted, which breaks browser JS and CSS engines
    expect(scriptHtml).toBe('<script>if (a < b && c > d) {}</script>');
    expect(styleHtml).toBe('<style>div > span { color: red; }</style>');
  });

  // BUG-18: Unsanitized attribute names in SSR HTML serialization allow attribute injection
  it('BUG-18 [Security]: serializeNode validates or escapes attribute names to prevent tag breakout', () => {
    const maliciousNode: any = {
      type: 'element',
      tag: 'div',
      attrs: new Map([
        ['test" onclick="alert(1)"', 'value'],
      ]),
      children: [],
    };

    const html = serializeNode(maliciousNode);

    // Expected true behavior: invalid/malicious attribute names with quotes are not injected directly into HTML
    // Buggy current behavior: <div test" onclick="alert(1)"="value"></div> allows attribute injection / XSS
    expect(html).not.toContain('onclick="alert(1)"');
  });
});
