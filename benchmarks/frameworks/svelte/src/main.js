import { mount } from 'svelte';
import App from './App.svelte';

const container = document.getElementById('main');
if (container) {
  mount(App, { target: container });
}
