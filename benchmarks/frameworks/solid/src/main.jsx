import { render } from 'solid-js/web';
import { App } from './App.jsx';

const container = document.getElementById('main');
if (container) {
  render(() => <App />, container);
}
