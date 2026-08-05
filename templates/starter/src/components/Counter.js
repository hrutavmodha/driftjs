// src/components/Counter.js
// A small reusable component showing DriftJS's createState() reactivity.

import { h, createState } from '../drift-runtime.js';

export default function Counter() {
  const wrapper = h('div', { class: 'counter' });

  const render = () => {
    wrapper.innerHTML = '';
    wrapper.appendChild(
      h(
        'button',
        { class: 'btn', onClick: () => count.set((c) => c + 1) },
        `Count is ${count.get()}`
      )
    );
  };

  const count = createState(0, render);
  render();

  return wrapper;
}
