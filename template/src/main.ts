// @ts-ignore
import { mount } from '@driftjs/runtime'
// @ts-ignore
import App from './App.drift'
import './style.css'

const root = document.getElementById('app') as HTMLElement;

mount(App, root);
