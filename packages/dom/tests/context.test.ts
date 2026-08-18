import { describe, it, expect } from 'vitest';
import {
  DriftClientVM,
  createContext,
  provide,
  inject,
  mount,
} from '../src/index.js';
import { Opcode, type CompiledModule } from '../types/index.js';
import { compile } from '../../compiler/src/index.js';

describe('DriftJS Global Context Mechanism (Client VM)', () => {
  const doc = document;

  it('injects default value when no ancestor provides context', () => {
    const ThemeContext = createContext('light-theme', 'Theme');
    expect(ThemeContext.inject()).toBe('light-theme');
    expect(inject(ThemeContext, 'fallback-override')).toBe('fallback-override');
  });

  it('provides and injects typed context token across Parent and Child components', () => {
    interface UserInfo {
      username: string;
      role: string;
    }
    const UserContext = createContext<UserInfo>({ username: 'Guest', role: 'anon' });

    // Child component injects UserContext and displays username
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
            const user = UserContext.inject();
            scope.user = user;
          },
        },
        'span',
        { __drift_fn__: (scope: any) => scope.user.username },
      ],
      declaredVars: ['user'],
      scope: {},
    };

    // Parent component provides UserContext
    const parentComponent: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1, // Child
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            UserContext.provide({ username: 'Alice', role: 'admin' });
          },
        },
        'Child',
      ],
      declaredVars: ['Child'],
      scope: {
        Child: childComponent,
      },
    };

    const vm = new DriftClientVM();
    const node = vm.execute(parentComponent, { document: doc }) as HTMLElement;

    expect(node).toBeDefined();
    expect(node.textContent).toBe('Alice');
  });

  it('supports deep multi-level context inheritance (Grandparent -> Parent -> DeepChild)', () => {
    const ConfigContext = createContext({ apiUrl: 'https://default.io', debug: false });

    // Level 3: DeepChild
    const deepChild: CompiledModule = {
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
            scope.config = ConfigContext.inject();
          },
        },
        'p',
        { __drift_fn__: (scope: any) => scope.config.apiUrl },
      ],
      declaredVars: ['config'],
      scope: {},
    };

    // Level 2: Intermediate Parent (does NOT provide or pass props)
    const middleParent: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 0, 0, // div
        Opcode.CREATE_ELEMENT, 1, 1, // DeepChild
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.RETURN, 0,
      ]),
      constants: ['div', 'DeepChild'],
      declaredVars: ['DeepChild'],
      scope: { DeepChild: deepChild },
    };

    // Level 1: Grandparent (provides ConfigContext)
    const grandparent: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1, // MiddleParent
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            ConfigContext.provide({ apiUrl: 'https://prod.drift.dev', debug: true });
          },
        },
        'MiddleParent',
      ],
      declaredVars: ['MiddleParent'],
      scope: {
        MiddleParent: middleParent,
      },
    };

    const vm = new DriftClientVM();
    const root = vm.execute(grandparent, { document: doc }) as HTMLElement;

    expect(root).toBeDefined();
    expect(root.querySelector('p')?.textContent).toBe('https://prod.drift.dev');
  });

  it('allows intermediate child to override context for its own subtree', () => {
    const ColorContext = createContext('black');

    const deepChild: CompiledModule = {
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
            scope.color = ColorContext.inject();
          },
        },
        'span',
        { __drift_fn__: (scope: any) => scope.color },
      ],
      declaredVars: ['color'],
      scope: {},
    };

    // Subtree 1 overrides ColorContext to 'red'
    const overriddenSubtree: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1, // deepChild
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            ColorContext.provide('red');
          },
        },
        'DeepChild',
      ],
      declaredVars: ['DeepChild'],
      scope: { DeepChild: deepChild },
    };

    // Subtree 2 does not override (inherits 'blue' from root)
    const normalSubtree: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.CREATE_ELEMENT, 0, 0, // deepChild
        Opcode.RETURN, 0,
      ]),
      constants: ['DeepChild'],
      declaredVars: ['DeepChild'],
      scope: { DeepChild: deepChild },
    };

    // Root provides 'blue'
    const rootComponent: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 0, 1, // div
        Opcode.CREATE_ELEMENT, 1, 2, // OverriddenSubtree
        Opcode.CREATE_ELEMENT, 2, 3, // NormalSubtree
        Opcode.APPEND_CHILD, 0, 1,
        Opcode.APPEND_CHILD, 0, 2,
        Opcode.RETURN, 0,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            ColorContext.provide('blue');
          },
        },
        'div',
        'OverriddenSubtree',
        'NormalSubtree',
      ],
      declaredVars: ['OverriddenSubtree', 'NormalSubtree'],
      scope: {
        OverriddenSubtree: overriddenSubtree,
        NormalSubtree: normalSubtree,
      },
    };

    const vm = new DriftClientVM();
    const root = vm.execute(rootComponent, { document: doc }) as HTMLElement;

    const spans = root.querySelectorAll('span');
    expect(spans[0]?.textContent).toBe('red');
    expect(spans[1]?.textContent).toBe('blue');
  });

  it('supports functional provide / inject aliases and cleans up on unmount', () => {
    const AuthContext = createContext({ isAuth: false });
    const vm = new DriftClientVM();

    const parentMod: CompiledModule = {
      bytecode: new Uint32Array([
        Opcode.EXEC_SCRIPT, 0,
        Opcode.CREATE_ELEMENT, 1, 1,
        Opcode.RETURN, 1,
      ]),
      constants: [
        {
          __drift_fn__: () => {
            provide(AuthContext, { isAuth: true });
          },
        },
        'div',
      ],
      scope: {},
    };

    vm.execute(parentMod, { document: doc });
    expect(vm.contextMap.has(AuthContext.id)).toBe(true);

    vm.unmount();
    expect(vm.contextMap.size).toBe(0);
    expect(vm.parentVM).toBeNull();
  });

  it('provides and injects context end-to-end across compiled SFC components', () => {
    const ThemeCtx = createContext({ mode: 'light', color: 'blue' });
    const UserCtx = createContext({ name: 'Guest' });

    // Child SFC
    const childSrc = `
      <script>
        const theme = ThemeCtx.inject();
        const user = UserCtx.inject();
        let mode = theme.mode;
        let name = user.name;
      </script>
      <div class="child-box">
        <span class="user-name">{name}</span>
        <span class="theme-mode">{mode}</span>
      </div>
    `;

    // Parent SFC providing context
    const parentSrc = `
      <script>
        ThemeCtx.provide({ mode: 'dark', color: 'pink' });
        UserCtx.provide({ name: 'Ada Lovelace' });
      </script>
      <div class="parent-box">
        <Child />
      </div>
    `;

    const childMod = compile(childSrc);
    (childMod as any).scope = { ThemeCtx, UserCtx };

    const parentMod = compile(parentSrc);
    (parentMod as any).scope = { ThemeCtx, UserCtx, Child: childMod };

    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(parentMod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('.user-name')?.textContent).toBe('Ada Lovelace');
    expect(container.querySelector('.theme-mode')?.textContent).toBe('dark');

    document.body.removeChild(container);
  });
});
