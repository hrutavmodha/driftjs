import { describe, it, expect, vi } from 'vitest';
import { DriftServerVM, renderToString, renderToStream } from '../src/index.js';
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
        Opcode.CREATE_ELEMENT, 0, 1,
        Opcode.INTERPOLATE_TEXT, 1, 2,
        Opcode.RETURN,
        Opcode.APPEND_CHILD, 0, 1,
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

  it('renders derive() computed values to string correctly in SSR', () => {
    const src = `
      <script>
        let count = 4;
        let double = derive(count * 2);
        let status = derive(() => count > 0 ? 'Positive' : 'ZeroOrNegative');
      </script>
      <div class="result">
        <span>{count}</span>
        <span>{double}</span>
        <span>{status}</span>
      </div>
    `;
    const compiled = compile(src);
    const html = renderToString(compiled);

    expect(html).toContain('<span>4</span>');
    expect(html).toContain('<span>8</span>');
    expect(html).toContain('<span>Positive</span>');
  });

  it('renders custom component children slot to HTML string in SSR', () => {
    const cardSfc = `
      <div class="card">
        <h3>{title}</h3>
        <div class="body">{children}</div>
      </div>
    `;

    const appSfc = `
      <script>
        import Card from './Card.drift';
      </script>
      <section class="container">
        <Card title="Server Rendered Card">
          <p class="server-text">Hello from slotted server children!</p>
        </Card>
      </section>
    `;

    const cardModule = compile(cardSfc);
    const appModule = compile(appSfc);

    const html = renderToString(appModule, {
      scope: { Card: cardModule },
    });

    expect(html).toContain('<h3>Server Rendered Card</h3>');
    expect(html).toContain('<div class="body"><p class="server-text">Hello from slotted server children!</p></div>');
  });

  it('safely renders components containing effect() without executing side effects on server', () => {
    let serverEffectRan = false;
    (globalThis as any).__server_side_effect__ = () => {
      serverEffectRan = true;
    };

    const sfc = `
      <script>
        let message = "SSR Safe";

        effect(() => {
          globalThis.__server_side_effect__();
        });
      </script>
      <div class="box">
        <h1>{message}</h1>
      </div>
    `;

    const compiled = compile(sfc);
    const html = renderToString(compiled);

    expect(html).toContain('<h1>SSR Safe</h1>');
    expect(serverEffectRan).toBe(false);

    delete (globalThis as any).__server_side_effect__;
  });

  describe('Streaming SSR (renderToStream)', () => {
    async function readAllStream(stream: ReadableStream<Uint8Array>): Promise<string> {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }
      result += decoder.decode();
      return result;
    }

    it('streams shell instantly with fallback and out-of-order resolved template chunks', async () => {
      let resolveUser!: (val: any) => void;
      const userPromise = new Promise((res) => {
        resolveUser = res;
      });

      const sfc = `
        <div class="app">
          <h1>Dashboard</h1>
          @async userPromise as user {
            <div class="user-card">Welcome, {user.name}!</div>
          } @fallback {
            <div class="skeleton">Loading user...</div>
          }
        </div>
      `;

      const compiled = compile(sfc);
      let shellReady = false;
      let allReady = false;

      const stream = renderToStream(compiled, {
        scope: { userPromise },
        onShellReady: () => {
          shellReady = true;
        },
        onAllReady: () => {
          allReady = true;
        },
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();

      // Read initial shell chunk
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);
      const shellHtml = decoder.decode(firstChunk.value);

      expect(shellReady).toBe(true);
      expect(shellHtml).toContain('<h1>Dashboard</h1>');
      expect(shellHtml).toContain('<!--drift-async:');
      expect(shellHtml).toContain('<div class="skeleton">Loading user...</div>');
      expect(shellHtml).toContain('function __drift_swap(');

      // Resolve the promise
      resolveUser({ name: 'Alice' });

      // Read async resolved chunk
      const secondChunk = await reader.read();
      expect(secondChunk.done).toBe(false);
      const asyncHtml = decoder.decode(secondChunk.value);

      expect(asyncHtml).toContain('<template id="drift-t-');
      expect(asyncHtml).toContain('<div class="user-card">Welcome, Alice!</div>');
      expect(asyncHtml).toContain('__drift_swap(');

      // End of stream
      const endChunk = await reader.read();
      expect(endChunk.done).toBe(true);
      expect(allReady).toBe(true);
    });

    it('streams multiple async boundaries resolving out-of-order', async () => {
      let resolveSlow!: (val: any) => void;
      let resolveFast!: (val: any) => void;

      const slowPromise = new Promise((res) => {
        resolveSlow = res;
      });
      const fastPromise = new Promise((res) => {
        resolveFast = res;
      });

      const sfc = `
        <div>
          @async slowPromise as slow {
            <p id="slow">{slow}</p>
          } @fallback {
            <p id="slow-loading">Loading slow...</p>
          }

          @async fastPromise as fast {
            <p id="fast">{fast}</p>
          } @fallback {
            <p id="fast-loading">Loading fast...</p>
          }
        </div>
      `;

      const compiled = compile(sfc);
      const stream = renderToStream(compiled, {
        scope: { slowPromise, fastPromise },
      });

      const chunks: string[] = [];
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      // Read shell
      const shellChunk = await reader.read();
      chunks.push(decoder.decode(shellChunk.value));

      // Resolve fast FIRST
      resolveFast('Fast Data');

      const fastChunk = await reader.read();
      chunks.push(decoder.decode(fastChunk.value));
      expect(chunks[1]).toContain('Fast Data');

      // Resolve slow SECOND
      resolveSlow('Slow Data');

      const slowChunk = await reader.read();
      chunks.push(decoder.decode(slowChunk.value));
      expect(chunks[2]).toContain('Slow Data');

      const finalChunk = await reader.read();
      expect(finalChunk.done).toBe(true);
    });

    it('handles @catch branch upon promise rejection in streaming SSR', async () => {
      let rejectPromise!: (reason?: any) => void;
      const failingPromise = new Promise((_, reject) => {
        rejectPromise = reject;
      });
      const onError = vi.fn();

      const sfc = `
        <div>
          @async failingPromise as data {
            <div>{data}</div>
          } @fallback {
            <div>Connecting...</div>
          } @catch err {
            <div class="error-banner">Error: {err.message}</div>
          }
        </div>
      `;

      const compiled = compile(sfc);
      const stream = renderToStream(compiled, {
        scope: { failingPromise },
        onError,
      });

      rejectPromise(new Error('Database offline'));

      const fullHtml = await readAllStream(stream);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(fullHtml).toContain('Connecting...');
      expect(fullHtml).toContain('Error: Database offline');
      expect(fullHtml).toContain('__drift_swap(');
    });

    it('supports Node.js Writable pipe() method', async () => {
      const userPromise = Promise.resolve({ username: 'john_doe' });

      const sfc = `
        <div>
          @async userPromise as u {
            <span>User: {u.username}</span>
          }
        </div>
      `;

      const compiled = compile(sfc);
      const stream = renderToStream(compiled, {
        scope: { userPromise },
      });

      let writtenOutput = '';
      const fakeNodeResponse = {
        write(chunk: Uint8Array) {
          writtenOutput += Buffer.from(chunk).toString('utf-8');
        },
        end() {
          // finished
        },
      };

      stream.pipe(fakeNodeResponse);

      // Wait for resolution
      await new Promise((r) => setTimeout(r, 50));

      expect(writtenOutput).toContain('User: john_doe');
      expect(writtenOutput).toContain('__drift_swap(');
    });

    it('applies CSP nonce to inline scripts when provided in StreamOptions', async () => {
      const dataPromise = Promise.resolve('Secure Data');

      const sfc = `
        <div>
          @async dataPromise as d {
            <span>{d}</span>
          }
        </div>
      `;

      const compiled = compile(sfc);
      const stream = renderToStream(compiled, {
        scope: { dataPromise },
        nonce: 'secret-nonce-123',
      });

      const output = await readAllStream(stream);
      expect(output).toContain('script nonce="secret-nonce-123"');
    });

    it('synchronous renderToString falls back gracefully if promise is unresolved', () => {
      const pendingPromise = new Promise(() => {});

      const sfc = `
        <div>
          @async pendingPromise as p {
            <p>{p}</p>
          } @fallback {
            <p>Fallback Content</p>
          }
        </div>
      `;

      const compiled = compile(sfc);
      const html = renderToString(compiled, { scope: { pendingPromise } });

      expect(html).toContain('Fallback Content');
      expect(html).toContain('<!--drift-async:');
    });
  });
});
