// src/drift-runtime.js
// -----------------------------------------------------------------------------
// Minimal runtime bundled with every `drift create` project so a brand-new
// app runs immediately with zero extra dependencies. It provides:
//   - mount(component, target): renders a component function into the DOM
//   - createState(initial): a tiny reactive value that re-renders on change
// This is intentionally small; swap in the full @driftjs/* packages later
// as your app grows (see README.md "Growing beyond the starter runtime").
// -----------------------------------------------------------------------------

export function mount(component, target) {
  const render = () => {
    target.innerHTML = '';
    const node = component();
    target.appendChild(node);
  };
  render();
  return render;
}

export function createState(initial, onChange) {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? next(value) : next;
      onChange?.(value);
    },
  };
}

/** Tiny helper for building DOM nodes without JSX or a compiler step. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(props || {})) {
    if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'class') {
      el.className = val;
    } else {
      el.setAttribute(key, val);
    }
  }
  for (const child of children.flat()) {
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
