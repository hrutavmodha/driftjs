import { describe, it, expect, vi } from 'vitest';
import { driftPlugin } from '../src/index.js';
import type { Plugin } from 'vite';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePlugin(opts = {}): Plugin {
  return driftPlugin(opts) as Plugin;
}

/**
 * Calls the plugin's `transform` hook with a `.drift` source string.
 * Returns the generated code string, or null if the plugin skipped the file.
 */
function transform(plugin: Plugin, src: string, id = 'test.drift'): string | null {
  const hook = plugin.transform as (src: string, id: string) => { code: string; map: null } | null;
  const result = hook.call({ error: (msg: string) => { throw new Error(msg); } } as any, src, id);
  return result?.code ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('driftPlugin – identity', () => {
  it('ignores non-.drift files', () => {
    const plugin = makePlugin();
    const result = transform(plugin, '<div>hello</div>', 'app.ts');
    expect(result).toBeNull();
  });

  it('transforms .drift files', () => {
    const plugin = makePlugin();
    const code = transform(plugin, '<p>Hello</p>');
    expect(code).not.toBeNull();
  });
});

describe('driftPlugin – emitted ESM structure', () => {
  it('exports default compiledModule', () => {
    const plugin = makePlugin();
    const code = transform(plugin, '<h1>Drift</h1>')!;

    expect(code).toContain('const compiledModule =');
    expect(code).toContain('export default compiledModule;');
  });

  it('includes the source file path in a comment', () => {
    const plugin = makePlugin();
    const code = transform(plugin, '<div/>', '/project/hero.drift')!;
    expect(code).toContain('hero.drift');
  });

  it('compiledModule has bytecode and constants arrays', () => {
    const plugin = makePlugin();
    const code = transform(plugin, '<div>test</div>')!;
    expect(code).toMatch(/bytecode:\s*(new Uint32Array\(|\[)/);
    expect(code).toMatch(/constants:\s*\[/);
  });
});

describe('driftPlugin – compilation correctness', () => {
  it('compiles a static element without throwing', () => {
    const plugin = makePlugin();
    expect(() => transform(plugin, '<section class="hero"><h1>Title</h1></section>')).not.toThrow();
  });

  it('compiles @if / @else directives', () => {
    const plugin = makePlugin();
    const src = '@if show { <p>Visible</p> } @else { <p>Hidden</p> }';
    expect(() => transform(plugin, src)).not.toThrow();
  });

  it('compiles @for loops', () => {
    const plugin = makePlugin();
    const src = '<ul>@for item in items { <li>{item}</li> }</ul>';
    expect(() => transform(plugin, src)).not.toThrow();
  });

  it('compiles interpolations', () => {
    const plugin = makePlugin();
    const src = '<p>{greeting}, {name}!</p>';
    expect(() => transform(plugin, src)).not.toThrow();
  });

  it('surfaces DriftJS compilation errors as Vite build errors', () => {
    const plugin = makePlugin();
    // Unclosed tag — should throw via this.error()
    expect(() => transform(plugin, '<div>')).toThrow(/DriftJS.*Compilation failed/i);
  });
});

describe('driftPlugin – debug option', () => {
  it('calls console.log when debug: true', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = makePlugin({ debug: true });
    transform(plugin, '<p>Debug</p>');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not call console.log when debug: false (default)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = makePlugin();
    transform(plugin, '<p>Quiet</p>');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('driftPlugin – HMR', () => {
  it('triggers a full-reload for .drift files', () => {
    const plugin = makePlugin();
    const send = vi.fn();
    const invalidateModule = vi.fn();
    const fakeModule = { id: '/project/hero.drift' };

    const ctx = {
      file: '/project/hero.drift',
      server: {
        moduleGraph: {
          getModuleById: vi.fn().mockReturnValue(fakeModule),
          invalidateModule,
        },
        ws: { send },
      },
    };

    const hook = plugin.handleHotUpdate as (arg: any) => void;
    hook(ctx as any);

    expect(invalidateModule).toHaveBeenCalledWith(fakeModule);
    expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: '*' });
  });

  it('ignores non-.drift files in HMR', () => {
    const plugin = makePlugin();
    const send = vi.fn();

    const ctx = {
      file: '/project/app.ts',
      server: { moduleGraph: { getModuleById: vi.fn() }, ws: { send } },
    };

    const hook = plugin.handleHotUpdate as (arg: any) => void;
    hook(ctx as any);
    expect(send).not.toHaveBeenCalled();
  });
});
