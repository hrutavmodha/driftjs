// @ts-ignore
import { mount, hydrate } from 'driftjs-dom';
// @ts-ignore
import App from './App.drift';
import './style.css';

const root = document.getElementById('app');

const hasSSRContent = Array.from(root?.childNodes || []).some(
  (node) => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim() !== ''
);

if (root) {
  if (hasSSRContent) {
    hydrate(App, root);
  } else {
    mount(App, root);
  }
}
