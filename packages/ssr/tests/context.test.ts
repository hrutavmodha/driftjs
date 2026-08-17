import { describe, it, expect } from 'vitest';
import {
  DriftServerVM,
  renderToString,
  createContext,
  provide,
  inject,
} from '../src/index.js';
import { Opcode, type CompiledModule } from 'driftjs-compiler';

describe('DriftJS Global Context Mechanism (Server VM SSR)', () => {
  it('renders context provided by parent in nested child SSR output', () => {
    interface ThemeValue {
      mode: string;
      brand: string;
    }
    const ThemeContext = createContext<ThemeValue>({ mode: 'light', brand: 'Drift' });

    const childComponent: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.INTERPOLATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: (scope: any) => {
            const theme = ThemeContext.inject();
            scope.brand = theme.brand;
            scope.mode = theme.mode;
          },
        },
        'span',
        { __drift_fn__: (scope: any) => `${scope.brand} - ${scope.mode}` },
      ],
      declaredVars: ['brand', 'mode'],
      scope: {},
    };

    const parentComponent: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 0, 1, // header
        Opcode.CREATE_ELEMENT, 1, 2, // Child
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            ThemeContext.provide({ mode: 'dark', brand: 'DriftJS Ultra' });
          },
        },
        'header',
        'Child',
      ],
      declaredVars: ['Child'],
      scope: {
        Child: childComponent,
      },
    };

    const html = renderToString(parentComponent);
    expect(html).toBe('<header><span>DriftJS Ultra - dark</span></header>');
  });

  it('falls back to default value when no ancestor provides context on server', () => {
    const LocaleContext = createContext('en-US');

    const component: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.INTERPOLATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: (scope: any) => {
            scope.locale = LocaleContext.inject();
          },
        },
        'div',
        { __drift_fn__: (scope: any) => scope.locale },
      ],
      declaredVars: ['locale'],
      scope: {},
    };

    const html = renderToString(component);
    expect(html).toBe('<div>en-US</div>');
  });

  it('supports deep 3-level context propagation without prop-drilling in SSR', () => {
    const SessionContext = createContext({ user: 'Anonymous' });

    // Level 3: Leaf
    const leaf: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.INTERPOLATE_TEXT, 2, 2,
        Opcode.APPEND_CHILD, 1, 2,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: (scope: any) => {
            scope.user = SessionContext.inject().user;
          },
        },
        'p',
        { __drift_fn__: (scope: any) => scope.user },
      ],
      declaredVars: ['user'],
      scope: {},
    };

    // Level 2: Middle (no props passed)
    const middle: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 0, 0, // section
        Opcode.CREATE_ELEMENT, 1, 1, // Leaf
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: ['section', 'Leaf'],
      declaredVars: ['Leaf'],
      scope: { Leaf: leaf },
    };

    // Level 1: Root
    const root: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 0, 1, // main
        Opcode.CREATE_ELEMENT, 1, 2, // Middle
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            SessionContext.provide({ user: 'Drift_Admin_99' });
          },
        },
        'main',
        'Middle',
      ],
      declaredVars: ['Middle'],
      scope: {
        Middle: middle,
      },
    };

    const html = renderToString(root);
    expect(html).toBe('<main><section><p>Drift_Admin_99</p></section></main>');
  });
});
