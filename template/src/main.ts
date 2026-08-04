// @ts-ignore
import { mount, hydrate } from '@driftjs/dom';
// @ts-ignore
import App from './App.drift';
import './style.css';

const root = document.getElementById('app') as HTMLElement;

// If SSR HTML is already present inside root, hydrate it. Otherwise mount CSR.
if (root.children.length > 0 || root.innerHTML.trim().length > 0) {
  hydrate(App, root);
} else {
  mount(App, root);
}
