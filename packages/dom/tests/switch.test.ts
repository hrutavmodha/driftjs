import { describe, it, expect } from 'vitest';
import { DriftClientVM } from '../src/index.js';
import { compile } from '../../compiler/src/index.js';

describe('DriftJS @switch Directive Integration Suite', () => {

  it('renders matching @case branch on initial render', () => {
    const src = `
      <script>
        let role = "admin";
      </script>
      <div>
        @switch role {
          @case "admin" {
            <h1 id="role-heading">Admin Dashboard</h1>
          }
          @case "editor" {
            <h1 id="role-heading">Editor Workspace</h1>
          }
          @default {
            <h1 id="role-heading">Viewer Portal</h1>
          }
        }
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    expect(container.querySelector('#role-heading')?.textContent).toBe('Admin Dashboard');

    document.body.removeChild(container);
  });

  it('reactively transitions between different @case branches and @default on button clicks', () => {
    const src = `
      <script>
        let tab = 'home';
        function setHome() { tab = 'home'; }
        function setProfile() { tab = 'profile'; }
        function setSettings() { tab = 'settings'; }
        function setUnknown() { tab = 'other'; }
      </script>
      <div>
        <button id="btn-home" onclick={setHome}>Home</button>
        <button id="btn-profile" onclick={setProfile}>Profile</button>
        <button id="btn-settings" onclick={setSettings}>Settings</button>
        <button id="btn-other" onclick={setUnknown}>Other</button>

        <div id="content">
          @switch tab {
            @case 'home' {
              <div id="pane">Welcome Home</div>
            }
            @case 'profile' {
              <div id="pane">User Profile</div>
            }
            @case 'settings' {
              <div id="pane">App Settings</div>
            }
            @default {
              <div id="pane">Page Not Found</div>
            }
          }
        </div>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    // Initial: home
    expect(container.querySelector('#pane')?.textContent).toBe('Welcome Home');

    // Switch to profile
    (container.querySelector('#btn-profile') as HTMLButtonElement).click();
    expect(container.querySelector('#pane')?.textContent).toBe('User Profile');

    // Switch to settings
    (container.querySelector('#btn-settings') as HTMLButtonElement).click();
    expect(container.querySelector('#pane')?.textContent).toBe('App Settings');

    // Switch to unknown (triggers @default)
    (container.querySelector('#btn-other') as HTMLButtonElement).click();
    expect(container.querySelector('#pane')?.textContent).toBe('Page Not Found');

    // Switch back to home
    (container.querySelector('#btn-home') as HTMLButtonElement).click();
    expect(container.querySelector('#pane')?.textContent).toBe('Welcome Home');

    document.body.removeChild(container);
  });

  it('renders and preserves multiple sibling elements in @case and @default blocks', () => {
    const src = `
      <script>
        let status = 'loading';
        function setSuccess() { status = 'success'; }
        function setError() { status = 'error'; }
      </script>
      <div>
        <button id="btn-success" onclick={setSuccess}>Success</button>
        <button id="btn-error" onclick={setError}>Error</button>

        <div id="result">
          @switch status {
            @case 'loading' {
              <span class="icon">⏳</span>
              <p class="text">Loading data...</p>
            }
            @case 'success' {
              <span class="icon">✅</span>
              <p class="text">Data loaded successfully!</p>
            }
            @default {
              <span class="icon">❌</span>
              <p class="text">An error occurred.</p>
            }
          }
        </div>
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { document });
    if (root) container.appendChild(root);

    // Initial loading
    expect(container.querySelector('.icon')?.textContent).toBe('⏳');
    expect(container.querySelector('.text')?.textContent).toBe('Loading data...');

    // Switch to success
    (container.querySelector('#btn-success') as HTMLButtonElement).click();
    expect(container.querySelector('.icon')?.textContent).toBe('✅');
    expect(container.querySelector('.text')?.textContent).toBe('Data loaded successfully!');

    // Switch to error (@default)
    (container.querySelector('#btn-error') as HTMLButtonElement).click();
    expect(container.querySelector('.icon')?.textContent).toBe('❌');
    expect(container.querySelector('.text')?.textContent).toBe('An error occurred.');

    document.body.removeChild(container);
  });

  it('evaluates expression with side effects in @switch discriminant exactly once across all cases', () => {
    let callCount = 0;
    const src = `
      <script>
        function computeStatus() {
          callCount++;
          return 'third';
        }
      </script>
      <div>
        @switch computeStatus() {
          @case 'first' {
            <span id="res">First</span>
          }
          @case 'second' {
            <span id="res">Second</span>
          }
          @case 'third' {
            <span id="res">Third</span>
          }
          @default {
            <span id="res">Default</span>
          }
        }
      </div>
    `;

    const mod = compile(src);
    const vm = new DriftClientVM();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = vm.execute(mod, { scope: { get callCount() { return callCount; }, set callCount(v) { callCount = v; } }, document });
    if (root) container.appendChild(root);

    expect(container.querySelector('#res')?.textContent).toBe('Third');
    expect(callCount).toBe(1);

    document.body.removeChild(container);
  });
});
