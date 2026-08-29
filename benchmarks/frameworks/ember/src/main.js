import { renderComponent } from '@ember/renderer';
import { App } from './App.gjs';

renderComponent(App, {
  into: document.getElementById('main') || document.body,
});
