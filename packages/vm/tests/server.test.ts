import { describe, it, expect } from 'vitest';
import { parseTemplate, generate } from '@driftjs/compiler';
import { renderToString, renderToStaticMarkup, DriftJSServerVM } from '../src/server/index.js';

describe('DriftJSServerVM (SSR)', () => {
  it('should render simple static HTML template to string', () => {
    const ast = parseTemplate('<div id="container"><h1>Hello SSR</h1></div>');
    const program = generate(ast);

    const html = renderToString(program);
    expect(html).toBe('<div id="container"><h1>Hello SSR</h1></div>');
  });

  it('should render reactive state and interpolations evaluated on server', () => {
    const template = `
      <script>
        let title = "DriftJS Engine";
        let count = 42;
      </script>
      <div class="card">
        <h2>{title}</h2>
        <p>Count: {count}</p>
      </div>
    `;
    const ast = parseTemplate(template);
    const program = generate(ast);

    const html = renderToString(program);
    expect(html).toBe('<div class="card"><h2>DriftJS Engine</h2><p>Count: 42</p></div>');
  });

  it('should correctly handle void elements without closing tags', () => {
    const template = '<div><script>let val = "Drift";</script><img src="avatar.png" alt="Avatar"><input type="text" value={val} /></div>';
    const ast = parseTemplate(template);
    const program = generate(ast);

    const html = renderToStaticMarkup(program);
    expect(html).toBe('<div><img src="avatar.png" alt="Avatar"><input type="text" value="Drift"></div>');
  });

  it('should escape HTML special characters in text and attributes to prevent XSS', () => {
    const template = '<p title={badAttr}>{badText}</p><script>let badAttr = \'"hello" & <world>\'; let badText = "<b>alert(1)</b>";</script>';
    const ast = parseTemplate(template);
    const program = generate(ast);

    const html = renderToString(program);
    expect(html).toBe('<p title="&quot;hello&quot; &amp; &lt;world&gt;">&lt;b&gt;alert(1)&lt;/b&gt;</p>');
  });

  it('should instantiate DriftJSServerVM directly', () => {
    const ast = parseTemplate('<span>Direct VM</span>');
    const program = generate(ast);

    const vm = new DriftJSServerVM(program);
    const html = vm.renderToString();

    expect(html).toBe('<span>Direct VM</span>');
  });
});
