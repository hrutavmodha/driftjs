// @ts-ignore
import { mount } from '@driftjs/runtime'
// @ts-ignore
import App from './App.drift'
import './style.css'

const app = document.getElementById('app')!;

mount(App, app);

