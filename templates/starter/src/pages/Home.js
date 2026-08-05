// src/pages/Home.js
// Root page rendered by main.js. Add more files under src/pages/ and wire
// them up with your own routing as the app grows.

import { h } from '../drift-runtime.js';
import Counter from '../components/Counter.js';

export default function Home() {
  return h(
    'main',
    { class: 'container' },
    h('h1', {}, 'Welcome to {{PROJECT_NAME}}'),
    h('p', { class: 'subtitle' }, 'Edit src/pages/Home.js and save to see changes.'),
    Counter()
  );
}
