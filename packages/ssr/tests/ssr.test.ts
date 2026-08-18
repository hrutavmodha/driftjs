import { describe, it, expect } from 'vitest';
import { DriftServerVM, renderToString } from '../src/index.js';
import { Opcode, type CompiledModule, compile } from 'driftjs-compiler';

describe('DriftServerVM (SSR Engine)', () => {
  it('renders static elements with escape protection to HTML string', () => {
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = h1
        Opcode.CREATE_TEXT, 1, 1,    // r1 = 'Hello <World> & "Friends"'
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['h1', 'Hello <World> & "Friends"'],
    };

    const html = renderToString(module);
    expect(html).toBe('<h1>Hello &lt;World&gt; &amp; &quot;Friends&quot;</h1>');
  });

  it('renders attributes, boolean flags, and dynamic values', () => {
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // r0 = input
        Opcode.SET_ATTR, 0, 1, 2, 0, // type="checkbox"
        Opcode.SET_ATTR, 0, 3, 4, 0, // checked=true
        Opcode.SET_ATTR, 0, 5, 6, 1, // data-id=eval(id)
        Opcode.RETURN, 0,
      ],
      constants: [
        'input', 'type', 'checkbox', 'checked', true, 'data-id',
        { __drift_fn__: '(scope) => scope.id' },
      ],
    };

    const html = renderToString(module, { scope: { id: 101 } });
    expect(html).toBe('<input type="checkbox" checked data-id="101" />');
  });

  it('renders REACTIVE_IF conditionals on server (true branch & false branch)', () => {
    const consMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.CREATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['span', 'User Admin'],
    };
    const altMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,
        Opcode.CREATE_TEXT, 2, 1,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: ['span', 'Guest User'],
    };
    const condExpr = { __drift_fn__: '(scope) => scope.isAdmin' };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.REACTIVE_IF, 0, 1, 2, 3, 4,
        Opcode.RETURN, 0,
      ],
      constants: [null, condExpr, consMod, altMod, ['isAdmin']],
    };

    const adminHtml = renderToString(module, { scope: { isAdmin: true } });
    expect(adminHtml).toBe('<!--if--><span>User Admin</span><!--/if-->');

    const guestHtml = renderToString(module, { scope: { isAdmin: false } });
    expect(guestHtml).toBe('<!--if--><span>Guest User</span><!--/if-->');
  });

  it('renders REACTIVE_FOR loops with item and index scope bindings', () => {
    const bodyMod: CompiledModule = {
      bytecode: [
        Opcode.CREATE_FRAGMENT, 0,
        Opcode.CREATE_ELEMENT, 1, 0,   // li
        Opcode.SET_ATTR, 1, 1, 2, 1,   // data-index={idx}
        Opcode.INTERPOLATE_TEXT, 3, 4, // text={item}
        Opcode.APPEND_CHILD, 1, 3,
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: [
        'li',
        'data-index',
        { __drift_fn__: '(scope) => scope.idx' },
        null,
        { __drift_fn__: '(scope) => scope.item' },
      ],
    };

    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // ul
        Opcode.REACTIVE_FOR, 0, 1, 2, 3, 0xFF, 4, 5,
        Opcode.RETURN, 0,
      ],
      constants: [
        'ul',
        { __drift_fn__: '(scope) => scope.items' },
        'item',
        'idx',
        bodyMod,
        ['items'],
      ],
    };

    const html = renderToString(module, { scope: { items: ['Alpha', 'Beta'] } });
    expect(html).toBe('<ul><!--for--><li data-index="0">Alpha</li><li data-index="1">Beta</li><!--/for--></ul>');
  });

  it('EXEC_SCRIPT initialises server scope before rendering HTML', () => {
    const scriptFn = {
      __drift_fn__: '(scope) => { scope.title = "SSR Server Heading"; }',
    };

    const module: CompiledModule = {
      bytecode: [
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.INTERPOLATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ],
      constants: [
        scriptFn,
        'h2',
        { __drift_fn__: '(scope) => scope.title' },
      ],
    };

    const html = renderToString(module);
    expect(html).toBe('<h2>SSR Server Heading</h2>');
  });

  it('renders end-to-end compiled .drift templates on the server', () => {
    const src = `
      <script>
        let title = "Server Rendered Drift";
        let items = ["Fast", "Zero-VDOM", "Bytecode"];
      </script>
      <div class="container">
        <h1>{title}</h1>
        <ul>
          @for item in items {
            <li>{item}</li>
          }
        </ul>
      </div>
    `;

    const compiled = compile(src);
    const html = renderToString(compiled);
    expect(html).toContain('<h1>Server Rendered Drift</h1>');
    expect(html).toContain('<li>Fast</li>');
    expect(html).toContain('<li>Zero-VDOM</li>');
    expect(html).toContain('<li>Bytecode</li>');
  });

  it('evaluates precompiled expressions in CREATE_TEXT correctly during SSR', () => {
    const module: CompiledModule = {
      bytecode: [
        Opcode.CREATE_ELEMENT, 0, 0, // p
        Opcode.CREATE_TEXT, 1, 1,    // expression in CREATE_TEXT
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ],
      constants: [
        'p',
        { __drift_fn__: (scope: any) => `User: ${scope.name}` },
      ],
    };

    const html = renderToString(module, { scope: { name: 'Alice' } });
    expect(html).toBe('<p>User: Alice</p>');
  });

  it('correctly serializes full set of HTML5 void elements without closing tags', () => {
    const src = `
      <div>
        <source src="audio.mp3" type="audio/mpeg" />
        <track kind="subtitles" src="sub.vtt" />
        <wbr />
        <col />
        <embed src="flash.swf" />
        <param name="autoplay" value="true" />
        <area shape="rect" coords="0,0,10,10" />
        <base href="https://example.com" />
      </div>
    `;
    const compiled = compile(src);
    const html = renderToString(compiled);

    expect(html).toContain('<source src="audio.mp3" type="audio/mpeg" />');
    expect(html).toContain('<track kind="subtitles" src="sub.vtt" />');
    expect(html).toContain('<wbr />');
    expect(html).toContain('<col />');
    expect(html).toContain('<embed src="flash.swf" />');
    expect(html).toContain('<param name="autoplay" value="true" />');
    expect(html).toContain('<area shape="rect" coords="0,0,10,10" />');
    expect(html).toContain('<base href="https://example.com" />');
    expect(html).not.toContain('</source>');
    expect(html).not.toContain('</wbr>');
  });

  it('renders React-like style objects properly during server-side rendering', () => {
    const src = `
      <script>
        let accentColor = '#3b82f6';
        let radius = 12;
      </script>
      <div 
        class="banner"
        style={{ 
          backgroundColor: accentColor, 
          borderRadius: radius, 
          padding: 20, 
          opacity: 0.9,
          zIndex: 5 
        }}
      >
        <span>SSR Content</span>
      </div>
    `;
    const compiled = compile(src);
    const html = renderToString(compiled);

    expect(html).toContain('class="banner"');
    expect(html).toContain('style="background-color: #3b82f6; border-radius: 12px; padding: 20px; opacity: 0.9; z-index: 5"');
    expect(html).toContain('<span>SSR Content</span>');
  });
});
